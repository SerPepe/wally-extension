/**
 * Wally Chat Extension - Popup Script
 * Handles the popup UI interactions and settings
 */
document.addEventListener('DOMContentLoaded', function() {
  // Get UI elements
  const globalToggle = document.getElementById('global-toggle');
  const siteToggle = document.getElementById('site-toggle');
  const languageSelect = document.getElementById('language-select');
  const openChatButton = document.getElementById('open-chat-button');
  const clearHistoryButton = document.getElementById('clear-history-button');
  const logoutButton = document.getElementById('logout-button');
  const userInfoElement = document.getElementById('user-info');
  
  // Check authentication first
  checkAuthentication();
  
  // Add event listeners
  globalToggle?.addEventListener('change', handleGlobalToggle);
  siteToggle?.addEventListener('change', handleSiteToggle);
  languageSelect?.addEventListener('change', handleLanguageChange);
  openChatButton?.addEventListener('click', openChat);
  clearHistoryButton?.addEventListener('click', clearHistory);
  logoutButton?.addEventListener('click', handleLogout);
  
  /**
   * Check if user is authenticated and redirect to login if not
   */
  async function checkAuthentication() {
    try {
      // This function is defined in auth.js
      const isUserAuthenticated = await isAuthenticated();
      
      if (!isUserAuthenticated) {
        // Redirect to login page
        window.location.href = 'login.html';
      } else {
        // Load user info
        const userData = await chrome.storage.local.get(['userData']);
        if (userData.userData && userInfoElement) {
          const user = userData.userData;
          userInfoElement.textContent = user.email;
        }
        
        // Initialize the rest of the popup
        initializePopup();
      }
    } catch (error) {
      console.error('Authentication check error:', error);
      window.location.href = 'login.html';
    }
  }
  
  /**
   * Initialize the popup with current settings
   */
  async function initializePopup() {
    try {
      // Get current tab URL
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = tabs[0].url;
      const hostname = new URL(currentUrl).hostname;
      
      // Load settings from storage
      const result = await chrome.storage.local.get(['enabledSites', 'globalEnabled', 'baseLanguage']);
      const globalEnabled = result.globalEnabled ?? true;
      const enabledSites = result.enabledSites ?? {};
      const baseLanguage = result.baseLanguage ?? 'English';
      
      // Set toggle states
      globalToggle.checked = globalEnabled;
      siteToggle.checked = enabledSites[hostname] ?? globalEnabled;
      
      // Disable site toggle if global is off
      siteToggle.disabled = !globalEnabled;
      
      // Set language selection
      languageSelect.value = baseLanguage;
    } catch (error) {
      console.error('Error initializing popup:', error);
    }
  }
  
  /**
   * Handle user logout
   */
  async function handleLogout() {
    try {
      // Get the access token
      const tokenData = await chrome.storage.local.get(['accessToken']);
      
      if (tokenData.accessToken) {
        // This function is defined in auth.js
        await logoutUser(tokenData.accessToken);
      } else {
        // Still clear local data if no token found
        await chrome.storage.local.remove([
          'wallyApiKey',
          'accessToken', 
          'refreshToken',
          'userData'
        ]);
      }
      
      // Redirect to login page
      window.location.href = 'login.html';
    } catch (error) {
      console.error('Logout error:', error);
      
      // Still redirect to login even if there was an error
      window.location.href = 'login.html';
    }
  }
  
  /**
   * Handle language selection changes
   */
  async function handleLanguageChange() {
    try {
      const selectedLanguage = languageSelect.value;
      
      // Update storage
      await chrome.storage.local.set({ baseLanguage: selectedLanguage });
      
      // Show temporary confirmation tooltip
      const originalBg = languageSelect.style.backgroundColor;
      languageSelect.style.backgroundColor = '#e8f5e9';
      languageSelect.style.transition = 'background-color 0.5s';
      
      setTimeout(() => {
        languageSelect.style.backgroundColor = originalBg;
      }, 1000);
    } catch (error) {
      console.error('Error updating language setting:', error);
    }
  }
  
  /**
   * Handle global toggle changes
   */
  async function handleGlobalToggle() {
    try {
      const isEnabled = globalToggle.checked;
      
      // Update storage
      await chrome.storage.local.set({ globalEnabled: isEnabled });
      
      // Update UI
      siteToggle.disabled = !isEnabled;
      if (isEnabled) {
        // When turning global on, enable the current site too
        siteToggle.checked = true;
        
        // Get current site and update it
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentUrl = tabs[0].url;
        const hostname = new URL(currentUrl).hostname;
        
        const result = await chrome.storage.local.get(['enabledSites']);
        const enabledSites = result.enabledSites ?? {};
        enabledSites[hostname] = true;
        
        await chrome.storage.local.set({ enabledSites });
      }
    } catch (error) {
      console.error('Error updating global setting:', error);
    }
  }
  
  /**
   * Handle site-specific toggle changes
   */
  async function handleSiteToggle() {
    try {
      const isEnabled = siteToggle.checked;
      
      // Get current site
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = tabs[0].url;
      const hostname = new URL(currentUrl).hostname;
      
      // Update storage
      const result = await chrome.storage.local.get(['enabledSites']);
      const enabledSites = result.enabledSites ?? {};
      enabledSites[hostname] = isEnabled;
      
      await chrome.storage.local.set({ enabledSites });
      
      // Reload the content script if turning on
      if (isEnabled) {
        chrome.tabs.reload(tabs[0].id);
      } else {
        // Send cleanup message to content script
        chrome.tabs.sendMessage(tabs[0].id, { action: 'cleanup' });
      }
    } catch (error) {
      console.error('Error updating site setting:', error);
    }
  }
  
  /**
   * Open the chat interface on the current tab
   */
  async function openChat() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleChat' });
      
      // Close popup
      window.close();
    } catch (error) {
      console.error('Error opening chat:', error);
    }
  }
  
  /**
   * Clear chat history for all sites
   */
  async function clearHistory() {
    try {
      // Get all storage keys
      const allStorage = await chrome.storage.local.get(null);
      
      // Find all chat history keys
      const chatKeys = Object.keys(allStorage).filter(key => 
        key.startsWith('chat_history_')
      );
      
      // If there are keys to remove
      if (chatKeys.length > 0) {
        // Remove all chat history keys
        await chrome.storage.local.remove(chatKeys);
        
        // Show temporary confirmation
        clearHistoryButton.textContent = 'History Cleared!';
        setTimeout(() => {
          clearHistoryButton.textContent = 'Clear Chat History';
        }, 1500);
      }
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }
});