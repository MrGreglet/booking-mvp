// ============================================================
// AUTH-HANDLER.JS - Supabase Auth Flow Handler
// Handles invite, recovery, and token exchange flows
// ============================================================

(() => {
'use strict';

const { showToast } = window.utils;
const storage = window.storage;
const db = window.supabaseClient;

// Get hash/query params
function getAuthParams() {
  const hash = window.location.hash.substring(1);
  const query = window.location.search.substring(1);
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(query);
  
  // Supabase can send params in hash or query
  return {
    type: hashParams.get('type') || queryParams.get('type'),
    access_token: hashParams.get('access_token') || queryParams.get('access_token'),
    refresh_token: hashParams.get('refresh_token') || queryParams.get('refresh_token'),
    error: hashParams.get('error') || queryParams.get('error'),
    error_description: hashParams.get('error_description') || queryParams.get('error_description')
  };
}

// Show view helper
function showView(viewId) {
  document.querySelectorAll('.login-page').forEach(el => el.style.display = 'none');
  const view = document.getElementById(viewId);
  if (view) view.style.display = 'flex';
}

// Show error
function showError(message) {
  document.getElementById('error-message').textContent = message;
  showView('error-view');
}

// Handle password form submission
async function handleSetPassword(e) {
  e.preventDefault();
  
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const submitBtn = document.getElementById('submit-btn');
  const statusEl = document.getElementById('status-message');
  
  // Validation
  if (newPassword.length < 8) {
    statusEl.innerHTML = '<div style="color: var(--danger); margin-top: 1rem;">Password must be at least 8 characters</div>';
    return;
  }
  
  if (newPassword !== confirmPassword) {
    statusEl.innerHTML = '<div style="color: var(--danger); margin-top: 1rem;">Passwords do not match</div>';
    return;
  }
  
  // Disable form
  submitBtn.disabled = true;
  submitBtn.textContent = 'Setting password...';
  statusEl.innerHTML = '';
  
  try {
    // Update password
    await storage.changePassword(newPassword);
    
    // Clear first_login flag
    try {
      await storage.markPasswordChanged();
    } catch (metadataError) {
      console.error('Failed to clear first_login flag:', metadataError);
      statusEl.innerHTML = '<div style="color: var(--danger); margin-top: 1rem;">Password set, but profile update failed. Please contact support.</div>';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Set Password';
      return;
    }
    
    // Success - show message and redirect
    statusEl.innerHTML = '<div style="color: var(--success); margin-top: 1rem;">✓ Password set successfully! Redirecting...</div>';
    
    // Clear hash/query params before redirect
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    
    // Redirect to main app
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1500);
    
  } catch (error) {
    console.error('Password update error:', error);
    statusEl.innerHTML = `<div style="color: var(--danger); margin-top: 1rem;">${error.message || 'Failed to set password'}</div>`;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Set Password';
  }
}

// Main initialization
async function init() {
  const params = getAuthParams();
  
  // Check for errors from Supabase
  if (params.error) {
    console.error('Auth error:', params.error, params.error_description);
    showError(params.error_description || 'Authentication failed. Please try again.');
    return;
  }
  
  // Check for auth flow types
  const flowType = params.type; // 'invite', 'recovery', 'signup', etc.
  const hasTokens = params.access_token || params.refresh_token;
  
  console.log('Auth flow detected:', { type: flowType, hasTokens });
  
  // If no auth params at all, check if already logged in
  if (!flowType && !hasTokens) {
    try {
      await storage.loadAll();
      const user = storage.getCurrentUser();
      
      if (user) {
        // Already logged in, redirect to main app
        console.log('User already authenticated, redirecting...');
        window.location.href = 'index.html';
        return;
      }
    } catch (err) {
      console.warn('Session check failed:', err);
    }
    
    // No session, no auth params - this page shouldn't be accessed directly
    showError('This page is for completing account setup. Please use your invite or reset link.');
    return;
  }
  
  // Handle invite or recovery flow
  if (flowType === 'invite' || flowType === 'recovery') {
    try {
      // Supabase automatically exchanges tokens on page load via onAuthStateChange
      // Wait a moment for that to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if we have a session now
      const { data: { session }, error: sessionError } = await db.auth.getSession();
      
      if (sessionError || !session) {
        console.error('Session error:', sessionError);
        showError('Link expired or invalid. Please request a new invite or reset link.');
        return;
      }
      
      console.log('Session established for user:', session.user.email);
      
      // Show password form
      if (flowType === 'invite') {
        document.getElementById('form-title').textContent = 'Welcome! Set Your Password';
        document.getElementById('form-subtitle').textContent = 'Create a secure password to complete your account setup.';
      } else if (flowType === 'recovery') {
        document.getElementById('form-title').textContent = 'Reset Your Password';
        document.getElementById('form-subtitle').textContent = 'Choose a new secure password for your account.';
      }
      
      showView('set-password-view');
      
      // Bind form handler
      const form = document.getElementById('set-password-form');
      form.onsubmit = handleSetPassword;
      
    } catch (error) {
      console.error('Auth flow error:', error);
      showError('Failed to process authentication. Please try again or contact support.');
    }
  } else if (hasTokens) {
    // Has tokens but unknown type - try to establish session anyway
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const { data: { session } } = await db.auth.getSession();
      
      if (session) {
        console.log('Session established, redirecting to app...');
        window.location.href = 'index.html';
      } else {
        showError('Unable to establish session. Please try again.');
      }
    } catch (error) {
      console.error('Token exchange error:', error);
      showError('Authentication failed. Please request a new link.');
    }
  } else {
    showError('Invalid authentication link. Please request a new one.');
  }
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const name = window.CONFIG?.branding?.appName || 'Booking System';
  document.title = name + ' - Complete Setup';
  await init();
});

})();
