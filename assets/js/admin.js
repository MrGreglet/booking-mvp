// ============================================================
// ADMIN.JS - Admin Dashboard (Auth-based)
// Requires user to be in admin_users table
// ============================================================

(() => {
'use strict';

const {
  formatTimeHM, formatDateYMD, formatDateWeekday, formatDateShort, getDayName, isSameDay,
  getISOWeek, getWeekStart, addDays, addMinutes,
  showToast, openSlidein, closeSlidein
} = window.utils;

const storage = window.storage;

let currentUser = null;
let isAdmin = false;
let currentPanel = 'invites';

// ============================================================
// AUTHENTICATION
// ============================================================

async function checkAdminAccess() {
  currentUser = storage.getCurrentUser();
  isAdmin = storage.getIsAdmin();
  
  const loginPanel = document.getElementById('admin-login');
  const appPanel = document.getElementById('admin-app');
  
  if (!currentUser || !isAdmin) {
    // Show login
    loginPanel.style.display = 'flex';
    appPanel.style.display = 'none';
    return false;
  }
  
  // Show admin app
  loginPanel.style.display = 'none';
  appPanel.style.display = 'block';
  return true;
}

async function handleAdminLogin(e) {
  e.preventDefault();
  
  const emailInput = document.getElementById('admin-email');
  const passwordInput = document.getElementById('admin-password');
  const submitBtn = document.getElementById('admin-login-btn');
  const statusEl = document.getElementById('admin-login-status');
  const errorEl = document.getElementById('admin-login-error');
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  // Disable form
  emailInput.disabled = true;
  passwordInput.disabled = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in...';
  statusEl.textContent = '';
  errorEl.textContent = '';
  
  console.log('Attempting login for:', email);
  
  try {
    // Sign in
    const result = await storage.signInWithPassword(email, password);
    
    // Wait for auth state to settle
    await new Promise(r => setTimeout(r, 1000));
    
    // Verify we're logged in
    let currentUser = storage.getCurrentUser();
    if (!currentUser) {
      throw new Error('Login failed - no user session');
    }
    
    // Check admin status first (most important)
    let isAdmin = storage.getIsAdmin();
    
    if (!isAdmin) {
      await storage.signOut();
      throw new Error('Admin access required - this email is not in the admin_users table');
    }
    
    console.log('Admin verified, loading data...');
    
    // Load data without re-initializing auth
    try {
      await storage.loadSettings();
    } catch (err) {
      console.warn('Could not load settings');
    }
    
    try {
      await storage.loadBookings();
    } catch (err) {
      console.warn('Could not load bookings');
    }
    
    try {
      await storage.loadProfiles();
    } catch (err) {
      console.warn('Could not load profiles');
    }
    
    try {
      await storage.loadAllowedUsers();
    } catch (err) {
      console.warn('Could not load allowed users');
    }
    
    console.log('Data loaded successfully');
    
    // Admin verified - NOW update UI
    const loginPanel = document.getElementById('admin-login');
    const appPanel = document.getElementById('admin-app');
    if (loginPanel) loginPanel.style.display = 'none';
    if (appPanel) appPanel.style.display = 'block';
    
    // Setup navigation and render initial panel
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.onclick = () => switchPanel(btn.getAttribute('data-panel'));
    });
    document.getElementById('logout-btn').onclick = handleLogout;
    switchPanel('invites');
    
  } catch (error) {
    const errMsg = (error?.message != null && String(error.message)) ? error.message : 'Login failed';
    errorEl.textContent = errMsg;
    
    // Reset form and ensure login panel is visible
    const loginPanel = document.getElementById('admin-login');
    const appPanel = document.getElementById('admin-app');
    if (loginPanel) loginPanel.style.display = 'flex';
    if (appPanel) appPanel.style.display = 'none';
    
    emailInput.disabled = false;
    passwordInput.disabled = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Login';
  }
}

async function handleLogout() {
  await storage.signOut();
  location.reload();
}


// ============================================================
// PANEL NAVIGATION
// ============================================================

function switchPanel(panelName) {
  currentPanel = panelName;
  
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-panel') === panelName);
  });
  
  // Show/hide panels
  document.querySelectorAll('.admin-panel').forEach(panel => {
    panel.style.display = panel.id === `admin-panel-${panelName}` ? 'block' : 'none';
  });
  
  // Render active panel
  switch (panelName) {
    case 'invites':
      renderInvitesPanel();
      break;
    case 'profiles':
      renderProfilesPanel();
      break;
    case 'bookings':
      renderBookingsPanel();
      break;
    case 'settings':
      renderSettingsPanel();
      break;
  }
}

// ============================================================
// INVITES PANEL
// ============================================================

function renderInvitesPanel() {
  const panel = document.getElementById('admin-panel-invites');
  const allowedUsers = storage.getAllowedUsers();
  
  let html = `
    <div class="panel-header">
      <h2>Invited Users</h2>
    </div>
    <form id="invite-form-inline" class="admin-inline-form">
      <div class="form-group">
        <label for="invite-email-inline">Email Address</label>
        <input type="email" id="invite-email-inline" placeholder="user@example.com" required autocomplete="email">
      </div>
      <p class="form-hint">A temporary password will be generated. The user must change it on first login.</p>
      <button type="submit" class="primary">Create User</button>
    </form>
  `;
  
  if (allowedUsers.length === 0) {
    html += `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No invited users yet.</div>`;
  } else {
    html += `
      <table class="table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Invited At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    for (const user of allowedUsers) {
      const invitedDate = new Date(user.created_at);
      html += `
        <tr>
          <td>${user.email}</td>
          <td>${formatDateYMD(invitedDate)} ${formatTimeHM(invitedDate)}</td>
          <td>
            <button class="action-btn danger remove-invite-btn" data-email="${user.email}">Remove</button>
          </td>
        </tr>
      `;
    }
    
    html += `</tbody></table>`;
  }
  
  panel.innerHTML = html;
  
  // Bind events
  const inviteForm = document.getElementById('invite-form-inline');
  if (inviteForm) {
    inviteForm.onsubmit = handleInviteUserInline;
  }
  
  document.querySelectorAll('.remove-invite-btn').forEach(btn => {
    btn.onclick = () => confirmRemoveInvite(btn.getAttribute('data-email'));
  });
}

async function handleInviteUserInline(e) {
  e.preventDefault();
  
  const emailInput = document.getElementById('invite-email-inline');
  const form = document.getElementById('invite-form-inline');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  const email = emailInput.value.trim().toLowerCase();
  
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';
  }
  
  try {
    // Generate temporary password
    const tempPassword = generateTempPassword();
    
    // Create user via signUp (will auto-confirm)
    const { data: signUpData, error: signUpError } = await window.supabaseClient.auth.signUp({
      email: email,
      password: tempPassword,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          first_login: true
        }
      }
    });
    
    // Even if rate limit error, user might still be created
    // Only throw if it's NOT a rate limit error and NOT "already registered"
    if (signUpError && 
        !signUpError.message.includes('rate limit') && 
        !signUpError.message.includes('already registered')) {
      throw new Error(signUpError.message);
    }
    
    // Add to allowed_users
    await storage.inviteUser(email);
    
    // Show success with credentials (ignore rate limit errors)
    showCredentialsDialog(email, tempPassword);
    renderInvitesPanel();
    if (emailInput) emailInput.value = '';
    
  } catch (error) {
    showToast(error.message || 'Failed to create user', 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create User';
    }
  }
}

function showManualSetupDialog(email, password) {
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2 style="color: var(--accent);">⚠️ Manual Setup Required</h2>`;
  html += `<p style="margin: 1rem 0;">User added to allowlist. You need to create their account manually:</p>`;
  html += `<div style="background: var(--bg-glass); padding: 1.5rem; border-radius: var(--radius-md); margin: 1.5rem 0;">`;
  html += `<h3 style="margin-bottom: 1rem;">Steps:</h3>`;
  html += `<ol style="margin-left: 1.5rem; line-height: 1.8;">`;
  html += `<li>Go to Supabase Dashboard → Authentication → Users</li>`;
  html += `<li>Click "Add User"</li>`;
  html += `<li>Use email: <code style="background: rgba(0,0,0,0.3); padding: 0.2rem 0.5rem; border-radius: 4px;">${email}</code></li>`;
  html += `<li>Set password: <code style="background: rgba(0,0,0,0.3); padding: 0.2rem 0.5rem; border-radius: 4px;">${password}</code></li>`;
  html += `<li>Enable "Auto Confirm User"</li>`;
  html += `</ol>`;
  html += `</div>`;
  html += `<div class="form-actions">`;
  html += `<button class="primary" id="copy-setup-btn">Copy Password</button>`;
  html += `<a href="https://supabase.com/dashboard/project/qkjcqtsacuspfdslgfxj/auth/users" target="_blank" class="primary" style="display: inline-block; padding: 0.75rem 1.5rem; text-decoration: none;">Open Supabase Dashboard</a>`;
  html += `<button class="secondary close-dialog-btn">Close</button>`;
  html += `</div>`;
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.querySelector('.close-dialog-btn').onclick = closeSlidein;
  
  document.getElementById('copy-setup-btn').onclick = () => {
    navigator.clipboard.writeText(password).then(() => {
      showToast('Password copied!', 'success');
    });
  };
}

function generateTempPassword() {
  // Generate a random 12-character password
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function showCredentialsDialog(email, password) {
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2 style="color: var(--success);">✓ User Created</h2>`;
  html += `<p style="margin: 1rem 0;">Send these login credentials to the user:</p>`;
  html += `<div style="background: var(--bg-glass); padding: 1.5rem; border-radius: var(--radius-md); margin: 1.5rem 0; font-family: monospace;">`;
  html += `<div style="margin-bottom: 1rem;"><strong>Email:</strong><br>${email}</div>`;
  html += `<div><strong>Temporary Password:</strong><br>${password}</div>`;
  html += `</div>`;
  html += `<p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">⚠️ Save this password - it won't be shown again! The user must change it on first login.</p>`;
  html += `<div class="form-actions">`;
  html += `<button class="primary" id="copy-credentials-btn">Copy to Clipboard</button>`;
  html += `<button class="secondary close-dialog-btn">Close</button>`;
  html += `</div>`;
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.querySelector('.close-dialog-btn').onclick = closeSlidein;
  
  document.getElementById('copy-credentials-btn').onclick = () => {
    const text = `Studio94 Booking Login\n\nEmail: ${email}\nTemporary Password: ${password}\n\nPlease change your password after first login.`;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Credentials copied to clipboard!', 'success');
    });
  };
}

function confirmRemoveInvite(email) {
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2 style="color: var(--danger);">Remove Invitation</h2>`;
  html += `<p style="margin: 1.5rem 0;">Are you sure you want to remove access for <b>${email}</b>?</p>`;
  html += `<p style="color: var(--text-muted); font-size: 0.9rem;">They will no longer be able to log in or book sessions.</p>`;
  html += `<div class="form-actions">
    <button class="danger" id="confirm-remove-btn">Remove Access</button>
    <button class="secondary" id="cancel-remove-btn">Cancel</button>
  </div>`;
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.getElementById('cancel-remove-btn').onclick = closeSlidein;
  document.getElementById('confirm-remove-btn').onclick = async () => {
    try {
      await storage.removeInvite(email);
      showToast('Access removed', 'success');
      closeSlidein();
      renderInvitesPanel();
    } catch (error) {
      showToast(error.message || 'Failed to remove invite', 'error');
    }
  };
}

// ============================================================
// PROFILES PANEL
// ============================================================

function renderProfilesPanel() {
  const panel = document.getElementById('admin-panel-profiles');
  const profiles = storage.getProfiles();
  
  let html = `
    <div class="panel-header">
      <h2>User Profiles</h2>
    </div>
  `;
  
  if (profiles.length === 0) {
    html += `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No user profiles yet.</div>`;
  } else {
    html += `
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Membership</th>
            <th>Contract</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    for (const profile of profiles) {
      html += `
        <tr>
          <td>${profile.name || 'N/A'}</td>
          <td>${profile.email}</td>
          <td><span class="badge ${profile.membership === 'subscribed' ? 'badge-success' : 'badge-default'}">${profile.membership}</span></td>
          <td>${profile.contract_details || 'N/A'}</td>
          <td>
            <button class="action-btn primary edit-profile-btn" data-user-id="${profile.user_id}">Edit</button>
          </td>
        </tr>
      `;
    }
    
    html += `</tbody></table>`;
  }
  
  panel.innerHTML = html;
  
  // Bind events
  document.querySelectorAll('.edit-profile-btn').forEach(btn => {
    btn.onclick = () => openEditProfileForm(btn.getAttribute('data-user-id'));
  });
}

function openEditProfileForm(userId) {
  const profile = storage.getProfiles().find(p => p.user_id === userId);
  if (!profile) {
    showToast('Profile not found', 'error');
    return;
  }
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>Edit Profile</h2>`;
  html += `<form id="edit-profile-form">
    <div class="form-group">
      <label>Email</label>
      <input type="text" value="${profile.email}" disabled>
    </div>
    <div class="form-group">
      <label for="edit-name">Name</label>
      <input type="text" id="edit-name" value="${profile.name || ''}" placeholder="User Name">
    </div>
    <div class="form-group">
      <label for="edit-membership">Membership</label>
      <select id="edit-membership">
        <option value="standard" ${profile.membership === 'standard' ? 'selected' : ''}>Standard</option>
        <option value="subscribed" ${profile.membership === 'subscribed' ? 'selected' : ''}>Subscribed</option>
      </select>
    </div>
    <div class="form-group">
      <label for="edit-contract">Contract Details</label>
      <textarea id="edit-contract" rows="3">${profile.contract_details || ''}</textarea>
    </div>
    <div class="form-actions">
      <button type="submit" class="primary">Save Changes</button>
      <button type="button" class="secondary cancel-btn">Cancel</button>
    </div>
  </form>`;
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.querySelector('.cancel-btn').onclick = closeSlidein;
  document.getElementById('edit-profile-form').onsubmit = (e) => handleUpdateProfile(e, userId);
}

async function handleUpdateProfile(e, userId) {
  e.preventDefault();
  
  const name = document.getElementById('edit-name').value.trim();
  const membership = document.getElementById('edit-membership').value;
  const contractDetails = document.getElementById('edit-contract').value.trim();
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';
  
  try {
    await storage.updateProfile(userId, {
      name,
      membership,
      contractDetails
    });
    
    showToast('Profile updated', 'success');
    closeSlidein();
    renderProfilesPanel();
  } catch (error) {
    showToast(error.message || 'Failed to update profile', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
  }
}

// ============================================================
// BOOKINGS PANEL
// ============================================================

// Current week for admin calendar
let adminCurrentWeekStart = getWeekStart(new Date());

// Track whether to show past bookings
let showPastBookings = false;

function renderBookingsPanel() {
  const panel = document.getElementById('admin-panel-bookings');
  const now = new Date();
  
  // Sort bookings: pending first, then by closest to current date
  const allBookings = storage.getBookings().sort((a, b) => {
    // Sort by status first: pending > approved > cancelled/declined
    const statusOrder = { 'pending': 0, 'approved': 1, 'declined': 2, 'cancelled': 3 };
    const aStatusOrder = statusOrder[a.status] ?? 99;
    const bStatusOrder = statusOrder[b.status] ?? 99;
    
    if (aStatusOrder !== bStatusOrder) {
      return aStatusOrder - bStatusOrder;
    }
    
    // Then sort by closest to current date
    const aStart = new Date(a.startISO);
    const bStart = new Date(b.startISO);
    const aDiff = Math.abs(aStart - now);
    const bDiff = Math.abs(bStart - now);
    return aDiff - bDiff;
  });
  
  // Split into upcoming and past
  const upcomingBookings = allBookings.filter(b => new Date(b.startISO) >= now);
  const pastBookings = allBookings.filter(b => new Date(b.startISO) < now);
  
  // Determine which bookings to show
  const bookingsToShow = showPastBookings ? allBookings : upcomingBookings;
  const pendingCount = allBookings.filter(b => b.status === 'pending').length;
  
  // Update badge
  document.getElementById('pending-badge').textContent = pendingCount;
  
  let html = `
    <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
      <div>
        <h2>Bookings Calendar</h2>
        <span class="info-text">${pendingCount} pending approval</span>
      </div>
      <button class="primary" id="admin-add-booking-btn">+ Add Booking</button>
    </div>
    
    <!-- Calendar Navigation -->
    <div class="calendar-controls">
      <button id="admin-prev-week" aria-label="Previous week">&lt;</button>
      <span id="admin-week-label"></span>
      <button id="admin-next-week" aria-label="Next week">&gt;</button>
      <button id="admin-today-btn">Today</button>
    </div>
    
    <!-- Calendar Grid -->
    <div id="admin-calendar-grid" class="calendar-grid" style="margin-bottom: 2rem;">
      <!-- Calendar rendered by renderAdminCalendar() -->
    </div>
    
    <!-- Bookings Table Below -->
    <div class="panel-header" style="margin-top: 2rem; display: flex; justify-content: space-between; align-items: center;">
      <h3>Bookings List (${upcomingBookings.length} upcoming${pastBookings.length > 0 ? `, ${pastBookings.length} past` : ''})</h3>
      ${pastBookings.length > 0 ? `
        <button class="secondary" id="toggle-past-bookings-btn" style="font-size: 0.9rem;">
          ${showPastBookings ? 'Hide Past Bookings' : 'Show Past Bookings'}
        </button>
      ` : ''}
    </div>
  `;
  
  if (bookingsToShow.length === 0) {
    html += `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">
      ${showPastBookings ? 'No bookings found.' : 'No upcoming bookings.'}
    </div>`;
  } else {
    html += `
      <table class="table">
        <thead>
          <tr>
            <th>Date & Time</th>
            <th>User</th>
            <th>Duration</th>
            <th>Status</th>
            <th>Notes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    for (const booking of bookingsToShow) {
      const start = new Date(booking.startISO);
      const end = new Date(booking.endISO);
      const isPast = start < now;
      const statusClass = booking.status === 'approved' ? 'badge-success' :
                         booking.status === 'declined' ? 'badge-danger' :
                         booking.status === 'cancelled' ? 'badge-secondary' : 'badge-warning';
      
      html += `
        <tr ${isPast ? 'style="opacity: 0.6;"' : ''}>
          <td>
            <b>${formatDateYMD(start)}</b><br>
            ${formatTimeHM(start)} - ${formatTimeHM(end)}
            ${isPast ? '<span style="color: var(--text-muted); font-size: 0.8rem;"> (past)</span>' : ''}
          </td>
          <td>${booking.userEmail}</td>
          <td>${booking.durationMinutes} min</td>
          <td><span class="badge ${statusClass}">${booking.status}</span></td>
          <td>
            ${booking.userNotes ? `<div style="font-size: 0.85rem;">User: ${booking.userNotes}</div>` : ''}
            ${booking.adminNotes ? `<div style="font-size: 0.85rem; color: var(--primary);">Admin: ${booking.adminNotes}</div>` : ''}
          </td>
          <td>
            <button class="action-btn secondary view-btn" data-id="${booking.id}">View</button>
            ${booking.status === 'pending' && !isPast ? `
              <button class="action-btn success approve-btn" data-id="${booking.id}">Approve</button>
              <button class="action-btn danger decline-btn" data-id="${booking.id}">Decline</button>
            ` : booking.status === 'approved' && !isPast ? `
              <button class="action-btn danger cancel-booking-btn" data-id="${booking.id}">Cancel</button>
            ` : ''}
            <button class="action-btn danger delete-btn" data-id="${booking.id}">Delete</button>
          </td>
        </tr>
      `;
    }
    
    html += `</tbody></table>`;
  }
  
  panel.innerHTML = html;
  
  // If we have bookings, ensure calendar shows the week of the first upcoming one
  if (upcomingBookings.length > 0) {
    const firstBookingStart = new Date(upcomingBookings[0].startISO);
    const bookingWeekStart = getWeekStart(firstBookingStart);
    // Only switch week if current view doesn't include this booking
    const weekEnd = new Date(adminCurrentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    if (firstBookingStart < adminCurrentWeekStart || firstBookingStart > weekEnd) {
      adminCurrentWeekStart = bookingWeekStart;
    }
  }
  
  // Render calendar
  renderAdminCalendar();
  
  // Setup calendar navigation
  document.getElementById('admin-prev-week').onclick = () => {
    adminCurrentWeekStart = new Date(adminCurrentWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    renderAdminCalendar();
  };
  document.getElementById('admin-next-week').onclick = () => {
    adminCurrentWeekStart = new Date(adminCurrentWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    renderAdminCalendar();
  };
  document.getElementById('admin-today-btn').onclick = () => {
    adminCurrentWeekStart = getWeekStart(new Date());
    renderAdminCalendar();
  };
  
  const addBookingBtn = document.getElementById('admin-add-booking-btn');
  if (addBookingBtn) addBookingBtn.onclick = openCreateBookingForm;
  
  // Toggle past bookings button
  const togglePastBtn = document.getElementById('toggle-past-bookings-btn');
  if (togglePastBtn) {
    togglePastBtn.onclick = () => {
      showPastBookings = !showPastBookings;
      renderBookingsPanel();
    };
  }
  
  // Bind events using event delegation
  panel.addEventListener('click', async (e) => {
    const target = e.target;
    const bookingId = target.getAttribute('data-id');
    
    if (!bookingId) return;
    
    if (target.classList.contains('view-btn')) {
      openAdminBookingDetails(bookingId);
    } else if (target.classList.contains('approve-btn')) {
      await handleApproveBooking(bookingId);
    } else if (target.classList.contains('decline-btn')) {
      await handleDeclineBooking(bookingId);
    } else if (target.classList.contains('cancel-booking-btn')) {
      await handleCancelBooking(bookingId);
    } else if (target.classList.contains('delete-btn')) {
      confirmDeleteBooking(bookingId);
    }
  });
}

function renderAdminCalendar() {
  const grid = document.getElementById('admin-calendar-grid');
  if (!grid) return;
  
  const settings = storage.getSettings();
  const bookings = storage.getBookings();
  
  // Update week label
  const weekEnd = new Date(adminCurrentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const labelElem = document.getElementById('admin-week-label');
  if (labelElem) {
    labelElem.textContent = `${formatDateShort(adminCurrentWeekStart)} - ${formatDateShort(weekEnd)}`;
  }
  
  // Build HTML (same structure as user calendar)
  let html = '<div class="calendar-wrapper">';
  
  // Header row with day labels
  html += '<div class="calendar-header">';
  html += '<div class="day-header time-corner"></div>';
  for (let i = 0; i < 7; i++) {
    const day = new Date(adminCurrentWeekStart.getTime() + i * 24 * 60 * 60 * 1000);
    const isToday = isSameDay(day, new Date());
    html += `
      <div class="day-header ${isToday ? 'today' : ''}">
        <div class="day-name">${getDayName(day)}</div>
        <div class="day-date">${day.getDate()}</div>
      </div>
    `;
  }
  html += '</div>';
  
  // Time rows (settings use openTime/closeTime, not business_hours_start/end)
  const startHour = parseInt(settings.openTime.split(':')[0]);
  let endHour = parseInt(settings.closeTime.split(':')[0]);
  // Handle midnight (00:00) as 24
  if (endHour === 0) endHour = 24;
  const slotMinutes = settings.slotIntervalMinutes;
  
  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += slotMinutes) {
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      
      html += '<div class="time-row">';
      html += `<div class="time-label">${timeStr}</div>`;
      
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const slotDate = new Date(adminCurrentWeekStart);
        slotDate.setDate(slotDate.getDate() + dayOffset);
        slotDate.setHours(hour, minute, 0, 0);
        
        const slotISO = slotDate.toISOString();
        const slotTime = slotDate.getTime();
        const isPast = slotDate < new Date();
        
        // Find ALL bookings in this slot (not just first one)
        const slotBookings = bookings.filter(b => {
          if (b.status === 'cancelled' || b.status === 'declined') return false;
          const start = new Date(b.startISO);
          const end = new Date(b.endISO);
          return slotTime >= start.getTime() && slotTime < end.getTime();
        });
        
        let slotClass = 'slot-cell';
        if (isPast) slotClass += ' past';
        
        // Check if multiple bookings in same slot
        let slotContent = '';
        if (slotBookings.length > 1) {
          // Multiple bookings - show as special color with count
          slotClass += ' multiple-pending';
          slotContent = `<span class="booking-count">${slotBookings.length}</span>`;
        } else if (slotBookings.length === 1) {
          // Single booking
          const booking = slotBookings[0];
          if (booking.status === 'pending') slotClass += ' pending';
          else if (booking.status === 'approved') slotClass += ' booked';
        }
        
        const slotBookingIds = slotBookings.map(b => b.id).join(',');
        const isEmptySlot = slotBookings.length === 0 && !isPast;
        html += `<div class="${slotClass}" data-slot="${slotISO}" data-booking-ids="${slotBookingIds}" data-empty="${isEmptySlot}">${slotContent}</div>`;
      }
      
      html += '</div>';
    }
  }
  
  html += '</div>';
  grid.innerHTML = html;
  
  grid.querySelectorAll('.slot-cell').forEach(cell => {
    const bookingIdsStr = cell.getAttribute('data-booking-ids');
    const isEmpty = cell.getAttribute('data-empty') === 'true';
    
    if (bookingIdsStr && bookingIdsStr.length > 0) {
      const bookingIds = bookingIdsStr.split(',').filter(id => id.length > 0);
      cell.style.cursor = 'pointer';
      
      if (bookingIds.length > 1) {
        // Multiple bookings in this slot - show selection panel
        cell.onclick = () => openMultipleBookingsPanel(bookingIds);
      } else if (bookingIds.length === 1) {
        // Single booking - show details directly
        cell.onclick = () => openAdminBookingDetails(bookingIds[0]);
      }
    } else if (isEmpty) {
      cell.style.cursor = 'pointer';
      cell.onclick = () => {
        openCreateBookingForm(cell.getAttribute('data-slot'));
      };
    }
  });
}

function openMultipleBookingsPanel(bookingIds) {
  const bookings = storage.getBookings().filter(b => bookingIds.includes(b.id));
  
  if (bookings.length === 0) {
    showToast('Bookings not found', 'error');
    return;
  }
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>Multiple Bookings (${bookings.length})</h2>`;
  html += `<p style="color: var(--text-muted); margin-bottom: 1.5rem;">Multiple users have requested this time slot. Click on a booking to view details.</p>`;
  
  html += `<div id="multiple-bookings-list" style="display: flex; flex-direction: column; gap: 1rem;">`;
  
  for (const booking of bookings) {
    const start = new Date(booking.startISO);
    const end = new Date(booking.endISO);
    const statusClass = booking.status === 'approved' ? 'success' :
                       booking.status === 'declined' ? 'danger' :
                       booking.status === 'cancelled' ? 'secondary' : 'warning';
    
    html += `
      <div class="booking-card" data-booking-id="${booking.id}" style="cursor: pointer; background: var(--bg-glass); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-glass); transition: all 0.2s;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <strong>${booking.userEmail}</strong>
          <span class="badge badge-${statusClass}">${booking.status}</span>
        </div>
        <div style="font-size: 0.9rem; color: var(--text-muted);">
          ${formatDateYMD(start)} ${formatTimeHM(start)} - ${formatTimeHM(end)} (${booking.durationMinutes} min)
        </div>
        ${booking.userNotes ? `<div style="font-size: 0.85rem; margin-top: 0.5rem; font-style: italic;">"${booking.userNotes}"</div>` : ''}
      </div>
    `;
  }
  
  html += `</div>`;
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  
  // Set up click handlers for booking cards
  document.querySelectorAll('.booking-card[data-booking-id]').forEach(card => {
    card.onclick = () => {
      const bookingId = card.getAttribute('data-booking-id');
      openAdminBookingDetails(bookingId);
    };
  });
}

function openAdminBookingDetails(bookingId) {
  const booking = storage.getBookings().find(b => b.id === bookingId);
  if (!booking) {
    showToast('Booking not found', 'error');
    return;
  }
  
  const start = new Date(booking.startISO);
  const end = new Date(booking.endISO);
  const statusClass = booking.status === 'approved' ? 'success' :
                     booking.status === 'declined' ? 'danger' :
                     booking.status === 'cancelled' ? 'secondary' : 'warning';
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>Booking Details</h2>`;
  
  html += `<div style="background: var(--bg-glass); padding: 1.5rem; border-radius: var(--radius-md); margin: 1.5rem 0;">`;
  html += `<div style="margin-bottom: 1rem;"><strong>Date:</strong> ${formatDateYMD(start)}</div>`;
  html += `<div style="margin-bottom: 1rem;"><strong>Time:</strong> ${formatTimeHM(start)} - ${formatTimeHM(end)}</div>`;
  html += `<div style="margin-bottom: 1rem;"><strong>Duration:</strong> ${booking.durationMinutes} minutes</div>`;
  html += `<div style="margin-bottom: 1rem;"><strong>User:</strong> ${booking.userEmail}</div>`;
  html += `<div style="margin-bottom: 1rem;"><strong>Status:</strong> <span class="badge badge-${statusClass}">${booking.status}</span></div>`;
  
  if (booking.userNotes) {
    html += `<div style="margin-bottom: 1rem;"><strong>User Notes:</strong><br><div style="background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 4px; margin-top: 0.5rem;">${booking.userNotes}</div></div>`;
  }
  
  if (booking.adminNotes) {
    html += `<div style="margin-bottom: 1rem;"><strong>Admin Notes:</strong><br><div style="background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 4px; margin-top: 0.5rem; color: var(--primary);">${booking.adminNotes}</div></div>`;
  }
  html += `</div>`;
  
  // Action buttons based on status
  if (booking.status === 'pending') {
    html += `<div class="form-actions">`;
    html += `<button class="primary" id="approve-detail-btn">Approve</button>`;
    html += `<button class="danger" id="decline-detail-btn">Decline</button>`;
    html += `<button class="secondary" id="edit-detail-btn">Edit</button>`;
    html += `<button class="danger" id="delete-detail-btn">Delete</button>`;
    html += `<button class="secondary close-dialog-btn">Close</button>`;
    html += `</div>`;
  } else if (booking.status === 'approved') {
    html += `<div class="form-actions">`;
    html += `<button class="danger" id="cancel-detail-btn">Cancel Booking</button>`;
    html += `<button class="secondary" id="edit-detail-btn">Edit</button>`;
    html += `<button class="danger" id="delete-detail-btn">Delete</button>`;
    html += `<button class="secondary close-dialog-btn">Close</button>`;
    html += `</div>`;
  } else {
    html += `<div class="form-actions">`;
    html += `<button class="secondary" id="edit-detail-btn">Edit</button>`;
    html += `<button class="danger" id="delete-detail-btn">Delete</button>`;
    html += `<button class="secondary close-dialog-btn">Close</button>`;
    html += `</div>`;
  }
  
  openSlidein(html);
  
  // Bind events
  document.querySelector('.close-btn').onclick = closeSlidein;
  const closeBtn = document.querySelector('.close-dialog-btn');
  if (closeBtn) closeBtn.onclick = closeSlidein;
  
  const approveBtn = document.getElementById('approve-detail-btn');
  if (approveBtn) {
    approveBtn.onclick = async () => {
      closeSlidein();
      await handleApproveBooking(bookingId);
    };
  }
  
  const declineBtn = document.getElementById('decline-detail-btn');
  if (declineBtn) {
    declineBtn.onclick = async () => {
      closeSlidein();
      await handleDeclineBooking(bookingId);
    };
  }
  
  const cancelBtn = document.getElementById('cancel-detail-btn');
  if (cancelBtn) {
    cancelBtn.onclick = async () => {
      closeSlidein();
      await handleCancelBooking(bookingId);
    };
  }
  
  const deleteBtn = document.getElementById('delete-detail-btn');
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      confirmDeleteBooking(bookingId);
    };
  }
  
  const editBtn = document.getElementById('edit-detail-btn');
  if (editBtn) {
    editBtn.onclick = () => {
      openEditBookingForm(bookingId);
    };
  }
}

async function handleApproveBooking(bookingId) {
  try {
    await storage.setBookingStatus(bookingId, 'approved');
    showToast('Booking approved', 'success');
    renderBookingsPanel();
  } catch (error) {
    showToast(error.message || 'Failed to approve booking', 'error');
  }
}

async function handleDeclineBooking(bookingId) {
  const notes = prompt('Reason for decline (optional):');
  
  try {
    await storage.setBookingStatus(bookingId, 'declined', notes || '');
    showToast('Booking declined', 'success');
    renderBookingsPanel();
  } catch (error) {
    showToast(error.message || 'Failed to decline booking', 'error');
  }
}

async function handleCancelBooking(bookingId) {
  const notes = prompt('Reason for cancellation (optional):');
  
  try {
    await storage.setBookingStatus(bookingId, 'cancelled', notes || '');
    showToast('Booking cancelled', 'success');
    renderBookingsPanel();
  } catch (error) {
    showToast(error.message || 'Failed to cancel booking', 'error');
  }
}

function confirmDeleteBooking(bookingId) {
  const booking = storage.getBookings().find(b => b.id === bookingId);
  if (!booking) {
    showToast('Booking not found', 'error');
    return;
  }
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2 style="color: var(--danger);">⚠️ Delete Booking</h2>`;
  html += `<div style="margin: 1.5rem 0;">
    <p>Are you sure you want to permanently delete this booking?</p>
    <div style="background: rgba(255, 255, 255, 0.05); padding: 1rem; border-radius: var(--radius-md); margin: 1rem 0;">
      <p style="margin: 0.5rem 0;"><strong>User:</strong> ${booking.userEmail}</p>
      <p style="margin: 0.5rem 0;"><strong>Date:</strong> ${formatDateYMD(new Date(booking.startISO))}</p>
      <p style="margin: 0.5rem 0;"><strong>Time:</strong> ${formatTimeHM(new Date(booking.startISO))} - ${formatTimeHM(new Date(booking.endISO))}</p>
      <p style="margin: 0.5rem 0;"><strong>Status:</strong> ${booking.status}</p>
    </div>
    <p style="color: var(--danger);">This action cannot be undone.</p>
  </div>`;
  html += `<div class="form-actions">
    <button class="danger" id="confirm-delete-btn">Delete Booking</button>
    <button class="secondary" id="cancel-delete-btn">Cancel</button>
  </div>`;
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.getElementById('cancel-delete-btn').onclick = closeSlidein;
  document.getElementById('confirm-delete-btn').onclick = async () => {
    try {
      await storage.deleteBooking(bookingId);
      showToast('Booking deleted', 'success');
      closeSlidein();
      renderBookingsPanel();
    } catch (error) {
      showToast(error.message || 'Failed to delete booking', 'error');
    }
  };
}

function openEditBookingForm(bookingId) {
  const booking = storage.getBookings().find(b => b.id === bookingId);
  if (!booking) {
    showToast('Booking not found', 'error');
    return;
  }
  const start = new Date(booking.startISO);
  const end = new Date(booking.endISO);
  const dateStr = formatDateYMD(start);
  const startTimeStr = formatTimeHM(start);
  const endTimeStr = formatTimeHM(end);
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>Edit Booking</h2>`;
  html += `<form id="edit-booking-form">
    <div class="form-group">
      <label for="edit-date">Date</label>
      <input type="date" id="edit-date" value="${dateStr}" required>
    </div>
    <div class="form-group">
      <label for="edit-start-time">Start Time</label>
      <input type="time" id="edit-start-time" value="${startTimeStr}" required>
    </div>
    <div class="form-group">
      <label for="edit-end-time">End Time</label>
      <input type="time" id="edit-end-time" value="${endTimeStr}" required>
    </div>
    <div class="form-group">
      <label for="edit-user-notes">User Notes</label>
      <textarea id="edit-user-notes" rows="2">${booking.userNotes || ''}</textarea>
    </div>
    <div class="form-group">
      <label for="edit-admin-notes">Admin Notes</label>
      <textarea id="edit-admin-notes" rows="2">${booking.adminNotes || ''}</textarea>
    </div>
    <div class="form-actions">
      <button type="submit" class="primary">Save Changes</button>
      <button type="button" class="secondary close-dialog-btn">Cancel</button>
    </div>
  </form>`;
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.querySelector('.close-dialog-btn').onclick = closeSlidein;
  
  document.getElementById('edit-booking-form').onsubmit = async (e) => {
    e.preventDefault();
    const date = document.getElementById('edit-date').value;
    const startTime = document.getElementById('edit-start-time').value;
    const endTime = document.getElementById('edit-end-time').value;
    const userNotes = document.getElementById('edit-user-notes').value.trim();
    const adminNotes = document.getElementById('edit-admin-notes').value.trim();
    
    const startISO = new Date(`${date}T${startTime}:00`).toISOString();
    const endISO = new Date(`${date}T${endTime}:00`).toISOString();
    const durationMinutes = Math.round((new Date(endISO) - new Date(startISO)) / 60000);
    
    if (durationMinutes < 60) {
      showToast('Duration must be at least 1 hour', 'error');
      return;
    }
    if (durationMinutes % 30 !== 0) {
      showToast('Duration must be a multiple of 30 minutes', 'error');
      return;
    }
    
    try {
      await storage.updateBooking(bookingId, { startISO, endISO, durationMinutes, userNotes, adminNotes });
      showToast('Booking updated', 'success');
      closeSlidein();
      renderBookingsPanel();
    } catch (error) {
      showToast(error.message || 'Failed to update booking', 'error');
    }
  };
}

function openCreateBookingForm(slotISO) {
  const startDate = slotISO ? new Date(slotISO) : new Date();
  const dateStr = formatDateYMD(startDate);
  const startTime = slotISO ? formatTimeHM(startDate) : '14:00';
  const endTime = slotISO ? formatTimeHM(addMinutes(startDate, 60)) : '15:00';
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>Add New Booking</h2>`;
  html += `<p style="color: var(--text-muted); margin-bottom: 1rem;">Create a one-off booking without requiring a user account.</p>`;
  html += `<form id="create-booking-form">
    <div class="form-group">
      <label for="create-client-name">Client / Display Name</label>
      <input type="text" id="create-client-name" placeholder="Walk-in" value="Walk-in">
    </div>
    <div class="form-group">
      <label for="create-date">Date</label>
      <input type="date" id="create-date" value="${dateStr}" required>
    </div>
    <div class="form-group">
      <label for="create-start-time">Start Time</label>
      <input type="time" id="create-start-time" value="${startTime}" required>
    </div>
    <div class="form-group">
      <label for="create-end-time">End Time</label>
      <input type="time" id="create-end-time" value="${endTime}" required>
    </div>
    <div class="form-group">
      <label for="create-user-notes">Notes (optional)</label>
      <textarea id="create-user-notes" rows="2" placeholder="Any notes for this booking"></textarea>
    </div>
    <div class="form-group">
      <label for="create-admin-notes">Admin Notes (optional)</label>
      <textarea id="create-admin-notes" rows="2" placeholder="Internal notes"></textarea>
    </div>
    <div class="form-actions">
      <button type="submit" class="primary">Create Booking</button>
      <button type="button" class="secondary close-dialog-btn">Cancel</button>
    </div>
  </form>`;
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.querySelector('.close-dialog-btn').onclick = closeSlidein;
  
  document.getElementById('create-booking-form').onsubmit = async (e) => {
    e.preventDefault();
    const clientName = document.getElementById('create-client-name').value.trim() || 'Walk-in';
    const date = document.getElementById('create-date').value;
    const startTime = document.getElementById('create-start-time').value;
    const endTime = document.getElementById('create-end-time').value;
    const userNotes = document.getElementById('create-user-notes').value.trim();
    const adminNotes = document.getElementById('create-admin-notes').value.trim();
    
    const startISO = new Date(`${date}T${startTime}:00`).toISOString();
    const endISO = new Date(`${date}T${endTime}:00`).toISOString();
    
    const durationMinutes = Math.round((new Date(endISO) - new Date(startISO)) / 60000);
    if (durationMinutes < 60) {
      showToast('Duration must be at least 1 hour', 'error');
      return;
    }
    if (durationMinutes % 30 !== 0) {
      showToast('Duration must be a multiple of 30 minutes', 'error');
      return;
    }
    
    try {
      await storage.adminCreateBooking(startISO, endISO, clientName, userNotes, adminNotes);
      showToast('Booking created', 'success');
      closeSlidein();
      renderBookingsPanel();
    } catch (error) {
      showToast(error.message || 'Failed to create booking', 'error');
    }
  };
}

// ============================================================
// SETTINGS PANEL
// ============================================================

function renderSettingsPanel() {
  const panel = document.getElementById('admin-panel-settings');
  const settings = storage.getSettings();
  
  let html = `
    <div class="panel-header">
      <h2>System Settings</h2>
    </div>
    <form id="settings-form" class="settings-form">
      <div class="form-group">
        <label for="open-time">Business Hours Start</label>
        <input type="time" id="open-time" value="${settings.openTime}" required>
      </div>
      <div class="form-group">
        <label for="close-time">Business Hours End</label>
        <select id="close-time" required>
          ${(() => {
            const hours = [];
            for (let h = 6; h <= 24; h++) {
              const t = h === 24 ? '24:00' : `${String(h).padStart(2, '0')}:00`;
              hours.push(t);
            }
            return hours.map(t => 
              `<option value="${t}" ${settings.closeTime === t ? 'selected' : ''}>${t === '24:00' ? '24:00 (midnight)' : t}</option>`
            ).join('');
          })()}
        </select>
      </div>
      <div class="form-group">
        <label for="buffer-minutes">Buffer Between Bookings (minutes)</label>
        <input type="number" id="buffer-minutes" value="${settings.bufferMinutes}" min="0" max="120" step="15" required>
      </div>
      <div class="form-group">
        <label for="slot-interval">Booking Slot Interval (minutes)</label>
        <select id="slot-interval" required>
          <option value="30" ${settings.slotIntervalMinutes === 30 ? 'selected' : ''}>30 minutes</option>
          <option value="60" ${settings.slotIntervalMinutes === 60 ? 'selected' : ''}>60 minutes</option>
        </select>
      </div>
      <button type="submit" class="primary">Save Settings</button>
    </form>
  `;
  
  panel.innerHTML = html;
  document.getElementById('settings-form').onsubmit = handleSaveSettings;
}

async function handleSaveSettings(e) {
  e.preventDefault();
  
  const openTime = document.getElementById('open-time').value;
  const closeTime = document.getElementById('close-time').value;
  const bufferMinutes = parseInt(document.getElementById('buffer-minutes').value);
  const slotIntervalMinutes = parseInt(document.getElementById('slot-interval').value);
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';
  
  try {
    await storage.setSettings({
      openTime,
      closeTime,
      bufferMinutes,
      slotIntervalMinutes
    });
    
    showToast('Settings saved', 'success');
    submitBtn.textContent = 'Save Settings';
  } catch (error) {
    showToast(error.message || 'Failed to save settings', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Settings';
  }
}

// ============================================================
// INITIALIZATION
// ============================================================

async function init() {
  try {
    // Load all data
    await storage.loadAll();
    
    // Check admin access
    const hasAccess = await checkAdminAccess();
    
    if (hasAccess) {
      // Bind navigation
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = () => switchPanel(btn.getAttribute('data-panel'));
      });
      
      // Bind logout
      document.getElementById('logout-btn').onclick = handleLogout;
      
      // Render initial panel
      switchPanel(currentPanel);
    } else {
      // Bind login form
      const loginForm = document.getElementById('admin-login-form');
      if (loginForm) {
        loginForm.onsubmit = handleAdminLogin;
      }
    }
  } catch (error) {
    console.error('Initialization error:', error);
    showToast('Failed to load admin dashboard', 'error');
  }
}

// Start the app
document.addEventListener('DOMContentLoaded', async () => {
  await init();
});

})();
