/**
 * Wally Chat Extension - Login UI Handler
 */

document.addEventListener('DOMContentLoaded', function() {
  // UI Elements
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const authError = document.getElementById('authError');
  const loadingIndicator = document.getElementById('loadingIndicator');
  
  // Login form elements
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  const loginButton = document.getElementById('loginButton');
  
  // Register form elements
  const registerName = document.getElementById('registerName');
  const registerEmail = document.getElementById('registerEmail');
  const registerPassword = document.getElementById('registerPassword');
  const registerButton = document.getElementById('registerButton');
  
  // Check URL parameters for initial mode
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get('mode');
  
  // Set initial tab based on mode parameter
  if (mode === 'signup') {
    registerTab.click(); // This will trigger the click event handler below
  }
  
  // Check if user is already authenticated
  checkAuthStatus();
  
  // Tab switching
  loginTab.addEventListener('click', () => {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    clearError();
  });
  
  registerTab.addEventListener('click', () => {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
    clearError();
  });
  
  // Login form submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!loginEmail.value || !loginPassword.value) {
      showError('Please fill in all fields');
      return;
    }
    
    setLoading(true);
    clearError();
    
    try {
      // Call login API from auth.js
      await loginUser(loginEmail.value, loginPassword.value);
      
      // Redirect to popup.html after successful login
      window.location.href = 'popup.html';
    } catch (error) {
      showError(error.message || 'Login failed. Please try again.');
      setLoading(false);
    }
  });
  
  // Register form submission
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!registerName.value || !registerEmail.value || !registerPassword.value) {
      showError('Please fill in all fields');
      return;
    }
    
    if (registerPassword.value.length < 8) {
      showError('Password must be at least 8 characters');
      return;
    }
    
    setLoading(true);
    clearError();
    
    try {
      // Call register API from auth.js
      await registerUser(registerEmail.value, registerPassword.value, registerName.value);
      
      // Redirect to popup.html after successful registration
      window.location.href = 'popup.html';
    } catch (error) {
      showError(error.message || 'Registration failed. Please try again.');
      setLoading(false);
    }
  });
  
  // Helper functions
  function showError(message) {
    authError.textContent = message;
    authError.style.display = 'block';
  }
  
  function clearError() {
    authError.textContent = '';
    authError.style.display = 'none';
  }
  
  function setLoading(isLoading) {
    if (isLoading) {
      loadingIndicator.style.display = 'block';
      loginButton.disabled = true;
      registerButton.disabled = true;
    } else {
      loadingIndicator.style.display = 'none';
      loginButton.disabled = false;
      registerButton.disabled = false;
    }
  }
  
  async function checkAuthStatus() {
    try {
      const isLoggedIn = await isAuthenticated();
      if (isLoggedIn) {
        // If already logged in, redirect to popup.html
        window.location.href = 'popup.html';
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  }
});