// ============================================================
// APP.JS - Public Booking UI (Password Auth)
// Password-based access with Supabase Auth
// ============================================================

(() => {
'use strict';

const {
  formatTimeHM, formatDateYMD, formatDateWeekday, getISOWeek, getWeekStart, addDays, addMinutes, minutesBetween,
  showToast, openSlidein, closeSlidein
} = window.utils;

const storage = window.storage;

let currentUser = null;
let currentWeekStart = getWeekStart(new Date());

// ============================================================
// AUTH & USER BAR
// ============================================================

function renderUserBar() {
  const bar = document.getElementById('user-bar');
  
  if (!currentUser) {
    // Login form is on login-page - nothing to render in user-bar
    return;
  }
  
  {
    // Check if needs password change
    if (storage.needsPasswordChange()) {
      openPasswordChangePanel();
    }
    
    const profile = storage.getProfiles().find(p => p.user_id === currentUser.id);
    const displayName = profile?.name || currentUser.email.split('@')[0];
    const membership = profile?.membership || 'standard';
    
    // Check if user has used weekly limit
    let badge = '';
    if (membership === 'subscribed') {
      const thisWeek = getISOWeek(new Date());
      const approvedThisWeek = storage.getBookings().filter(b =>
        b.userId === currentUser.id &&
        b.status === 'approved' &&
        getISOWeek(new Date(b.startISO)) === thisWeek
      ).length;
      
      if (approvedThisWeek >= 1) {
        badge = '<span class="activity-badge" title="Weekly booking used">1/1</span>';
      }
    }
    
    bar.innerHTML = `
      <span>Logged in as <b>${displayName}</b> <span class="user-type">(${membership})</span> ${badge}</span>
      <button id="my-bookings-btn">My Bookings</button>
      <button id="logout-btn">Logout</button>
    `;
    
    document.getElementById('logout-btn').onclick = handleLogout;
    document.getElementById('my-bookings-btn').onclick = openMyBookingsPanel;
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showLoginView() {
  hideLoadingOverlay();
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('reset-password-page').style.display = 'none';
  document.getElementById('app-view').style.display = 'none';
  const form = document.getElementById('login-form');
  if (form) form.onsubmit = handlePasswordLogin;
  const forgotLink = document.getElementById('forgot-password-link');
  if (forgotLink) forgotLink.onclick = handleForgotPasswordClick;
}

function showResetPasswordView() {
  hideLoadingOverlay();
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('reset-password-page').style.display = 'flex';
  document.getElementById('app-view').style.display = 'none';
  const form = document.getElementById('reset-password-form');
  if (form) form.onsubmit = handleResetPasswordSubmit;
  document.getElementById('reset-status').textContent = '';
  document.getElementById('reset-new-password').value = '';
  document.getElementById('reset-confirm-password').value = '';
}

function handleForgotPasswordClick(e) {
  e.preventDefault();
  const email = document.getElementById('login-email')?.value?.trim() || prompt('Enter your email to receive a password reset link:');
  if (!email) return;
  const btn = document.getElementById('login-submit-btn');
  const statusEl = document.getElementById('login-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  statusEl.textContent = '';
  window.supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + (window.location.pathname || '/')
  }).then(({ error }) => {
    if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
    if (error) {
      statusEl.innerHTML = `<div style="color: var(--danger); margin-top: 1rem;">${error.message}</div>`;
    } else {
      statusEl.innerHTML = `<div style="color: var(--success); margin-top: 1rem;">Check your email for the reset link.</div>`;
    }
  });
}

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  const newPw = document.getElementById('reset-new-password').value;
  const confirmPw = document.getElementById('reset-confirm-password').value;
  const statusEl = document.getElementById('reset-status');
  const submitBtn = document.getElementById('reset-submit-btn');
  if (newPw.length < 8) {
    statusEl.textContent = 'Password must be at least 8 characters';
    statusEl.style.color = 'var(--danger)';
    return;
  }
  if (newPw !== confirmPw) {
    statusEl.textContent = 'Passwords do not match';
    statusEl.style.color = 'var(--danger)';
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Setting...';
  statusEl.textContent = '';
  statusEl.style.color = '';
  try {
    await storage.changePassword(newPw);
    await storage.signOut();
    statusEl.textContent = 'Password updated. You can now log in.';
    statusEl.style.color = 'var(--success)';
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname || '/');
    }
    setTimeout(() => {
      currentUser = null;
      showLoginView();
      showToast('Password set. You can now log in.');
    }, 2000);
  } catch (err) {
    statusEl.textContent = err.message || 'Failed to set password';
    statusEl.style.color = 'var(--danger)';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Set password';
  }
}

function showAppView() {
  hideLoadingOverlay();
  document.getElementById('app-view').style.display = 'block';
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('reset-password-page').style.display = 'none';
}

async function handlePasswordLogin(e) {
  e.preventDefault();
  
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const submitBtn = document.getElementById('login-submit-btn');
  const statusEl = document.getElementById('login-status');
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  // Disable form
  emailInput.disabled = true;
  passwordInput.disabled = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in...';
  statusEl.textContent = '';
  
  try {
    await storage.signInWithPassword(email, password);
    
    // Success - will trigger auth state change
    showToast('Logged in successfully!');
    showAppView();
    await init();
  } catch (error) {
    const errMsg = (error?.message != null && String(error.message)) ? error.message : 'Login failed';
    statusEl.innerHTML = `
      <div style="color: var(--danger); margin-top: 1rem; padding: 1rem; background: rgba(239, 68, 68, 0.1); border-radius: var(--radius-md);">
        ${errMsg}
      </div>
    `;
    
    // Re-enable form
    emailInput.disabled = false;
    passwordInput.disabled = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Login';
  }
}

async function handleLogout() {
  await storage.signOut();
  currentUser = null;
  showLoginView();
  showToast('Logged out');
}


// ============================================================
// PASSWORD CHANGE PANEL
// ============================================================

function openPasswordChangePanel() {
  const panel = document.getElementById('slidein-panel');
  if (!panel) return;
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>Change Password Required</h2>`;
  html += `<p style="color: var(--text-muted); margin-bottom: 1.5rem;">You must change your password on first login.</p>`;
  
  html += `<form id="password-change-form" style="display: flex; flex-direction: column; gap: 1rem;">`;
  html += `<div>`;
  html += `<label for="new-password" style="display: block; margin-bottom: 0.5rem; font-weight: 500;">New Password:</label>`;
  html += `<input type="password" id="new-password" required minlength="8" autocomplete="new-password" style="width: 100%; padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-glass); background: var(--bg-glass); color: var(--text-main);">`;
  html += `<small style="color: var(--text-muted); display: block; margin-top: 0.25rem;">Minimum 8 characters</small>`;
  html += `</div>`;
  html += `<div>`;
  html += `<label for="confirm-password" style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Confirm Password:</label>`;
  html += `<input type="password" id="confirm-password" required minlength="8" autocomplete="new-password" style="width: 100%; padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-glass); background: var(--bg-glass); color: var(--text-main);">`;
  html += `</div>`;
  html += `<button type="submit" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: var(--primary); color: #232526; border: none; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer;">Change Password</button>`;
  html += `</form>`;
  
  openSlidein(html);
  const closeBtn = panel?.querySelector('.close-btn');
  if (closeBtn) closeBtn.style.display = 'none';
  
  // Handle form submit
  const form = document.getElementById('password-change-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Changing...';
    
    try {
      await storage.changePassword(newPassword);
      await storage.markPasswordChanged();
      
      showToast('Password changed successfully!');
      closeSlidein();
      await init();
    } catch (error) {
      showToast(error.message || 'Failed to change password', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Change Password';
    }
  };
}

// ============================================================
// MY BOOKINGS PANEL
// ============================================================

function openMyBookingsPanel() {
  const bookings = storage.getBookings()
    .filter(b => b.userId === currentUser.id)
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>My Bookings</h2>`;
  
  if (bookings.length === 0) {
    html += `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No bookings found.</div>`;
  } else {
    html += `<ul class="my-bookings-list">`;
    for (const b of bookings) {
      const statusClass = b.status === 'approved' ? 'approved' :
                         b.status === 'declined' ? 'declined' :
                         b.status === 'cancelled' ? 'cancelled' : 'pending';
      
      html += `<li>
        <b>${formatDateYMD(new Date(b.startISO))}</b> 
        ${formatTimeHM(new Date(b.startISO))}–${formatTimeHM(new Date(b.endISO))}
        <span class="status status-${statusClass}">${b.status}</span>
        ${b.userNotes ? `<div class="notes">Note: ${b.userNotes}</div>` : ''}
        ${b.adminNotes ? `<div class="admin-notes">Admin: ${b.adminNotes}</div>` : ''}
        ${b.status === 'pending' ? `<button class="cancel-booking-btn" data-id="${b.id}">Cancel</button>` : ''}
      </li>`;
    }
    html += `</ul>`;
  }
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  
  document.querySelectorAll('.cancel-booking-btn').forEach(btn => {
    btn.onclick = () => confirmCancelBooking(btn.getAttribute('data-id'));
  });
}

function confirmCancelBooking(bookingId) {
  const booking = storage.getBookings().find(b => b.id === bookingId);
  if (!booking) {
    showToast('Booking not found', 'error');
    return;
  }
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2 style="color: var(--danger);">⚠️ Cancel Booking</h2>`;
  html += `<div style="margin: 1.5rem 0;">
    <p style="font-size: 1.1rem; margin-bottom: 1rem;">Are you sure you want to cancel this booking?</p>
    <div style="background: rgba(255, 255, 255, 0.05); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
      <p style="margin: 0.5rem 0;"><strong>Date:</strong> ${formatDateYMD(new Date(booking.startISO))}</p>
      <p style="margin: 0.5rem 0;"><strong>Time:</strong> ${formatTimeHM(new Date(booking.startISO))} - ${formatTimeHM(new Date(booking.endISO))}</p>
      <p style="margin: 0.5rem 0;"><strong>Status:</strong> ${booking.status}</p>
    </div>
    <p style="color: var(--text-muted);">You can request a new booking anytime.</p>
  </div>`;
  html += `<div class="form-actions">
    <button class="danger" id="confirm-cancel-btn">Yes, Cancel Booking</button>
    <button class="secondary" id="back-cancel-btn">Go Back</button>
  </div>`;
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.getElementById('back-cancel-btn').onclick = () => {
    closeSlidein();
    openMyBookingsPanel();
  };
  document.getElementById('confirm-cancel-btn').onclick = async () => {
    try {
      await storage.cancelBooking(bookingId);
      showToast('Booking cancelled', 'success');
      closeSlidein();
      renderCalendar();
    } catch (error) {
      showToast(error.message || 'Failed to cancel booking', 'error');
    }
  };
}

// ============================================================
// CALENDAR RENDERING
// ============================================================

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const settings = storage.getSettings();
  const bookings = storage.getBookings();
  
  const weekStart = currentWeekStart;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  // Parse business hours
  const openHM = settings.openTime.split(':').map(Number);
  const closeHM = settings.closeTime.split(':').map(Number);
  let closeHour = closeHM[0];
  if (closeHour === 0) closeHour = 24;
  
  const slotInterval = settings.slotIntervalMinutes;
  const startMinutes = openHM[0] * 60 + openHM[1];
  const endMinutes = closeHour * 60;
  
  // Generate time slots
  const timeSlots = [];
  for (let m = startMinutes; m < endMinutes; m += slotInterval) {
    timeSlots.push(m);
  }
  
  // Render grid
  let html = '<div class="calendar-wrapper">';
  
  // Header row (days)
  html += '<div class="calendar-header">';
  html += '<div class="time-col"></div>';
  for (const day of days) {
    const isToday = formatDateYMD(day) === formatDateYMD(new Date());
    html += `<div class="day-header ${isToday ? 'today' : ''}">
      <div class="day-name">${formatDateWeekday(day)}</div>
      <div class="day-date">${day.getDate()}</div>
    </div>`;
  }
  html += '</div>';
  
  // Time slots
  const now = new Date();
  
  for (const minutes of timeSlots) {
    html += '<div class="time-row">';
    
    // Time label
    const hour = Math.floor(minutes / 60);
    const min = minutes % 60;
    html += `<div class="time-label">${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}</div>`;
    
    // Day slots
    for (const day of days) {
      const slotDate = new Date(day);
      slotDate.setHours(hour, min, 0, 0);
      const slotISO = slotDate.toISOString();
      
      // Check if in past (disable for users)
      const isPast = slotDate < now;
      
      // Check booking status
      let slotClass = 'slot-cell available';
      let slotData = '';
      
      if (isPast) {
        slotClass = 'slot-cell past';
      } else {
        const booking = bookings.find(b => {
          if (b.status === 'cancelled' || b.status === 'declined') return false;
          const start = new Date(b.startISO);
          const end = new Date(b.endISO);
          return slotDate >= start && slotDate < end;
        });
        
        if (booking) {
          if (booking.status === 'approved') {
            slotClass = 'slot-cell booked';
          } else if (booking.status === 'pending') {
            slotClass = 'slot-cell pending';
          }
        }
        
        slotData = `data-date="${slotISO}"`;
      }
      
      html += `<div class="${slotClass}" ${slotData}></div>`;
    }
    
    html += '</div>';
  }
  
  html += '</div>';
  grid.innerHTML = html;
  
  // Bind click events only to available slots
  if (currentUser) {
    document.querySelectorAll('.slot-cell.available[data-date]').forEach(cell => {
      cell.onclick = () => openBookingPanel(cell.getAttribute('data-date'));
    });
  }
  
  renderMyBookingsList();
}

// ============================================================
// MY BOOKINGS LIST (below calendar - includes cancelled/declined)
// ============================================================

function renderMyBookingsList() {
  const listEl = document.getElementById('my-bookings-list');
  const sectionEl = document.getElementById('my-bookings-section');
  if (!listEl || !sectionEl) return;
  
  if (!currentUser) {
    sectionEl.style.display = 'none';
    return;
  }
  
  const bookings = storage.getBookings()
    .filter(b => b.userId === currentUser.id)
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
  
  sectionEl.style.display = 'block';
  
  if (bookings.length === 0) {
    listEl.innerHTML = '<p class="bookings-list-empty">No bookings yet.</p>';
    return;
  }
  
  let html = '<ul class="bookings-list">';
  for (const b of bookings) {
    const statusClass = b.status === 'approved' ? 'approved' :
                       b.status === 'declined' ? 'declined' :
                       b.status === 'cancelled' ? 'cancelled' : 'pending';
    html += `<li class="booking-item status-${statusClass}">
      <span class="booking-date">${formatDateYMD(new Date(b.startISO))}</span>
      <span class="booking-time">${formatTimeHM(new Date(b.startISO))}–${formatTimeHM(new Date(b.endISO))}</span>
      <span class="booking-status status-${statusClass}">${b.status}</span>
      ${b.status === 'pending' ? `<button class="cancel-booking-btn small" data-id="${b.id}">Cancel</button>` : ''}
    </li>`;
  }
  html += '</ul>';
  listEl.innerHTML = html;
  
  listEl.querySelectorAll('.cancel-booking-btn').forEach(btn => {
    btn.onclick = () => confirmCancelBooking(btn.getAttribute('data-id'));
  });
}

// ============================================================
// BOOKING PANEL
// ============================================================

function openBookingPanel(startISO) {
  if (!currentUser) {
    showToast('Please log in to book', 'error');
    return;
  }
  
  const startDate = new Date(startISO);
  
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>Request Booking</h2>`;
  html += `<form id="booking-form" class="booking-form">
    <div class="form-group">
      <label>Date & Time</label>
      <input type="text" value="${formatDateYMD(startDate)} ${formatTimeHM(startDate)}" disabled>
    </div>
    <div class="form-group">
      <label for="booking-duration">Duration</label>
      <select id="booking-duration" required>
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
      <label for="booking-notes">Notes (optional)</label>
      <textarea id="booking-notes" rows="3" placeholder="Any special requests or notes..."></textarea>
    </div>
    <div class="form-actions">
      <button type="submit" class="primary">Submit Request</button>
      <button type="button" class="secondary" id="cancel-booking-form">Cancel</button>
    </div>
  </form>`;
  
  openSlidein(html);
  
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.getElementById('cancel-booking-form').onclick = closeSlidein;
  document.getElementById('booking-form').onsubmit = (e) => submitBookingRequest(e, startISO);
}

async function submitBookingRequest(e, startISO) {
  e.preventDefault();
  
  const durationMinutes = parseInt(document.getElementById('booking-duration').value);
  const notes = document.getElementById('booking-notes').value.trim();
  
  const startDate = new Date(startISO);
  const endDate = addMinutes(startDate, durationMinutes);
  const endISO = endDate.toISOString();
  
  // Disable form
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  
  try {
    // Request booking via RPC (server validates everything)
    await storage.requestBooking(startISO, endISO, notes);
    
    showToast('Booking request submitted! Waiting for admin approval.', 'success');
    closeSlidein();
    renderCalendar();
  } catch (error) {
    // Server returned validation error
    showToast(error.message || 'Failed to create booking', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Request';
  }
}

// ============================================================
// WEEK NAVIGATION
// ============================================================

function updateWeekLabel() {
  const weekNum = getISOWeek(currentWeekStart);
  const year = currentWeekStart.getFullYear();
  const weekEnd = addDays(currentWeekStart, 6);
  
  document.getElementById('week-label').textContent = 
    `Week ${weekNum}, ${year} (${formatDateYMD(currentWeekStart)} – ${formatDateYMD(weekEnd)})`;
}

function bindWeekNav() {
  const prevBtn = document.getElementById('prev-week');
  const nextBtn = document.getElementById('next-week');
  const todayBtn = document.getElementById('today-btn');
  
  prevBtn.onclick = () => {
    // Don't allow navigating to past weeks for users
    const newWeekStart = addDays(currentWeekStart, -7);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (newWeekStart < today) {
      showToast('Cannot view past weeks', 'error');
      return;
    }
    
    currentWeekStart = newWeekStart;
    updateWeekLabel();
    renderCalendar();
  };
  
  nextBtn.onclick = () => {
    currentWeekStart = addDays(currentWeekStart, 7);
    updateWeekLabel();
    renderCalendar();
  };
  
  todayBtn.onclick = () => {
    currentWeekStart = getWeekStart(new Date());
    updateWeekLabel();
    renderCalendar();
  };
}

// ============================================================
// INITIALIZATION
// ============================================================

function isRecoveryHash() {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return false;
  const params = new URLSearchParams(hash.substring(1));
  return params.get('type') === 'recovery';
}

async function init() {
  try {
    const isRecovery = isRecoveryHash();
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Load timeout')), 30000)
    );
    
    await Promise.race([storage.loadAll(), timeoutPromise]);
    currentUser = storage.getCurrentUser();

    if (isRecovery) {
      if (currentUser) {
        showResetPasswordView();
      } else {
        showLoginView();
        showToast('Reset link expired or invalid. Request a new one.', 'error');
      }
      return;
    }

    if (!currentUser) {
      showLoginView();
      return;
    }

    showAppView();
    renderUserBar();
    updateWeekLabel();
    renderCalendar();
    bindWeekNav();
    showToast(`Welcome back, ${(currentUser?.email || 'User').split('@')[0]}!`);
  } catch (error) {
    console.error('Initialization error:', error);
    hideLoadingOverlay();
    showLoginView();
    showToast(error?.message?.includes('timeout') ? 'Connection timeout. Please refresh.' : 'Failed to load application', 'error');
  }
}

// Start the app
document.addEventListener('DOMContentLoaded', async () => {
  await init();
});

})();
