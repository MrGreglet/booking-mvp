// ============================================================
// ADMIN.JS - Admin Dashboard (Auth-based)
// Requires user to be in admin_users table
// ============================================================

(() => {
'use strict';

const {
  formatTimeHM, formatDateYMD, formatDateDDMMYY, formatDateWeekday, formatDateShort, getDayName, isSameDay,
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
      
      // Provide more specific error message based on what might have gone wrong
      throw new Error('Admin access denied. This could mean:\n' +
        '1. Your account is not in the admin_users table\n' +
        '2. Row Level Security policies are blocking access\n' +
        '3. There was a temporary network issue\n\n' +
        'If you believe you should have admin access, please:\n' +
        '- Verify your user ID is in the admin_users table\n' +
        '- Check that RLS policies allow you to query your own admin status\n' +
        '- Try refreshing the page and logging in again');
    }
    
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
    
    // Update pending badge immediately
    updatePendingBadge();
    
    // Make pending badge clickable
    const pendingBadge = document.getElementById('pending-badge');
    if (pendingBadge) {
      pendingBadge.style.cursor = 'pointer';
      pendingBadge.onclick = () => switchPanel('bookings');
    }
    
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
// PENDING BADGE UPDATE
// ============================================================

function updatePendingBadge() {
  const allBookings = storage.getBookings();
  const pendingCount = allBookings.filter(b => b.status === 'pending').length;
  const badge = document.getElementById('pending-badge');
  if (badge) {
    badge.textContent = pendingCount;
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
    </div>
    <form id="invite-form-inline" class="admin-inline-form">
      <div class="form-group">
        <label for="invite-email-inline">Email Address</label>
        <input type="email" id="invite-email-inline" placeholder="user@example.com" required autocomplete="email">
      </div>
      <p class="form-hint">User will receive an invite email to set their password and access the system.</p>
      <button type="submit" class="primary">Send Invite</button>
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
          <td>${formatDateDDMMYY(invitedDate)} ${formatTimeHM(invitedDate)}</td>
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
    submitBtn.textContent = 'Sending invite...';
  }
  
  try {
    // Call Edge Function to invite user
    const { data, error } = await window.supabaseClient.functions.invoke('admin-invite-user', {
      body: { email }
    });
    
    if (error) {
      throw error;
    }
    
    if (data?.error) {
      throw new Error(data.error);
    }
    
    // Success - refresh the list
    await storage.loadAllowedUsers();
    renderInvitesPanel();
    if (emailInput) emailInput.value = '';
    
    showToast(`Invite sent to ${email}. They will receive an email to set their password.`, 'success');
    
  } catch (error) {
    let errorMsg = error.message || 'Failed to send invite';
    
    // Provide helpful message for "user already exists" error
    if (errorMsg.includes('User already exists') || errorMsg.includes('already registered')) {
      errorMsg = 'This email is already registered. If you previously deleted this user, you must permanently delete them from Supabase Dashboard > Authentication > Users first.';
    }
    
    showToast(errorMsg, 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create User';
    }
  }
}

// Removed generateTempPassword() and showCredentialsDialog() - no longer needed with invite flow

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

// Bookings list filters
let bookingsFilters = {
  status: 'all', // 'all' | 'pending' | 'approved' | 'declined' | 'cancelled'
  dateFrom: '',
  dateTo: '',
  search: '',
  sortUpcoming: false // false = newest first, true = upcoming first
};
let searchDebounceTimer = null;

// Filter and sort bookings based on current filters
function filterBookings(bookings) {
  let filtered = [...bookings];
  
  // Status filter
  if (bookingsFilters.status !== 'all') {
    filtered = filtered.filter(b => b.status === bookingsFilters.status);
  }
  
  // Date range filter
  if (bookingsFilters.dateFrom) {
    const fromDate = new Date(bookingsFilters.dateFrom);
    fromDate.setHours(0, 0, 0, 0);
    filtered = filtered.filter(b => new Date(b.startISO) >= fromDate);
  }
  if (bookingsFilters.dateTo) {
    const toDate = new Date(bookingsFilters.dateTo);
    toDate.setHours(23, 59, 59, 999);
    filtered = filtered.filter(b => new Date(b.startISO) <= toDate);
  }
  
  // Search filter (matches user email, user notes, admin notes)
  if (bookingsFilters.search) {
    const searchLower = bookingsFilters.search.toLowerCase();
    filtered = filtered.filter(b => {
      return (
        (b.userEmail && b.userEmail.toLowerCase().includes(searchLower)) ||
        (b.userNotes && b.userNotes.toLowerCase().includes(searchLower)) ||
        (b.adminNotes && b.adminNotes.toLowerCase().includes(searchLower))
      );
    });
  }
  
  // Sort
  const now = new Date();
  if (bookingsFilters.sortUpcoming) {
    // Upcoming first: pending + future bookings first, sorted by date ascending
    filtered.sort((a, b) => {
      const aStart = new Date(a.startISO);
      const bStart = new Date(b.startISO);
      const aIsFuture = aStart >= now;
      const bIsFuture = bStart >= now;
      
      if (aIsFuture && !bIsFuture) return -1;
      if (!aIsFuture && bIsFuture) return 1;
      
      // Both future or both past: sort by date ascending (earliest first)
      return aStart - bStart;
    });
  } else {
    // Newest first: sort by date descending
    filtered.sort((a, b) => new Date(b.startISO) - new Date(a.startISO));
  }
  
  return filtered;
}

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
  
  // Apply filters to all bookings
  const filteredBookings = filterBookings(allBookings);
  
  // Split filtered bookings into upcoming and past
  const upcomingBookings = filteredBookings.filter(b => new Date(b.startISO) >= now);
  const pastBookings = filteredBookings.filter(b => new Date(b.startISO) < now);
  
  // Determine which bookings to show
  const bookingsToShow = showPastBookings ? filteredBookings : upcomingBookings;
  const pendingCount = allBookings.filter(b => b.status === 'pending').length;
  
  // Update badge
  document.getElementById('pending-badge').textContent = pendingCount;
  
  let html = `
    <div class="panel-header">
      <h2>Bookings Calendar</h2>
      <span class="info-text">${pendingCount} pending approval</span>
    </div>
    
    <!-- Calendar Navigation + Grid (sticky together on scroll) -->
    <div class="calendar-sticky-header">
      <div class="calendar-controls">
        <button id="admin-prev-week" aria-label="Previous week">&lt;</button>
        <span id="admin-week-label"></span>
        <button id="admin-next-week" aria-label="Next week">&gt;</button>
        <button id="admin-today-btn">Today</button>
      </div>
      <div id="admin-calendar-grid" class="calendar-grid" style="margin-bottom: 2rem;">
      <!-- Calendar rendered by renderAdminCalendar() -->
      </div>
    </div>
    
    <!-- Bookings List Section -->
    <div class="panel-header" style="margin-top: 2rem; margin-bottom: 1rem;">
      <h3>All Bookings</h3>
      <span class="info-text">${filteredBookings.length} ${filteredBookings.length === 1 ? 'booking' : 'bookings'} found</span>
    </div>
    
    <!-- Filters -->
    <div class="bookings-filters">
      <div class="filter-row">
        <div class="filter-group">
          <label for="filter-status">Status</label>
          <select id="filter-status" class="filter-input">
            <option value="all" ${bookingsFilters.status === 'all' ? 'selected' : ''}>All</option>
            <option value="pending" ${bookingsFilters.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="approved" ${bookingsFilters.status === 'approved' ? 'selected' : ''}>Approved</option>
            <option value="declined" ${bookingsFilters.status === 'declined' ? 'selected' : ''}>Declined</option>
            <option value="cancelled" ${bookingsFilters.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="filter-date-from">From</label>
          <input type="date" id="filter-date-from" class="filter-input" value="${bookingsFilters.dateFrom}">
        </div>
        
        <div class="filter-group">
          <label for="filter-date-to">To</label>
          <input type="date" id="filter-date-to" class="filter-input" value="${bookingsFilters.dateTo}">
        </div>
        
        <div class="filter-group filter-search">
          <label for="filter-search">Search</label>
          <input type="text" id="filter-search" class="filter-input" placeholder="Email or notes..." value="${bookingsFilters.search}">
        </div>
        
        <div class="filter-group filter-actions">
          <label>&nbsp;</label>
          <button id="filter-clear-btn" class="secondary" style="white-space: nowrap;">Clear Filters</button>
        </div>
      </div>
      
      <div class="filter-row" style="justify-content: space-between; align-items: center;">
        <button id="toggle-sort-btn" class="secondary" style="font-size: 0.9rem;">
          ${bookingsFilters.sortUpcoming ? '📅 Upcoming First' : '🕐 Newest First'}
        </button>
        ${pastBookings.length > 0 ? `
          <button class="secondary" id="toggle-past-bookings-btn" style="font-size: 0.9rem;">
            ${showPastBookings ? 'Hide Past' : 'Show Past'}
          </button>
        ` : ''}
      </div>
    </div>
  `;
  
  if (bookingsToShow.length === 0) {
    html += `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">
      No bookings found matching your filters.
    </div>`;
  } else {
    // Desktop table view
    html += `
      <div class="bookings-table-wrapper">
        <table class="table bookings-table-desktop">
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
            <td data-label="Date & Time">
              <b>${formatDateDDMMYY(start)}</b><br>
              ${formatTimeHM(start)} - ${formatTimeHM(end)}
              ${isPast ? '<span style="color: var(--text-muted); font-size: 0.8rem;"> (past)</span>' : ''}
            </td>
            <td data-label="User">${booking.userEmail}</td>
            <td data-label="Duration">${booking.durationMinutes} min</td>
            <td data-label="Status"><span class="badge ${statusClass}">${booking.status}</span></td>
            <td data-label="Notes">
              ${booking.userNotes ? `<div style="font-size: 0.85rem;">User: ${booking.userNotes}</div>` : ''}
              ${booking.adminNotes ? `<div style="font-size: 0.85rem; color: var(--primary);">Admin: ${booking.adminNotes}</div>` : ''}
              ${!booking.userNotes && !booking.adminNotes ? '<span style="color: var(--text-muted);">—</span>' : ''}
            </td>
            <td data-label="Actions" class="actions-cell">
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
      
      html += `
          </tbody>
        </table>
      </div>
      
      <!-- Mobile card view -->
      <div class="bookings-cards-mobile">
      `;
      
      for (const booking of bookingsToShow) {
        const start = new Date(booking.startISO);
        const end = new Date(booking.endISO);
        const isPast = start < now;
        const statusClass = booking.status === 'approved' ? 'badge-success' :
                           booking.status === 'declined' ? 'badge-danger' :
                           booking.status === 'cancelled' ? 'badge-secondary' : 'badge-warning';
        
        html += `
          <div class="booking-card ${isPast ? 'past' : ''}" data-id="${booking.id}">
            <div class="booking-card-header">
              <div>
                <div class="booking-card-date">${formatDateDDMMYY(start)}</div>
                <div class="booking-card-time">${formatTimeHM(start)} - ${formatTimeHM(end)}</div>
              </div>
              <span class="badge ${statusClass}">${booking.status}</span>
            </div>
            <div class="booking-card-body">
              <div class="booking-card-row">
                <span class="booking-card-label">User:</span>
                <span>${booking.userEmail}</span>
              </div>
              <div class="booking-card-row">
                <span class="booking-card-label">Duration:</span>
                <span>${booking.durationMinutes} minutes</span>
              </div>
              ${booking.userNotes || booking.adminNotes ? `
                <div class="booking-card-notes">
                  ${booking.userNotes ? `<div><b>User:</b> ${booking.userNotes}</div>` : ''}
                  ${booking.adminNotes ? `<div style="color: var(--primary);"><b>Admin:</b> ${booking.adminNotes}</div>` : ''}
                </div>
              ` : ''}
            </div>
            <div class="booking-card-actions">
              <button class="action-btn secondary view-btn" data-id="${booking.id}">View</button>
              ${booking.status === 'pending' && !isPast ? `
                <button class="action-btn success approve-btn" data-id="${booking.id}">Approve</button>
                <button class="action-btn danger decline-btn" data-id="${booking.id}">Decline</button>
              ` : booking.status === 'approved' && !isPast ? `
                <button class="action-btn danger cancel-booking-btn" data-id="${booking.id}">Cancel</button>
              ` : ''}
              <button class="action-btn danger delete-btn" data-id="${booking.id}">Delete</button>
            </div>
          </div>
        `;
      }
      
      html += `</div>`;
  }
  
  panel.innerHTML = html;
  
  // Render calendar (keep current week - don't auto-jump to first booking)
  // Admin can use navigation buttons to move to specific bookings
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

  // Swipe to change weeks on mobile (admin calendar)
  const adminSwipeTarget = panel.querySelector('.calendar-sticky-header');
  if (adminSwipeTarget) {
    let startX = 0, startY = 0, startPointerId = null;
    const SWIPE_THRESHOLD = 40;

    const goPrevWeek = () => {
      adminCurrentWeekStart = new Date(adminCurrentWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      renderAdminCalendar();
    };
    const goNextWeek = () => {
      adminCurrentWeekStart = new Date(adminCurrentWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      renderAdminCalendar();
    };

    adminSwipeTarget.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.buttons !== 1) return;
      startX = e.clientX;
      startY = e.clientY;
      startPointerId = e.pointerId;
    }, { passive: true });

    adminSwipeTarget.addEventListener('pointerup', (e) => {
      if (e.pointerId === startPointerId) {
        const diffX = e.clientX - startX;
        const diffY = e.clientY - startY;
        if (Math.abs(diffX) > SWIPE_THRESHOLD && Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX > 0) goPrevWeek();
          else goNextWeek();
        }
        startPointerId = null;
      }
    }, { passive: true });

    adminSwipeTarget.addEventListener('pointercancel', () => { startPointerId = null; }, { passive: true });
  }
  
  // Toggle past bookings button
  const togglePastBtn = document.getElementById('toggle-past-bookings-btn');
  if (togglePastBtn) {
    togglePastBtn.onclick = () => {
      showPastBookings = !showPastBookings;
      renderBookingsPanel();
    };
  }
  
  // Filter event handlers
  const filterStatus = document.getElementById('filter-status');
  const filterDateFrom = document.getElementById('filter-date-from');
  const filterDateTo = document.getElementById('filter-date-to');
  const filterSearch = document.getElementById('filter-search');
  const filterClearBtn = document.getElementById('filter-clear-btn');
  const toggleSortBtn = document.getElementById('toggle-sort-btn');
  
  if (filterStatus) {
    filterStatus.onchange = () => {
      bookingsFilters.status = filterStatus.value;
      renderBookingsPanel();
    };
  }
  
  if (filterDateFrom) {
    filterDateFrom.onchange = () => {
      bookingsFilters.dateFrom = filterDateFrom.value;
      renderBookingsPanel();
    };
  }
  
  if (filterDateTo) {
    filterDateTo.onchange = () => {
      bookingsFilters.dateTo = filterDateTo.value;
      renderBookingsPanel();
    };
  }
  
  if (filterSearch) {
    filterSearch.oninput = () => {
      // Debounce search input
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        bookingsFilters.search = filterSearch.value.trim();
        renderBookingsPanel();
      }, 250);
    };
  }
  
  if (filterClearBtn) {
    filterClearBtn.onclick = () => {
      bookingsFilters.status = 'all';
      bookingsFilters.dateFrom = '';
      bookingsFilters.dateTo = '';
      bookingsFilters.search = '';
      renderBookingsPanel();
    };
  }
  
  if (toggleSortBtn) {
    toggleSortBtn.onclick = () => {
      bookingsFilters.sortUpcoming = !bookingsFilters.sortUpcoming;
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
          ${formatDateDDMMYY(start)} ${formatTimeHM(start)} - ${formatTimeHM(end)} (${booking.durationMinutes} min)
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
  html += `<div style="margin-bottom: 1rem;"><strong>Date:</strong> ${formatDateDDMMYY(start)}</div>`;
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
    declineBtn.onclick = () => {
      closeSlidein();
      // Wait for close animation to complete before opening confirmation
      setTimeout(() => {
        handleDeclineBooking(bookingId);
      }, 450);
    };
  }
  
  const cancelBtn = document.getElementById('cancel-detail-btn');
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      closeSlidein();
      // Wait for close animation to complete before opening confirmation
      setTimeout(() => {
        handleCancelBooking(bookingId);
      }, 450);
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
    const booking = storage.getBookings().find(b => b.id === bookingId);
    if (!booking) {
      showToast('Booking not found', 'error');
      return;
    }
    
    // Find conflicting pending bookings
    const settings = storage.getSettings();
    const bufferMs = settings.bufferMinutes * 60 * 1000;
    const bookingStart = new Date(booking.startISO).getTime();
    const bookingEnd = new Date(booking.endISO).getTime();
    
    const conflictingBookings = storage.getBookings().filter(b => {
      if (b.id === bookingId) return false; // Skip the booking we're approving
      if (b.status !== 'pending') return false; // Only check pending bookings
      
      const bStart = new Date(b.startISO).getTime();
      const bEnd = new Date(b.endISO).getTime();
      
      // Check for overlap with buffer
      return (
        (bookingStart >= bStart - bufferMs && bookingStart < bEnd + bufferMs) ||
        (bookingEnd > bStart - bufferMs && bookingEnd <= bEnd + bufferMs) ||
        (bookingStart <= bStart - bufferMs && bookingEnd >= bEnd + bufferMs)
      );
    });
    
    // Approve the booking first
    await storage.setBookingStatus(bookingId, 'approved');
    
    // Send approval email (non-blocking)
    if (window.emailNotifications) {
      window.emailNotifications.notifyBookingEmail('BOOKING_APPROVED', bookingId);
    }
    
    // If there are conflicts, handle them
    if (conflictingBookings.length > 0) {
      const declineNote = prompt(
        `${conflictingBookings.length} other pending booking(s) conflict with this time slot.\n\n` +
        `They will be automatically declined.\n\n` +
        `Add a note to send to the user(s) (optional):`,
        'Another booking was approved for this time slot.'
      );
      
      // If user didn't cancel the prompt, decline the conflicting bookings
      if (declineNote !== null) {
        for (const conflictBooking of conflictingBookings) {
          try {
            await storage.setBookingStatus(
              conflictBooking.id, 
              'declined', 
              declineNote || 'Another booking was approved for this time slot.'
            );
            
            // Send decline email for each conflicting booking (non-blocking)
            if (window.emailNotifications) {
              window.emailNotifications.notifyBookingEmail('BOOKING_DECLINED', conflictBooking.id);
            }
          } catch (err) {
            console.error('Failed to decline conflicting booking:', err);
          }
        }
        showToast(`Booking approved. ${conflictingBookings.length} conflicting booking(s) declined.`, 'success');
      } else {
        showToast('Booking approved', 'success');
      }
    } else {
      showToast('Booking approved', 'success');
    }
    
    updatePendingBadge();
    renderBookingsPanel();
  } catch (error) {
    showToast(error.message || 'Failed to approve booking', 'error');
  }
}

function handleDeclineBooking(bookingId) {
  const booking = storage.getBookings().find(b => b.id === bookingId);
  if (!booking) {
    showToast('Booking not found', 'error');
    return;
  }
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2 style="color: var(--danger);">❌ Decline Booking</h2>`;
  html += `<div style="margin: 1.5rem 0;">
    <p style="font-size: 1.05rem; margin-bottom: 1rem;">Decline this booking request?</p>
    <div style="background: rgba(255, 255, 255, 0.05); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
      <p style="margin: 0.5rem 0;"><strong>User:</strong> ${booking.userEmail}</p>
      <p style="margin: 0.5rem 0;"><strong>Date:</strong> ${formatDateDDMMYY(new Date(booking.startISO))}</p>
      <p style="margin: 0.5rem 0;"><strong>Time:</strong> ${formatTimeHM(new Date(booking.startISO))} - ${formatTimeHM(new Date(booking.endISO))}</p>
    </div>
  </div>`;
  html += `<div class="form-group">
    <label for="decline-notes">Reason for decline (optional - will be sent to user):</label>
    <textarea id="decline-notes" rows="3" placeholder="e.g., Time slot no longer available..." style="width: 100%; padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-glass); background: var(--bg-input); color: var(--text-main); resize: vertical;"></textarea>
  </div>`;
  html += `<div class="form-actions" style="margin-top: 1.5rem;">
    <button type="button" class="danger" id="confirm-decline-btn">Decline Booking</button>
    <button type="button" class="secondary" id="cancel-decline-btn">Go Back</button>
  </div>`;
  
  openSlidein(html);
  
  setTimeout(() => {
    const panel = document.getElementById('slidein-panel');
    if (!panel) return;
    
    const closeBtn = panel.querySelector('.close-btn');
    const cancelBtn = panel.querySelector('#cancel-decline-btn');
    const confirmBtn = panel.querySelector('#confirm-decline-btn');
    
    if (closeBtn) closeBtn.onclick = closeSlidein;
    if (cancelBtn) cancelBtn.onclick = closeSlidein;
    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        const notes = document.getElementById('decline-notes').value.trim();
        
        try {
          await storage.setBookingStatus(bookingId, 'declined', notes || '');
          showToast('Booking declined', 'success');
          closeSlidein();
          
          // Send decline email (non-blocking)
          if (window.emailNotifications) {
            window.emailNotifications.notifyBookingEmail('BOOKING_DECLINED', bookingId);
          }
          
          updatePendingBadge();
          renderBookingsPanel();
        } catch (error) {
          showToast(error.message || 'Failed to decline booking', 'error');
        }
      };
    }
  }, 50);
}

function handleCancelBooking(bookingId) {
  const booking = storage.getBookings().find(b => b.id === bookingId);
  if (!booking) {
    showToast('Booking not found', 'error');
    return;
  }
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2 style="color: var(--danger);">⚠️ Cancel Booking</h2>`;
  html += `<div style="margin: 1.5rem 0;">
    <p style="font-size: 1.05rem; margin-bottom: 1rem;">Cancel this approved booking?</p>
    <div style="background: rgba(255, 255, 255, 0.05); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
      <p style="margin: 0.5rem 0;"><strong>User:</strong> ${booking.userEmail}</p>
      <p style="margin: 0.5rem 0;"><strong>Date:</strong> ${formatDateDDMMYY(new Date(booking.startISO))}</p>
      <p style="margin: 0.5rem 0;"><strong>Time:</strong> ${formatTimeHM(new Date(booking.startISO))} - ${formatTimeHM(new Date(booking.endISO))}</p>
      <p style="margin: 0.5rem 0;"><strong>Status:</strong> ${booking.status}</p>
    </div>
  </div>`;
  html += `<div class="form-group">
    <label for="cancel-notes">Reason for cancellation (optional - will be sent to user):</label>
    <textarea id="cancel-notes" rows="3" placeholder="e.g., Facility maintenance required..." style="width: 100%; padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-glass); background: var(--bg-input); color: var(--text-main); resize: vertical;"></textarea>
  </div>`;
  html += `<div class="form-actions" style="margin-top: 1.5rem;">
    <button type="button" class="danger" id="confirm-cancel-booking-btn">Cancel Booking</button>
    <button type="button" class="secondary" id="back-cancel-booking-btn">Go Back</button>
  </div>`;
  
  openSlidein(html);
  
  setTimeout(() => {
    const panel = document.getElementById('slidein-panel');
    if (!panel) return;
    
    const closeBtn = panel.querySelector('.close-btn');
    const backBtn = panel.querySelector('#back-cancel-booking-btn');
    const confirmBtn = panel.querySelector('#confirm-cancel-booking-btn');
    
    if (closeBtn) closeBtn.onclick = closeSlidein;
    if (backBtn) backBtn.onclick = closeSlidein;
    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        const notes = document.getElementById('cancel-notes').value.trim();
        
        try {
          await storage.setBookingStatus(bookingId, 'cancelled', notes || '');
          showToast('Booking cancelled', 'success');
          closeSlidein();
          
          // Send cancellation email (non-blocking)
          if (window.emailNotifications) {
            window.emailNotifications.notifyBookingEmail('BOOKING_CANCELLED', bookingId);
          }
          
          updatePendingBadge();
          renderBookingsPanel();
        } catch (error) {
          showToast(error.message || 'Failed to cancel booking', 'error');
        }
      };
    }
  }, 50);
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
      <p style="margin: 0.5rem 0;"><strong>Date:</strong> ${formatDateDDMMYY(new Date(booking.startISO))}</p>
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
      updatePendingBadge();
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
      updatePendingBadge();
      renderBookingsPanel();
    } catch (error) {
      showToast(error.message || 'Failed to update booking', 'error');
    }
  };
}

function openCreateBookingForm(slotISO) {
  if (!slotISO) {
    showToast('Please select a time slot on the calendar first', 'error');
    return;
  }
  const startDate = new Date(slotISO);
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>Add New Booking</h2>`;
  html += `<p style="color: var(--text-muted); margin-bottom: 1rem;">Create a one-off booking without requiring a user account.</p>`;
  html += `<form id="create-booking-form">
    <div class="form-group">
      <label>Date & Time</label>
      <input type="text" value="${formatDateDDMMYY(startDate)} ${formatTimeHM(startDate)}" disabled>
    </div>
    <div class="form-group">
      <label for="create-duration">Duration</label>
      <select id="create-duration" required>
        <option value="60">1 hour</option>
        <option value="120">2 hours</option>
        <option value="180">3 hours</option>
        <option value="240">4 hours</option>
        <option value="300">5 hours</option>
        <option value="360">6 hours</option>
        <option value="420">7 hours</option>
        <option value="480">8 hours</option>
      </select>
    </div>
    <div class="form-group">
      <label for="create-client-name">Client / Display Name</label>
      <input type="text" id="create-client-name" placeholder="Walk-in" value="Walk-in">
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
    const durationMinutes = parseInt(document.getElementById('create-duration').value);
    const userNotes = document.getElementById('create-user-notes').value.trim();
    const adminNotes = document.getElementById('create-admin-notes').value.trim();
    
    const endDate = addMinutes(startDate, durationMinutes);
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();
    
    try {
      await storage.adminCreateBooking(startISO, endISO, clientName, userNotes, adminNotes);
      showToast('Booking created', 'success');
      closeSlidein();
      updatePendingBadge();
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
      
      // Update pending badge immediately
      updatePendingBadge();
      
      // Make pending badge clickable
      const pendingBadge = document.getElementById('pending-badge');
      if (pendingBadge) {
        pendingBadge.style.cursor = 'pointer';
        pendingBadge.onclick = () => switchPanel('bookings');
      }
      
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
  const name = window.CONFIG?.branding?.appNameAdmin || 'Admin';
  document.title = name;
  const logo = document.getElementById('adminLogo');
  if (logo) logo.textContent = name;
  await init();
});

})();
