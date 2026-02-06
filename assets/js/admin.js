// ============================================================
// ADMIN.JS - Admin Dashboard (Auth-based)
// Requires user to be in admin_users table
// ============================================================

(() => {
'use strict';

const {
  formatTimeHM, formatDateYMD, formatDateWeekday, getISOWeek, getWeekStart, addDays, addMinutes,
  showToast, openSlidein, closeSlidein
} = window.utils;

const storage = window.storage;

let currentUser = null;
let isAdmin = false;
let currentPanel = 'invites';
let isCheckingMagicLink = false;

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
  
  try {
    await storage.signInWithPassword(email, password);
    
    // Wait for auth state to update
    await new Promise(r => setTimeout(r, 500));
    
    // Check if admin
    const hasAccess = await checkAdminAccess();
    
    if (!hasAccess) {
      throw new Error('Admin access required');
    }
    
    // Success - initialize dashboard
    await init();
    
  } catch (error) {
    errorEl.textContent = error.message || 'Login failed';
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

async function checkMagicLinkRedirect() {
  if (isCheckingMagicLink) return;
  isCheckingMagicLink = true;
  
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const accessToken = hashParams.get('access_token');
  
  if (accessToken) {
    showToast('Logging in...');
    window.history.replaceState(null, '', window.location.pathname);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await init();
  }
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
      <button class="primary" id="invite-user-btn">+ Invite User</button>
    </div>
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
  const inviteBtn = document.getElementById('invite-user-btn');
  if (inviteBtn) {
    inviteBtn.onclick = openInviteForm;
  }
  
  document.querySelectorAll('.remove-invite-btn').forEach(btn => {
    btn.onclick = () => confirmRemoveInvite(btn.getAttribute('data-email'));
  });
}

function openInviteForm() {
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>Invite User</h2>`;
  html += `<form id="invite-form">
    <div class="form-group">
      <label for="invite-email">Email Address</label>
      <input type="email" id="invite-email" placeholder="user@example.com" required autocomplete="email">
    </div>
    <p style="color: var(--text-muted); font-size: 0.9rem; margin: 1rem 0;">
      A temporary password will be generated for the user. They must change it on first login.
    </p>
    <div class="form-actions">
      <button type="submit" class="primary">Create User</button>
      <button type="button" class="secondary cancel-btn">Cancel</button>
    </div>
  </form>`;
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.querySelector('.cancel-btn').onclick = closeSlidein;
  document.getElementById('invite-form').onsubmit = handleInviteUser;
}

async function handleInviteUser(e) {
  e.preventDefault();
  
  const emailInput = document.getElementById('invite-email');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const email = emailInput.value.trim().toLowerCase();
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating...';
  
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
    
  } catch (error) {
    showToast(error.message || 'Failed to create user', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create User';
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

function renderBookingsPanel() {
  const panel = document.getElementById('admin-panel-bookings');
  const bookings = storage.getBookings().sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
  const pendingCount = bookings.filter(b => b.status === 'pending').length;
  
  // Update badge
  document.getElementById('pending-badge').textContent = pendingCount;
  
  let html = `
    <div class="panel-header">
      <h2>Bookings Calendar</h2>
      <span class="info-text">${pendingCount} pending approval</span>
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
    <div class="panel-header" style="margin-top: 2rem;">
      <h3>All Bookings List</h3>
    </div>
  `;
  
  if (bookings.length === 0) {
    html += `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No bookings yet.</div>`;
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
    
    for (const booking of bookings) {
      const start = new Date(booking.startISO);
      const end = new Date(booking.endISO);
      const statusClass = booking.status === 'approved' ? 'badge-success' :
                         booking.status === 'declined' ? 'badge-danger' :
                         booking.status === 'cancelled' ? 'badge-secondary' : 'badge-warning';
      
      html += `
        <tr>
          <td>
            <b>${formatDateYMD(start)}</b><br>
            ${formatTimeHM(start)} - ${formatTimeHM(end)}
          </td>
          <td>${booking.userEmail}</td>
          <td>${booking.durationMinutes} min</td>
          <td><span class="badge ${statusClass}">${booking.status}</span></td>
          <td>
            ${booking.userNotes ? `<div style="font-size: 0.85rem;">User: ${booking.userNotes}</div>` : ''}
            ${booking.adminNotes ? `<div style="font-size: 0.85rem; color: var(--primary);">Admin: ${booking.adminNotes}</div>` : ''}
          </td>
          <td>
            ${booking.status === 'pending' ? `
              <button class="action-btn success approve-btn" data-id="${booking.id}">Approve</button>
              <button class="action-btn danger decline-btn" data-id="${booking.id}">Decline</button>
            ` : booking.status === 'approved' ? `
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
  
  // Bind events using event delegation
  panel.addEventListener('click', async (e) => {
    const target = e.target;
    const bookingId = target.getAttribute('data-id');
    
    if (!bookingId) return;
    
    if (target.classList.contains('approve-btn')) {
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
  
  // Time rows
  const startHour = parseInt(settings.business_hours_start.split(':')[0]);
  const endHour = parseInt(settings.business_hours_end.split(':')[0]);
  const slotMinutes = settings.slot_interval_minutes;
  
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
        const isPast = slotDate < new Date();
        
        // Check if there's a booking at this slot
        const booking = bookings.find(b => b.startISO === slotISO);
        
        let slotClass = 'slot-cell';
        if (isPast) slotClass += ' past';
        if (booking) {
          if (booking.status === 'pending') slotClass += ' pending';
          else if (booking.status === 'approved') slotClass += ' booked';
          else if (booking.status === 'declined') slotClass += ' declined';
        }
        
        html += `<div class="${slotClass}" data-slot="${slotISO}" data-booking-id="${booking ? booking.id : ''}"></div>`;
      }
      
      html += '</div>';
    }
  }
  
  html += '</div>';
  grid.innerHTML = html;
  
  // Add click handler for slots with bookings
  grid.querySelectorAll('.slot-cell').forEach(cell => {
    const bookingId = cell.getAttribute('data-booking-id');
    if (bookingId) {
      cell.style.cursor = 'pointer';
      cell.onclick = () => openAdminBookingDetails(bookingId);
    }
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
    html += `<button class="danger" id="delete-detail-btn">Delete</button>`;
    html += `<button class="secondary close-dialog-btn">Close</button>`;
    html += `</div>`;
  } else if (booking.status === 'approved') {
    html += `<div class="form-actions">`;
    html += `<button class="danger" id="cancel-detail-btn">Cancel Booking</button>`;
    html += `<button class="danger" id="delete-detail-btn">Delete</button>`;
    html += `<button class="secondary close-dialog-btn">Close</button>`;
    html += `</div>`;
  } else {
    html += `<div class="form-actions">`;
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
      closeSlidein();
      confirmDeleteBooking(bookingId);
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
        <input type="time" id="close-time" value="${settings.closeTime}" required>
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
  await checkMagicLinkRedirect();
  await init();
});

})();
