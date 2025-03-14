/**
 * Wally Chat Extension - Auth Module
 * Handles authentication with the Wally API
 */

// Auth API URL
const AUTH_API_BASE = 'https://api.meetwally.app/api/auth';

/**
 * Register a new user
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @param {string} fullName - User's full name
 * @returns {Promise<object>} - User data and API key
 */
async function registerUser(email, password, fullName) {
  try {
    const response = await fetch(`${AUTH_API_BASE}/signup/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Registration failed');
    }

    const data = await response.json();
    // Save the API key to local storage
    await chrome.storage.local.set({ 
      wallyApiKey: data.apiKey,
      userData: data.user
    });

    return data;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
}

/**
 * Login existing user
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<object>} - Auth tokens and user data
 */
async function loginUser(email, password) {
  try {
    const response = await fetch(`${AUTH_API_BASE}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Login failed');
    }

    const data = await response.json();
    
    // Calculate token expiration time (default to 1 hour if not provided)
    const expiresIn = data.expires_in || 3600; // seconds
    const expiresAt = Date.now() + (expiresIn * 1000);
    
    // Save auth data to local storage
    await chrome.storage.local.set({
      wallyApiKey: data.apiKey,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: expiresAt,
      userData: data.user
    });

    return data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

/**
 * Refresh the auth token
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<object>} - New auth tokens
 */
async function refreshAuthToken(refreshToken) {
  try {
    const response = await fetch(`${AUTH_API_BASE}/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Token refresh failed');
    }

    const data = await response.json();
    
    // Calculate token expiration time (default to 1 hour if not provided)
    const expiresIn = data.expires_in || 3600; // seconds
    const expiresAt = Date.now() + (expiresIn * 1000);
    
    // Update tokens in storage
    await chrome.storage.local.set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: expiresAt
    });

    return data;
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
}

/**
 * Logout the user
 * @param {string} accessToken - Current access token
 * @returns {Promise<void>}
 */
async function logoutUser(accessToken) {
  try {
    // Call logout API
    const response = await fetch(`${AUTH_API_BASE}/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    // Clear auth data from storage regardless of API response
    await chrome.storage.local.remove([
      'wallyApiKey',
      'accessToken', 
      'refreshToken',
      'tokenExpiresAt',
      'userData'
    ]);

    return response.ok;
  } catch (error) {
    console.error('Logout error:', error);
    // Still clear local data even if API call fails
    await chrome.storage.local.remove([
      'wallyApiKey',
      'accessToken', 
      'refreshToken',
      'userData'
    ]);
    throw error;
  }
}

/**
 * Get current user info
 * @param {string} accessToken - Current access token
 * @returns {Promise<object>} - User data
 */
async function getUserInfo(accessToken) {
  try {
    const response = await fetch(`${AUTH_API_BASE}/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to get user data');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Get user info error:', error);
    throw error;
  }
}

/**
 * Check if the user is authenticated and refresh the token if needed
 * @returns {Promise<boolean>} - Whether user is authenticated
 */
async function isAuthenticated() {
  try {
    // Get auth data from storage
    const authData = await chrome.storage.local.get([
      'wallyApiKey', 
      'accessToken', 
      'refreshToken',
      'tokenExpiresAt'
    ]);
    
    // If no API key, user is not authenticated
    if (!authData.wallyApiKey) {
      return false;
    }
    
    // Check if token is about to expire (within 5 minutes)
    const now = Date.now();
    const expiresAt = authData.tokenExpiresAt || 0;
    const isExpiringSoon = expiresAt && (expiresAt - now < 5 * 60 * 1000);
    
    // If token is expiring soon and we have a refresh token, try to refresh
    if (isExpiringSoon && authData.refreshToken) {
      try {
        await refreshAuthToken(authData.refreshToken);
        return true;
      } catch (error) {
        console.error('Token refresh failed:', error);
        // If refresh fails, we'll check if the current token is still valid
        return now < expiresAt;
      }
    }
    
    // Token exists and is not expiring soon
    return true;
  } catch (error) {
    console.error('Auth check error:', error);
    return false;
  }
}

/**
 * Get the stored API key
 * @returns {Promise<string|null>} - The API key or null if not found
 */
async function getApiKey() {
  try {
    const result = await chrome.storage.local.get(['wallyApiKey']);
    return result.wallyApiKey || null;
  } catch (error) {
    console.error('Get API key error:', error);
    return null;
  }
}