/**
 * Wally Chat Extension - Background Script
 * Handles API calls to the Wally API and communicates with the content script
 */

// Import isAuthenticated function from auth.js
importScripts('auth.js');

// Listen for installation and set default settings
chrome.runtime.onInstalled.addListener(() => {
  console.log('Wally Chat Extension installed');

  // Create context menu item for selected text
  chrome.contextMenus.create({
    id: "askWallyAboutSelection",
    title: "Ask Wally about this",
    contexts: ["selection"]
  });

  // Create context menu items
  chrome.contextMenus.create({
    id: "summarize-page",
    title: "Summarize this page with Wally",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "summarize-selection",
    title: "Summarize selection with Wally",
    contexts: ["selection"]
  });
  
  // Create context menu item for images
  chrome.contextMenus.create({
    id: "analyze-image",
    title: "Analyze this image with Wally",
    contexts: ["image"]
  });
  
  // Create context menu item for translation
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "Translate with Wally",
    contexts: ["selection"]
  });
  
  // Set default language for translation (English)
  chrome.storage.local.get(['baseLanguage'], (result) => {
    if (!result.baseLanguage) {
      chrome.storage.local.set({ baseLanguage: 'English' });
    }
  });
});

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendChatRequest') {
    handleChatRequest(message.messages, sender.tab.id);
    return true; // Keep the messaging channel open for async response
  } else if (message.action === 'checkIfSiteEnabled') {
    checkIfSiteEnabled(message.url, sendResponse);
    return true; // Keep the messaging channel open for async response
  } else if (message.action === 'openExtensionPopup') {
    // Open the extension popup when there's an authentication error
    chrome.action.openPopup();
    return false; // No need to keep the messaging channel open
  } else if (message.action === 'openLoginPage') {
    // Open the login page in a new tab with the specified mode (login/signup)
    const loginUrl = chrome.runtime.getURL('login.html');
    const urlWithMode = message.mode === 'signup' ? 
      `${loginUrl}?mode=signup` : 
      `${loginUrl}?mode=login`;
    
    chrome.tabs.create({ url: urlWithMode });
    return false; // No need to keep the messaging channel open
  }
});

// Listen for browser action clicks
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'toggleChat' });
});

// Listen for context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "summarize-page") {
    // Get page content and summarize
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: getPageContent
    }, (results) => {
      if (results && results[0] && results[0].result) {
        const pageContent = results[0].result;
        const pageContext = {
          url: tab.url,
          title: tab.title
        };

        sendSummarizeRequest(pageContent, pageContext, tab.id);
      }
    });
  } else if (info.menuItemId === "summarize-selection") {
    // Summarize the selected text
    const selectedText = info.selectionText;
    const pageContext = {
      url: tab.url,
      title: tab.title
    };

    sendSummarizeRequest(selectedText, pageContext, tab.id);
  } else if (info.menuItemId === "askWallyAboutSelection" && info.selectionText) {
    // Send message to content script with the selected text
    chrome.tabs.sendMessage(tab.id, {
      action: 'askAboutSelection',
      text: info.selectionText
    });
  } else if (info.menuItemId === "analyze-image" && info.srcUrl) {
    // Analyze the image
    analyzeImage(info.srcUrl, tab.id);
  } else if (info.menuItemId === "translate-selection" && info.selectionText) {
    // Translate the selected text
    translateText(info.selectionText, tab.id);
  }
});

/**
 * Checks if Wally is enabled for the current site and if user is authenticated
 * @param {string} url - The URL to check
 * @param {function} sendResponse - Callback function to send response
 */
async function checkIfSiteEnabled(url, sendResponse) {
  try {
    // First check if user is authenticated using enhanced function
    const isAuth = await isAuthenticated();
    
    if (!isAuth) {
      sendResponse({ 
        isEnabled: false, 
        requiresAuth: true,
        message: 'Authentication required. Please log in to use Wally.'
      });
      return;
    }
    
    // Then check site settings
    const hostname = new URL(url).hostname;
    const result = await chrome.storage.local.get(['enabledSites', 'globalEnabled']);
    const globalEnabled = result.globalEnabled ?? true;
    const enabledSites = result.enabledSites ?? {};

    // Check if site is explicitly enabled/disabled or use global setting
    const isEnabled = enabledSites[hostname] ?? globalEnabled;
    sendResponse({ isEnabled, requiresAuth: false });
  } catch (error) {
    console.error('Error checking if site is enabled:', error);
    sendResponse({ 
      isEnabled: false,
      requiresAuth: true,
      message: 'Failed to check settings. Please try again.'
    });
  }
}

/**
 * Handles chat requests from the content script
 * @param {Array} messages - Array of message objects
 * @param {number} tabId - ID of the current tab
 */
async function handleChatRequest(messages, tabId) {
  try {
    // Check authentication before attempting to stream
    const isAuth = await isAuthenticated();
    if (!isAuth) {
      throw new Error('Authentication required. Please log in to use Wally.');
    }
    
    // Stream the response from the API
    await streamResponse(messages, tabId);
  } catch (error) {
    console.error('Error handling chat request:', error);
    
    // Check if this is an authentication error
    const isAuthError = error.message && 
      (error.message.includes('Authentication required') || 
       error.message.includes('unauthorized') || 
       error.message.includes('401'));
    
    // Send error back to content script
    chrome.tabs.sendMessage(tabId, {
      action: 'streamingError',
      error: error.message || 'Unknown error occurred',
      isAuthError: isAuthError
    });
    
    // If authentication error, prompt to open extension popup
    if (isAuthError) {
      chrome.tabs.sendMessage(tabId, {
        action: 'showLoginPrompt'
      });
    }
  }
}

/**
 * Extract content from the current page
 * This function runs in the context of the page
 * @returns {string} - The main content of the page
 */
function getPageContent() {
  // Try to get the main content of the page
  // This is a simplified approach - real implementation may need more sophisticated content extraction

  // Remove script tags to clean up the content
  const scripts = document.querySelectorAll('script, style');
  for (const script of scripts) {
    script.remove();
  }

  // Get the page's main content
  let content = '';

  // Try to get content from article tags first
  const articles = document.querySelectorAll('article');
  if (articles.length > 0) {
    for (const article of articles) {
      content += article.textContent + '\n\n';
    }
  } else {
    // Try to get content from main tag
    const mainContent = document.querySelector('main');
    if (mainContent) {
      content = mainContent.textContent;
    } else {
      // Fallback to body content, excluding navigation and footer
      const body = document.body;

      // Try to exclude navigation, header, footer, etc.
      const excludeTags = ['nav', 'header', 'footer', 'aside'];
      for (const tag of excludeTags) {
        const elements = document.querySelectorAll(tag);
        for (const element of elements) {
          element.remove();
        }
      }

      content = document.body.textContent;
    }
  }

  // Clean up the content (remove extra spaces, etc.)
  content = content.replace(/\s+/g, ' ').trim();

  // Limit the content to a reasonable size (e.g., 50,000 characters)
  if (content.length > 50000) {
    content = content.substring(0, 50000) + '... (content truncated)';
  }

  return content;
}

/**
 * Send a request to summarize content
 * @param {string} content - The content to summarize
 * @param {object} pageContext - Context object with page URL and title
 * @param {number} tabId - ID of the current tab
 */
async function sendSummarizeRequest(content, pageContext, tabId) {
  try {
    // Check authentication status with enhanced function
    const isAuth = await isAuthenticated();
    if (!isAuth) {
      throw new Error('Authentication required. Please log in to use Wally.');
    }
    
    // Get API key for request
    const apiKeyData = await chrome.storage.local.get(['wallyApiKey']);
    const apiKey = apiKeyData.wallyApiKey;
    
    // Show loading indicator in the content script
    chrome.tabs.sendMessage(tabId, { 
      action: 'openChatWithLoading',
      message: 'Analyzing content...'
    });

    // Prepare system message
    const systemMessage = {
      role: 'system',
      content: `You are Wally, a helpful AI assistant. The user wants you to summarize the content from the page: ${pageContext.title} (${pageContext.url}). Provide a clear, concise summary of the main points in a few sentences.`
    };

    // Prepare user message with content to summarize
    const userMessage = {
      role: 'user',
      content: `Summarize this for me in a few sentences: ${content}`
    };

    // Send to the API through our existing message handling
    await streamResponse([systemMessage, userMessage], tabId);
  } catch (error) {
    console.error('Error summarizing content:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'streamingError',
      error: error.message || 'Failed to summarize content'
    });
  }
}

/**
 * Analyze an image using the Wally Vision API
 * @param {string} imageUrl - URL of the image to analyze
 * @param {number} tabId - ID of the current tab
 */
async function analyzeImage(imageUrl, tabId) {
  try {
    // Show loading indicator in the content script
    chrome.tabs.sendMessage(tabId, { 
      action: 'openChatWithLoading',
      message: 'Analyzing image...'
    });
    
    // Create message content with image
    const messageContent = [
      {
        type: "text",
        text: "Please analyze this image and tell me what you see in detail."
      },
      {
        type: "image_url",
        image_url: {
          url: imageUrl
        }
      }
    ];
    
    // Start the streaming process to handle API response
    const messageToSend = [
      {
        role: "user",
        content: messageContent
      }
    ];
    
    // Check authentication status with enhanced function
    const isAuth = await isAuthenticated();
    if (!isAuth) {
      throw new Error('Authentication required. Please log in to use Wally.');
    }
    
    // Get API key for request
    const apiKeyData = await chrome.storage.local.get(['wallyApiKey']);
    const apiKey = apiKeyData.wallyApiKey;
    
    // Use stream response with the vision model
    const response = await fetch('https://api.meetwally.app/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'wally-vision',
        messages: messageToSend
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let completeText = '';

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        // Send the final complete text
        chrome.tabs.sendMessage(tabId, {
          action: 'streamingComplete',
          text: completeText
        });
        break;
      }

      // Decode the chunk
      const chunk = decoder.decode(value, { stream: true });

      // Process the chunk line by line
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            // Extract the JSON data after "data: "
            const jsonText = line.substring(5).trim();
            if (jsonText === '[DONE]') continue;

            const jsonData = JSON.parse(jsonText);

            if (jsonData.text) {
              completeText += jsonData.text;

              // Send the updated text to the content script
              chrome.tabs.sendMessage(tabId, {
                action: 'streamingResponse',
                text: completeText
              });
            }
          } catch (e) {
            console.error('Error parsing streaming response:', e, line);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error analyzing image:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'streamingError',
      error: error.message || 'Failed to analyze image'
    });
  }
}

/**
 * Translate text using the Wally API
 * @param {string} text - Text to translate
 * @param {number} tabId - ID of the current tab
 */
async function translateText(text, tabId) {
  try {
    // Show loading indicator in the content script
    chrome.tabs.sendMessage(tabId, { 
      action: 'openChatWithLoading',
      message: 'Translating text...'
    });
    
    // Get user's base language setting
    const result = await chrome.storage.local.get(['baseLanguage']);
    const baseLanguage = result.baseLanguage || 'English';
    
    // Prepare messages for translation
    const messagesToSend = [
      {
        role: "user",
        content: `Translate this text to ${baseLanguage}: ${text}`
      }
    ];
    
    // Check authentication status with enhanced function
    const isAuth = await isAuthenticated();
    if (!isAuth) {
      throw new Error('Authentication required. Please log in to use Wally.');
    }
    
    // Get API key for request
    const apiKeyData = await chrome.storage.local.get(['wallyApiKey']);
    const apiKey = apiKeyData.wallyApiKey;
    
    // Create the translation request using streaming
    const response = await fetch('https://api.meetwally.app/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'wally',
        messages: messagesToSend
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let completeText = '';

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        // Send the final complete text
        chrome.tabs.sendMessage(tabId, {
          action: 'streamingComplete',
          text: completeText
        });
        break;
      }

      // Decode the chunk
      const chunk = decoder.decode(value, { stream: true });

      // Process the chunk line by line
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            // Extract the JSON data after "data: "
            const jsonText = line.substring(5).trim();
            if (jsonText === '[DONE]') continue;

            const jsonData = JSON.parse(jsonText);

            if (jsonData.text) {
              completeText += jsonData.text;

              // Send the updated text to the content script
              chrome.tabs.sendMessage(tabId, {
                action: 'streamingResponse',
                text: completeText
              });
            }
          } catch (e) {
            console.error('Error parsing streaming response:', e, line);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error translating text:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'streamingError',
      error: error.message || 'Failed to translate text'
    });
  }
}

/**
 * Streams the response from the Wally API
 * @param {Array} messages - Array of message objects
 * @param {number} tabId - ID of the current tab
 */
async function streamResponse(messages, tabId) {
  try {
    // Authentication should already be checked in handleChatRequest before calling this function
    // But we'll get the API key for the request
    const apiKeyData = await chrome.storage.local.get(['wallyApiKey']);
    const apiKey = apiKeyData.wallyApiKey;
    
    const response = await fetch('https://api.meetwally.app/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'ask-wally',
        messages: messages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let completeText = '';

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        // Send the final complete text
        chrome.tabs.sendMessage(tabId, {
          action: 'streamingComplete',
          text: completeText
        });
        break;
      }

      // Decode the chunk
      const chunk = decoder.decode(value, { stream: true });

      // Process the chunk line by line
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            // Extract the JSON data after "data: "
            const jsonText = line.substring(5).trim();
            if (jsonText === '[DONE]') continue;

            const jsonData = JSON.parse(jsonText);

            if (jsonData.text) {
              completeText += jsonData.text;

              // Send the updated text to the content script
              chrome.tabs.sendMessage(tabId, {
                action: 'streamingResponse',
                text: completeText
              });
            }
          } catch (e) {
            console.error('Error parsing streaming response:', e, line);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error with streaming response:', error);
    throw error;
  }
}