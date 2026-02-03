(() => {
// app.js - Public booking UI logic for Studio94
// Handles login, calendar rendering, booking form, and user session

const {
  formatTimeHM, formatDateYMD, formatDateWeekday, getISOWeek, getWeekStart, addDays, addMinutes, minutesBetween, clamp,
  simpleHash, showToast, showConfirmDialog, openSlidein, closeSlidein
} = window.utils;
const {
  getSettings, getUsers, getUserByEmail, getUserById, getBookings, addBooking, checkBookingConflict
} = window.storage;

let currentUser = null;
let currentWeekStart = getWeekStart(new Date());

// --- User Auth ---
function renderUserBar() {

  const bar = document.getElementById('user-bar');
  if (!currentUser) {
    bar.innerHTML = `
      <form id="login-form" class="login-form">
        <input type="email" id="login-email" placeholder="Email" required autocomplete="username">
        <input type="password" id="login-pin" placeholder="PIN" required autocomplete="current-password" maxlength="8">
        <button type="submit">Login</button>
      </form>
    `;
    document.getElementById('login-form').onsubmit = loginSubmit;
  } else {
    const badge = (currentUser.membership === 'subscribed' && userHasApprovedThisWeek())
      ? '<span class="activity-badge" title="Weekly booking used">1/1</span>' : '';
    bar.innerHTML = `
      <span>Logged in as <b>${currentUser.name}</b> <span class="user-type">(${currentUser.membership})</span> ${badge}</span>
      <button id="my-bookings-btn">My bookings</button>
      <button id="logout-btn">Logout</button>
    `;
    document.getElementById('logout-btn').onclick = () => { currentUser = null; renderUserBar(); renderCalendar(); };
    document.getElementById('my-bookings-btn').onclick = openMyBookingsPanel;
  // --- My Bookings Slide-in ---
  function openMyBookingsPanel() {
    function safeDateYMD(value) {
      const d = new Date(value);
      return isNaN(d) ? 'Invalid date' : formatDateYMD(d);
    }
    function safeTimeHM(value) {
      const d = new Date(value);
      return isNaN(d) ? '--:--' : formatTimeHM(d);
    }
    const bookings = getBookings().filter(b => b.userId === currentUser.id).sort((a, b) => {
      const da = new Date(a.startISO), db = new Date(b.startISO);
      if (isNaN(da) && isNaN(db)) return 0;
      if (isNaN(da)) return 1;
      if (isNaN(db)) return -1;
      return da - db;
    });
    let html = `<button class="close-btn" aria-label="Close">×</button>`;
    html += `<h2>My Bookings</h2>`;
    if (bookings.length === 0) {
      html += `<div>No bookings found.</div>`;
    } else {
      html += `<ul class="my-bookings-list">`;
      for (const b of bookings) {
        html += `<li>
          <b>${safeDateYMD(b.startISO)}</b> ${safeTimeHM(b.startISO)}–${safeTimeHM(b.endISO)}
          <span class="status">${b.status}</span>
          ${b.notes ? `<div class="notes">${b.notes}</div>` : ''}
          ${(b.status === 'pending' || b.status === 'approved') ? `<button class="cancel-booking-btn" data-id="${b.id}">Cancel</button>` : ''}
        </li>`;
      }
      html += `</ul>`;
    }
    openSlidein(html);
    document.querySelector('.close-btn').onclick = closeSlidein;
    document.querySelectorAll('.cancel-booking-btn').forEach(btn => {
      btn.onclick = () => cancelMyBooking(btn.getAttribute('data-id'));
    });
  }

  function cancelMyBooking(id) {
    showConfirmDialog({
      title: 'Cancel Booking',
      message: 'Are you sure you want to cancel this booking?',
      onConfirm: () => {
        window.storage.updateBooking(id, { status: 'cancelled' });
        closeSlidein();
        renderCalendar();
        showToast('Booking cancelled', 'success');
      }
    });
  }
  }
}
function loginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pin = document.getElementById('login-pin').value.trim();
  const user = getUserByEmail(email);
  if (!user || user.pinHash !== simpleHash(pin)) {
    showToast('Invalid email or PIN', 'error');
    return;
  }
  currentUser = user;
  renderUserBar();
  renderCalendar();
  showToast('Logged in!');
}

// --- Calendar Logic ---
// Sanity check: booking at 10:30 for 3h should cover 6 half-hour slots until 13:30.
// Buffer=30min blocks a booking starting at 13:30 if another ends at 13:00.
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const settings = getSettings();
  const bookings = getBookings();
  const weekStart = currentWeekStart;
  const days = Array.from({length:7}, (_,i)=>addDays(weekStart,i));
  const openHM = settings.openTime.split(':').map(Number);
  const closeHM = settings.closeTime.split(':').map(Number);
  let closeHour = closeHM[0];
  if (closeHour === 0) closeHour = 24;
  const slotInterval = settings.slotIntervalMinutes;
  
  // Generate time slots in minutes from start
  const startMinutes = openHM[0] * 60 + openHM[1];
  const endMinutes = closeHour * 60;
  const slots = [];
  for (let m = startMinutes; m < endMinutes; m += slotInterval) {
    slots.push(m);
  }
  
  // Header
  let html = '<div class="calendar-header"></div>';
  for(const d of days) {
    html += `<div class="calendar-header">${formatDateWeekday(d)}<br>${formatDateYMD(d)}</div>`;
  }
  // Rows
  for(const m of slots) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    // Show time label for both :00 and :30
    const timeLabel = `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
    html += `<div class="time-col">${timeLabel}</div>`;
    for(let day=0; day<7; day++) {
      const slotDate = new Date(days[day]);
      slotDate.setHours(h, min, 0, 0);
      const slotISO = slotDate.toISOString();
      const slotStatus = getSlotStatus(slotDate, bookings, settings);
      let cellClass = 'slot-cell';
      let cellLabel = '';
      if (slotStatus.blocked) {
        cellClass += ' blocked';
        cellLabel = slotStatus.label;
      } else if (slotStatus.tentative) {
        cellClass += ' tentative';
        cellLabel = slotStatus.label;
      } else {
        cellClass += ' available';
        cellLabel = '';
      }
      html += `<div class="${cellClass}" data-slot="${slotISO}">${cellLabel}</div>`;
    }
  }
  grid.innerHTML = html;
  // Click handlers
  document.querySelectorAll('.slot-cell.available').forEach(cell => {
    cell.onclick = () => {
      if (typeof console !== 'undefined' && console.log) console.log('slot click', cell.getAttribute('data-slot'));
      onSlotClick(cell.getAttribute('data-slot'));
    };
  });
  document.getElementById('week-label').textContent = `Week ${getISOWeek(weekStart)} (${formatDateYMD(weekStart)})`;
}

function getSlotStatus(slotDate, bookings, settings) {
  // Returns {blocked, tentative, label}
  const slotISO = slotDate.toISOString();
  let blocked = false, tentative = false, label = '';
  for(const b of bookings) {
    if (b.status === 'declined' || b.status === 'cancelled') continue;
    const bStart = new Date(b.startISO);
    const bEnd = new Date(b.endISO);
    const buffer = settings.bufferMinutes;
    if (slotDate >= addMinutes(bStart, -buffer) && slotDate < addMinutes(bEnd, buffer)) {
      if (b.status === 'approved') { blocked = true; label = 'Booked'; break; }
      if (b.status === 'pending') { tentative = true; label = 'Pending'; }
    }
  }
  return { blocked, tentative, label };
}

function onSlotClick(slotISO) {
  if (!currentUser) {
    showToast('Please log in to book.', 'error');
    return;
  }
  openBookingPanel(slotISO);
}

function openBookingPanel(slotISO) {
  const settings = getSettings();
  const bookings = getBookings();
  const slotDate = new Date(slotISO);
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>Book ${formatDateWeekday(slotDate)} ${formatTimeHM(slotDate)}</h2>`;
  html += `<form id="booking-form">
    <div class="form-group">
      <label for="duration">Duration (hours)</label>
      <select id="duration" name="duration">
        ${[...Array(8)].map((_,i)=>`<option value="${i+1}">${i+1} hour${i>0?'s':''}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label for="notes">Notes for admin (optional)</label>
      <textarea id="notes" name="notes" maxlength="200"></textarea>
    </div>
    <div class="form-group">
      <div id="end-time-preview"></div>
      <div id="booking-warning" class="error-msg"></div>
    </div>
    <div class="form-actions">
      <button type="submit">Request Booking</button>
      <button type="button" class="secondary" id="cancel-btn">Cancel</button>
    </div>
  </form>`;
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.getElementById('cancel-btn').onclick = closeSlidein;
  const durationSel = document.getElementById('duration');
  durationSel.onchange = () => updateBookingPreview(slotDate, bookings, settings);
  updateBookingPreview(slotDate, bookings, settings);
  document.getElementById('booking-form').onsubmit = (e) => submitBooking(e, slotDate, bookings, settings);
}

function updateBookingPreview(slotDate, bookings, settings) {
  const duration = parseInt(document.getElementById('duration').value);
  const endDate = addMinutes(slotDate, duration * 60);
  document.getElementById('end-time-preview').textContent = `End time: ${formatTimeHM(endDate)}`;
  const warning = getBookingConflictWarning(slotDate, endDate, bookings, settings);
  document.getElementById('booking-warning').textContent = warning || '';
}

function getBookingConflictWarning(start, end, bookings, settings) {
  // Check for buffer, overlap, and cap
  const buffer = settings.bufferMinutes;
  const slotInterval = settings.slotIntervalMinutes;
  const closeHM = settings.closeTime.split(':').map(Number);
  let closeHour = closeHM[0];
  if (closeHour === 0) closeHour = 24;
  const closeDate = new Date(start);
  closeDate.setHours(closeHour,0,0,0);
  if (end > closeDate) return 'Booking exceeds closing time.';
  for(const b of bookings) {
    if (b.status === 'declined' || b.status === 'cancelled') continue;
    const bStart = new Date(b.startISO);
    const bEnd = new Date(b.endISO);
    if ((start < addMinutes(bEnd, buffer)) && (end > addMinutes(bStart, -buffer))) {
      return b.status === 'approved' ? 'Conflicts with approved booking.' : 'Conflicts with pending booking.';
    }
  }
  // Weekly cap for subscribed users removed: allow multiple requests per week
  return '';
}

function submitBooking(e, slotDate, bookings, settings) {
  e.preventDefault();
  const duration = parseInt(document.getElementById('duration').value);
  const endDate = addMinutes(slotDate, duration * 60);
  
  // Use centralized conflict validation
  const check = checkBookingConflict({
    startISO: slotDate.toISOString(),
    endISO: endDate.toISOString(),
    excludeId: null
  });
  
  if (!check.ok) {
    if (check.conflict) {
      const conflictStart = formatTimeHM(new Date(check.conflict.startISO));
      const conflictDate = formatDateYMD(new Date(check.conflict.startISO));
      showToast(`Conflicts with ${check.conflict.status} booking at ${conflictDate} ${conflictStart}`, 'error');
    } else {
      showToast(check.reason || 'Booking conflict', 'error');
    }
    return;
  }
  
  const notes = document.getElementById('notes').value.trim();
  const now = new Date();
  addBooking({
    id: 'b'+now.getTime(),
    userId: currentUser.id,
    startISO: slotDate.toISOString(),
    endISO: endDate.toISOString(),
    durationMinutes: duration*60,
    notes,
    status: 'pending',
    createdAtISO: now.toISOString(),
    updatedAtISO: now.toISOString()
  });
  closeSlidein();
  renderCalendar();
  showToast('Booking request submitted!', 'success');
}

function userHasApprovedThisWeek() {
  if (!currentUser) return false;
  const bookings = getBookings();
  const weekStart = currentWeekStart;
  const weekEnd = addDays(weekStart, 7);
  return bookings.some(b => b.userId === currentUser.id && b.status === 'approved' && new Date(b.startISO) >= weekStart && new Date(b.startISO) < weekEnd);
}

// --- Week Navigation ---
function bindWeekNav() {
  const prev = document.getElementById('prev-week');
  const next = document.getElementById('next-week');
  const today = document.getElementById('today-btn');
  if (prev) prev.onclick = () => { currentWeekStart = addDays(currentWeekStart, -7); renderCalendar(); };
  if (next) next.onclick = () => { currentWeekStart = addDays(currentWeekStart, 7); renderCalendar(); };
  if (today) today.onclick = () => { currentWeekStart = getWeekStart(new Date()); renderCalendar(); };
}

// --- Init ---
function init() {
  renderUserBar();
  renderCalendar();
  bindWeekNav();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
