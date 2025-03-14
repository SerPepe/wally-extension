/**
 * Wally Chat Extension - Content Script
 * Injects the Wally chat interface into the current webpage
 */

(function() {
  'use strict';
  
  // State variables
  let chatEnabled = false;
  let isChatOpen = false;
  let currentStreamingMessage = null;
  let chatHistory = [];
  
  // Check if the site is enabled for Wally chat and user is authenticated
  function checkIfEnabled() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ 
        action: 'checkIfSiteEnabled', 
        url: window.location.href 
      }, (response) => {
        if (response.requiresAuth) {
          console.log('Wally: Authentication required');
          resolve(false);
        } else {
          resolve(response.isEnabled);
        }
      });
    });
  }
  
  // Initialize the extension
  async function initialize() {
    try {
      chatEnabled = await checkIfEnabled();
      
      if (chatEnabled) {
        // Only inject if the site is enabled
        injectStyles();
        initializeUI();
        listenForMessages();
        loadChatHistory();
      }
    } catch (error) {
      console.error('Error initializing Wally chat:', error);
    }
  }
  
  // Clean up resources when the extension is disabled
  function cleanup() {
    const container = document.getElementById('wally-chat-container');
    if (container) {
      document.body.removeChild(container);
    }
  }
  
  // Inject the chat interface into the page
  function initializeUI() {
    // Create the main container
    const container = document.createElement('div');
    container.id = 'wally-chat-container';
    
    // Create the overlay button
    const overlay = document.createElement('div');
    overlay.id = 'wally-overlay';
    overlay.addEventListener('click', toggleChat);
    
    // Create the whale icon
    const icon = document.createElement('img');
    icon.src = chrome.runtime.getURL('images/wally-icon.png');
    icon.alt = 'Wally Chat';
    overlay.appendChild(icon);
    
    // Create the chat interface
    const chatInterface = document.createElement('div');
    chatInterface.id = 'wally-chat-interface';
    
    // Create the chat header
    const header = document.createElement('div');
    header.id = 'wally-chat-header';
    
    const headerTitle = document.createElement('div');
    headerTitle.id = 'wally-chat-header-title';
    
    const logo = document.createElement('img');
    logo.id = 'wally-chat-header-logo';
    logo.src = chrome.runtime.getURL('images/wally-icon.png');
    logo.alt = 'Wally Logo';
    
    const title = document.createElement('span');
    title.textContent = 'Wally';
    
    headerTitle.appendChild(logo);
    headerTitle.appendChild(title);
    
    const closeButton = document.createElement('button');
    closeButton.id = 'wally-close-button';
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', closeChat);
    
    header.appendChild(headerTitle);
    header.appendChild(closeButton);
    
    // Create messages container
    const messagesContainer = document.createElement('div');
    messagesContainer.id = 'wally-messages-container';
    
    // Create input container
    const inputContainer = document.createElement('div');
    inputContainer.id = 'wally-input-container';
    
    const messageInput = document.createElement('textarea');
    messageInput.id = 'wally-message-input';
    messageInput.placeholder = 'Type your message...';
    messageInput.rows = 1;
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
      
      // Auto-resize the textarea
      setTimeout(() => {
        messageInput.style.height = 'auto';
        messageInput.style.height = (messageInput.scrollHeight > 120 ? 120 : messageInput.scrollHeight) + 'px';
      }, 0);
    });
    
    const sendButton = document.createElement('button');
    sendButton.id = 'wally-send-button';
    sendButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    sendButton.addEventListener('click', sendMessage);
    
    inputContainer.appendChild(messageInput);
    inputContainer.appendChild(sendButton);
    
    // Assemble the chat interface
    chatInterface.appendChild(header);
    chatInterface.appendChild(messagesContainer);
    chatInterface.appendChild(inputContainer);
    
    // Add everything to the container
    container.appendChild(overlay);
    container.appendChild(chatInterface);
    
    // Add to document
    document.body.appendChild(container);
    
    // Load the Prompt Kit message formatting script
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('prompt-kit-message.js');
    document.head.appendChild(script);
    
    // Add welcome message after a short delay
    setTimeout(() => {
      if (chatHistory.length === 0) {
        const welcomeMessage = "Hi there! I'm Wally, your AI assistant. How can I help you today?";
        // Don't use addMessage to avoid duplicating in history
        const messagesContainer = document.getElementById('wally-messages-container');
        const messageElement = window.createMessage ? 
          window.createMessage('assistant', welcomeMessage) : 
          fallbackCreateMessage('assistant', welcomeMessage);
        messagesContainer.appendChild(messageElement);
        
        // Add to history directly
        chatHistory.push({
          sender: 'assistant',
          content: welcomeMessage
        });
        
        // Save chat history
        saveChatHistory();
      } else {
        // Restore previous chat
        const messagesContainer = document.getElementById('wally-messages-container');
        // Clear any existing messages first
        messagesContainer.innerHTML = '';
        
        chatHistory.forEach(msg => {
          const messageElement = window.createMessage ? 
            window.createMessage(msg.sender, msg.content) : 
            fallbackCreateMessage(msg.sender, msg.content);
          messagesContainer.appendChild(messageElement);
        });
      }
    }, 500);
  }
  
  // Listen for messages from the background script
  function listenForMessages() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'toggleChat') {
        toggleChat();
        sendResponse({ success: true });
      } else if (message.action === 'openChatWithLoading') {
        // Open the chat if not already open
        if (!isChatOpen) {
          toggleChat();
        }
        
        const messagesContainer = document.getElementById('wally-messages-container');
        
        // Clear any existing loading state or system messages
        if (currentStreamingMessage) {
          messagesContainer.removeChild(currentStreamingMessage);
          currentStreamingMessage = null;
        }
        
        const systemMessages = messagesContainer.querySelectorAll('.wally-system-message');
        systemMessages.forEach(message => {
          messagesContainer.removeChild(message);
        });
        
        // Show the loading message
        handleResponseStart();
        
        // Add a system message indicating what's happening
        const statusMessage = document.createElement('div');
        statusMessage.className = 'wally-message wally-system-message';
        statusMessage.textContent = message.message || 'Analyzing content...';
        messagesContainer.appendChild(statusMessage);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        sendResponse({ success: true });
      } else if (message.action === 'askAboutSelection') {
        // Handle context menu selection
        if (!isChatOpen) {
          toggleChat();
        }
        
        // Add the selection as a user message
        addMessage('user', `Help me understand this: "${message.text}"`);
        
        // Prepare the context message with page information
        const pageContext = {
          url: window.location.href,
          title: document.title,
          selection: message.text
        };
        
        // Prepare the messages to send
        const messagesToSend = [
          {
            role: 'system',
            content: `You are Wally, a helpful and cheerful AI assistant. The user is on the page: ${pageContext.title} (${pageContext.url}). They have selected this text: ${pageContext.selection}`
          },
          {
            role: 'user',
            content: `Help me understand this: "${message.text}"`
          }
        ];
        
        // Start the loading animation
        handleResponseStart();
        
        // Send to background script for API request
        chrome.runtime.sendMessage({
          action: 'sendChatRequest',
          messages: messagesToSend
        }, function(response) {
          if (response && response.error) {
            handleResponseError(response.error);
          }
        });
        
        sendResponse({ success: true });
      }
    });
  }
  
  // Toggle the chat interface
  function toggleChat() {
    const chatInterface = document.getElementById('wally-chat-interface');
    
    if (isChatOpen) {
      chatInterface.classList.remove('open');
    } else {
      chatInterface.classList.add('open');
      // Focus the input field when opening
      setTimeout(() => {
        document.getElementById('wally-message-input').focus();
      }, 300);
    }
    
    isChatOpen = !isChatOpen;
  }
  
  // Close the chat interface
  function closeChat() {
    const chatInterface = document.getElementById('wally-chat-interface');
    chatInterface.classList.remove('open');
    isChatOpen = false;
  }
  
  // Send a message to the Wally API
  function sendMessage() {
    const input = document.getElementById('wally-message-input');
    const message = input.value.trim();
    
    if (message === '') return;
    
    // Add the user message to the chat
    addMessage('user', message);
    
    // Clear the input field
    input.value = '';
    input.style.height = 'auto';
    
    // Prepare the context message with page information
    const pageContext = {
      url: window.location.href,
      title: document.title,
      selection: window.getSelection().toString()
    };
    
    // Prepare the messages to send
    const messagesToSend = [
      {
        role: 'system',
        content: `You are Wally, a helpful and cheerful AI assistant. The user is on the page: ${pageContext.title} (${pageContext.url}). ${pageContext.selection ? 'They have selected this text: ' + pageContext.selection : 'No text is currently selected.'}`
      }
    ];
    
    // Add chat history (limited to last 10 messages)
    chatHistory.slice(-10).forEach(msg => {
      messagesToSend.push({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    });
    
    // Start the loading animation
    handleResponseStart();
    
    // Send to background script for API request
    chrome.runtime.sendMessage({
      action: 'sendChatRequest',
      messages: messagesToSend
    }, function(response) {
      if (response && response.error) {
        handleResponseError(response.error);
      }
    });
  }
  
  // Handle start of response streaming
  function handleResponseStart() {
    const messagesContainer = document.getElementById('wally-messages-container');
    
    // Create an empty streaming message element
    currentStreamingMessage = document.createElement('div');
    currentStreamingMessage.className = 'wally-message wally-assistant-message wally-markdown';
    currentStreamingMessage.dataset.streaming = 'true';
    
    messagesContainer.appendChild(currentStreamingMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Add loading dots initially
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'wally-loading';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'wally-loading-dot';
      loadingDiv.appendChild(dot);
    }
    currentStreamingMessage.appendChild(loadingDiv);
  }
  
  // Handle a chunk of streaming response
  function handleResponseChunk(chunk, contentDiv) {
    // Remove loading animation if it exists
    const loadingDiv = contentDiv.querySelector('.wally-loading');
    if (loadingDiv) {
      contentDiv.removeChild(loadingDiv);
    }
    
    // Check for system message to remove when streaming starts
    const messagesContainer = document.getElementById('wally-messages-container');
    const systemMessages = messagesContainer.querySelectorAll('.wally-system-message');
    systemMessages.forEach(message => {
      const text = message.textContent;
      if (text.includes('Analyzing') || text.includes('Translating') || text.includes('Processing')) {
        messagesContainer.removeChild(message);
      }
    });
    
    // Format and append the chunk
    contentDiv.innerHTML = formatMarkdown(chunk);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Handle complete response
  function handleResponseComplete(finalText) {
    // Store the assistant message in history
    chatHistory.push({
      sender: 'assistant',
      content: finalText
    });
    
    // Save chat history
    saveChatHistory();
    
    // Clean up any system messages if they exist
    const messagesContainer = document.getElementById('wally-messages-container');
    const systemMessages = messagesContainer.querySelectorAll('.wally-system-message');
    systemMessages.forEach(message => {
      messagesContainer.removeChild(message);
    });
    
    // Reset streaming message state
    currentStreamingMessage = null;
  }
  
  // Handle error during response
  function handleResponseError(error, isAuthError = false) {
    const messagesContainer = document.getElementById('wally-messages-container');
    
    // Remove loading animation
    if (currentStreamingMessage) {
      messagesContainer.removeChild(currentStreamingMessage);
    }
    
    // Clean up any system messages if they exist
    const systemMessages = messagesContainer.querySelectorAll('.wally-system-message');
    systemMessages.forEach(message => {
      messagesContainer.removeChild(message);
    });
    
    // Check if this is an authentication error
    if (isAuthError || error.includes('Authentication required') || error.includes('log in') || error.includes('unauthorized') || error.includes('Unauthorized')) {
      showLoginPrompt();
    } else {
      // Add regular error message for other errors
      addMessage('assistant', `Sorry, I encountered an error: ${error}. Please try again.`);
    }
  }
  
  // Show a login prompt with options to login or signup
  function showLoginPrompt() {
    const messagesContainer = document.getElementById('wally-messages-container');
    
    // Create a login prompt with improved styling
    const loginPrompt = document.createElement('div');
    loginPrompt.className = 'wally-message wally-assistant-message wally-auth-error';
    
    loginPrompt.innerHTML = `
      <div class="wally-login-prompt">
        <h3>Authentication Required</h3>
        <p>Please log in or sign up to continue using Wally's AI features.</p>
        <div class="wally-auth-buttons">
          <button id="wally-login-button" class="wally-auth-button wally-login">Log In</button>
          <button id="wally-signup-button" class="wally-auth-button wally-signup">Sign Up</button>
        </div>
      </div>
    `;
    
    messagesContainer.appendChild(loginPrompt);
    
    // Add event listeners to the buttons
    document.getElementById('wally-login-button').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openLoginPage', mode: 'login' });
    });
    
    document.getElementById('wally-signup-button').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openLoginPage', mode: 'signup' });
    });
  }
  
  // Add a message to the chat interface
  function addMessage(sender, content) {
    const messagesContainer = document.getElementById('wally-messages-container');
    
    // Create the message element
    const messageElement = window.createMessage ? 
      window.createMessage(sender, content) : 
      fallbackCreateMessage(sender, content);
    
    // Add to DOM
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Add to history if not already streaming
    if (sender !== 'assistant' || !currentStreamingMessage) {
      chatHistory.push({
        sender,
        content
      });
      
      // Save chat history
      saveChatHistory();
    }
  }
  
  // Fallback message formatter if prompt-kit isn't loaded
  function fallbackCreateMessage(sender, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `wally-message wally-${sender}-message`;
    
    // Add wally-markdown class for assistant messages
    if (sender === 'assistant') {
      messageDiv.className += ' wally-markdown';
      messageDiv.innerHTML = formatMarkdown(content);
    } else {
      messageDiv.textContent = content;
    }
    
    return messageDiv;
  }
  
  // Use formatMarkdown function from prompt-kit-message.js
  // The function is already in global scope from the included script
  
  // Save chat history to local storage
  function saveChatHistory() {
    chrome.storage.local.set({
      ['chat_history_' + window.location.hostname]: chatHistory.slice(-50) // Limit to 50 messages
    });
  }
  
  // Load chat history from local storage
  function loadChatHistory() {
    chrome.storage.local.get(['chat_history_' + window.location.hostname], (result) => {
      chatHistory = result['chat_history_' + window.location.hostname] || [];
      
      // Note: We don't need to render the messages here since initializeUI 
      // already handles displaying either the welcome message or chat history.
      // This prevents duplicate messages from appearing.
    });
  }
  
  // Inject CSS link
  function injectStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('wally-styles.css');
    document.head.appendChild(link);
  }
  
  // Listen for streaming response chunks
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'streamingResponse') {
      if (currentStreamingMessage) {
        handleResponseChunk(message.text, currentStreamingMessage);
      }
      sendResponse({ success: true });
    } else if (message.action === 'streamingComplete') {
      if (currentStreamingMessage) {
        handleResponseComplete(message.text);
      }
      sendResponse({ success: true });
    } else if (message.action === 'streamingError') {
      handleResponseError(message.error || 'Unknown error occurred', message.isAuthError);
      sendResponse({ success: true });
    } else if (message.action === 'showLoginPrompt') {
      showLoginPrompt();
      sendResponse({ success: true });
    } else if (message.action === 'cleanup') {
      cleanup();
      sendResponse({ success: true });
    }
  });
  
  // Initialize the extension
  initialize();
})();