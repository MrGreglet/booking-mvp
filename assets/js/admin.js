// --- Admin Calendar State ---
let adminViewMode = "week"; // "week" or "month"
let adminFocusDate = new Date(); // controls which week/month is shown

(() => {
// admin.js - Admin dashboard logic for Studio94
// Handles admin login, user/booking/settings management, notifications

// Dev mode flag - set to true to enable dev features like seed button
const DEV_MODE = false;

const {
  formatTimeHM, formatDateYMD, formatDateWeekday, getISOWeek, getWeekStart, addDays, addMinutes, minutesBetween, clamp,
  simpleHash, showToast, showConfirmDialog, openSlidein, closeSlidein
} = window.utils;
const storage = window.storage;

const ADMIN_PASSWORD = 'studio94';
let adminLoggedIn = false;

// --- Admin Login ---
function renderAdminLogin() {
  document.getElementById('admin-login').style.display = '';
  document.getElementById('admin-app').style.display = 'none';
  document.getElementById('admin-login-form').onsubmit = (e) => {
    e.preventDefault();
    const pw = document.getElementById('admin-password').value;
    if (pw === ADMIN_PASSWORD) {
      adminLoggedIn = true;
      renderAdminApp();
    } else {
      document.getElementById('admin-login-error').textContent = 'Incorrect password.';
    }
  };
}

// --- Admin App ---
function renderAdminApp() {
  document.getElementById('admin-login').style.display = 'none';
  document.getElementById('admin-app').style.display = '';
  renderPendingBadge();
  renderUsersPanel();
  renderBookingsPanel();
  renderSettingsPanel();
  // Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.admin-panel').forEach(p => p.style.display = 'none');
      const panelId = 'admin-panel-' + btn.dataset.panel;
      document.getElementById(panelId).style.display = '';
    };
  });
  document.getElementById('logout-btn').onclick = () => {
    adminLoggedIn = false;
    renderAdminLogin();
  };
}

// --- Pending Badge ---
function renderPendingBadge() {
  const count = storage.getBookings().filter(b=>b.status==='pending').length;
  document.getElementById('pending-badge').textContent = count;
}

// --- Users Panel ---
function renderUsersPanel() {
  const users = storage.getUsers();
  let html = `<h2>Users</h2><button id="add-user-btn">Add User</button>`;
  html += `<table class="table"><thead><tr><th>Name</th><th>Email</th><th>Membership</th><th>Contract</th><th>PIN</th><th>Actions</th></tr></thead><tbody>`;
  for(const u of users) {
    html += `<tr>
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td>${u.membership}</td>
      <td>${u.contractRef}</td>
      <td><button class="action-btn" data-id="${u.id}" data-action="reset-pin">Reset</button></td>
      <td>
        <button class="action-btn" data-id="${u.id}" data-action="edit">Edit</button>
        <button class="action-btn danger" data-id="${u.id}" data-action="delete">Delete</button>
      </td>
    </tr>`;
  }
  html += `</tbody></table>`;
  document.getElementById('admin-panel-users').innerHTML = html;
  document.getElementById('add-user-btn').onclick = () => openUserForm();
  document.querySelectorAll('.action-btn').forEach(btn => {
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action === 'edit') btn.onclick = () => openUserForm(id);
    if (action === 'delete') btn.onclick = () => confirmDeleteUser(id);
    if (action === 'reset-pin') btn.onclick = () => resetUserPin(id);
  });
}
function openUserForm(id) {
  const user = id ? storage.getUserById(id) : null;
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>${user ? 'Edit' : 'Add'} User</h2>
    <form id="user-form">
      <div class="form-group">
        <label>Name</label>
        <input name="name" required value="${user ? user.name : ''}">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input name="email" type="email" required value="${user ? user.email : ''}" ${user ? 'readonly' : ''}>
      </div>
      <div class="form-group">
        <label>Membership</label>
        <select name="membership">
          <option value="subscribed" ${user && user.membership==='subscribed'?'selected':''}>Subscribed</option>
          <option value="standard" ${user && user.membership==='standard'?'selected':''}>Standard</option>
        </select>
      </div>
      <div class="form-group">
        <label>Contract Ref</label>
        <input name="contractRef" value="${user ? user.contractRef : ''}">
      </div>
      <div class="form-actions">
        <button type="submit">${user ? 'Update' : 'Create'}</button>
        <button type="button" class="secondary" id="cancel-btn">Cancel</button>
      </div>
    </form>`;
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.getElementById('cancel-btn').onclick = closeSlidein;
  document.getElementById('user-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const data = {
      name: f.name.value.trim(),
      email: f.email.value.trim(),
      membership: f.membership.value,
      contractRef: f.contractRef.value.trim(),
      createdAtISO: user ? user.createdAtISO : new Date().toISOString()
    };
    if (user) {
      storage.updateUser(user.id, data);
      showToast('User updated');
    } else {
      const pin = Math.floor(1000+Math.random()*9000).toString();
      data.id = 'u'+Date.now();
      data.pinHash = simpleHash(pin);
      storage.addUser(data);
      showToast(`User created. PIN: ${pin}`);
    }
    closeSlidein();
    renderUsersPanel();
  };
}
function confirmDeleteUser(id) {
  const user = storage.getUserById(id);
  if (!user) {
    showToast('User not found', 'error');
    return;
  }
  
  // Show confirmation slide-out
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2 style="color: var(--danger);">⚠️ Delete User</h2>`;
  html += `<div style="margin: 1.5rem 0;">
    <p style="font-size: 1.1rem; margin-bottom: 1rem;">Are you sure you want to delete this user?</p>
    <div style="background: rgba(255, 255, 255, 0.05); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
      <p style="margin: 0.5rem 0;"><strong>Name:</strong> ${user.name}</p>
      <p style="margin: 0.5rem 0;"><strong>Email:</strong> ${user.email}</p>
      <p style="margin: 0.5rem 0;"><strong>Membership:</strong> ${user.membership}</p>
    </div>
    <p style="color: var(--danger); font-weight: 600;">⚠️ This will permanently delete all their bookings!</p>
  </div>`;
  html += `<div class="form-actions">
    <button class="danger" id="confirm-delete-btn">Yes, Delete User</button>
    <button class="secondary" id="cancel-delete-btn">Cancel</button>
  </div>`;
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.getElementById('cancel-delete-btn').onclick = closeSlidein;
  document.getElementById('confirm-delete-btn').onclick = () => {
    storage.deleteUser(id);
    showToast('User deleted', 'success');
    closeSlidein();
    renderUsersPanel();
  };
}
function resetUserPin(id) {
  const pin = Math.floor(1000+Math.random()*9000).toString();
  storage.updateUser(id, { pinHash: simpleHash(pin) });
  showToast(`PIN reset. New PIN: ${pin}`);
}

// --- Bookings Panel ---
function renderBookingsPanel() {
  const bookings = storage.getBookings();
  const users = storage.getUsers();
  let html = `<h2>Bookings</h2>`;
  if (DEV_MODE) {
    html += `<button id="seed-demo-btn">Seed Demo Data</button>`;
  }
  html += `<div class="calendar-toggle">
    <button id="admin-week-toggle" class="active">Week</button>
    <button id="admin-month-toggle">Month</button>
  </div>
  <div id="admin-calendar-container"></div>`;
  html += `<div class="form-group"><label>Filter</label>
    <select id="booking-filter">
      <option value="all">All</option>
      <option value="pending">Pending</option>
      <option value="approved">Approved</option>
      <option value="declined">Declined</option>
      <option value="cancelled">Cancelled</option>
    </select></div>`;
  html += `<table class="table"><thead><tr><th>Date</th><th>Time</th><th>User</th><th>Duration</th><th>Status</th><th>Notes</th><th>Admin Notes</th><th>Actions</th></tr></thead><tbody>`;
  function safeDateYMD(value) {
    const d = new Date(value);
    return isNaN(d) ? 'Invalid date' : window.utils.formatDateYMD(d);
  }
  function safeTimeHM(value) {
    const d = new Date(value);
    return isNaN(d) ? '--:--' : window.utils.formatTimeHM(d);
  }
  for(const b of bookings) {
    const user = users.find(u=>u.id===b.userId);
    html += `<tr data-status="${b.status}">
      <td>${safeDateYMD(b.startISO)}</td>
      <td>${safeTimeHM(b.startISO)}–${safeTimeHM(b.endISO)}</td>
      <td>${user ? user.name : 'Unknown'}</td>
      <td>${b.durationMinutes/60}h</td>
      <td>${b.status}</td>
      <td>${b.notes||''}</td>
      <td>${b.adminNotes||''}</td>
      <td>
        ${b.status==='pending'?`<button class="action-btn success" data-id="${b.id}" data-action="approve">Approve</button>`:''}
        ${b.status==='pending'?`<button class="action-btn danger" data-id="${b.id}" data-action="decline">Decline</button>`:''}
        ${b.status==='approved'?`<button class="action-btn danger" data-id="${b.id}" data-action="cancel">Cancel</button>`:''}
      </td>
    </tr>`;
  }
  html += `</tbody></table>`;
  document.getElementById('admin-panel-bookings').innerHTML = html;
  // Calendar toggle
  document.getElementById('admin-week-toggle').onclick = () => {
    adminViewMode = "week";
    document.getElementById('admin-week-toggle').classList.add('active');
    document.getElementById('admin-month-toggle').classList.remove('active');
    renderAdminWeekCalendar(adminFocusDate);
  };
  document.getElementById('admin-month-toggle').onclick = () => {
    adminViewMode = "month";
    document.getElementById('admin-week-toggle').classList.remove('active');
    document.getElementById('admin-month-toggle').classList.add('active');
    renderAdminMonthCalendar(adminFocusDate);
  };
  if (adminViewMode === "month") {
    renderAdminMonthCalendar(adminFocusDate);
  } else {
    renderAdminWeekCalendar(adminFocusDate);
  }
  // --- Admin Month Calendar ---
  function renderAdminMonthCalendar(focusDate = adminFocusDate) {
    const bookings = storage.getBookings();
    const users = storage.getUsers();
    const year = focusDate.getFullYear();
    const month = focusDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    // Compute Monday-based offset: 0=Mon, 6=Sun
    const jsDay = firstOfMonth.getDay(); // 0=Sun..6=Sat
    const firstDayOfWeek = (jsDay + 6) % 7; // 0=Mon..6=Sun
    // Number of days in this month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let html = `<div class="admin-month-calendar">`;
    html += `<div class="admin-month-header">
      <button id="admin-month-prev">&lt;</button>
      <span>${firstOfMonth.toLocaleString('default', { month: 'long' })} ${year}</span>
      <button id="admin-month-next">&gt;</button>
    </div>`;

    // Weekday headers
    html += '<div class="admin-month-grid">';
    const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    for (const wd of weekdays) html += `<div class="admin-month-dayheader">${wd}</div>`;

    // Leading blanks
    for (let i = 0; i < firstDayOfWeek; i++) html += `<div class="admin-month-cell empty"></div>`;

    // Days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const ymd = formatDateYMD(date);
      // Count bookings for this day
      let approved = 0, pending = 0, blocks = 0;
      for (const b of bookings) {
        if (!b.startISO) continue;
        const d = new Date(b.startISO);
        if (isNaN(d) || d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) continue;
        if (b.status === "approved" && b.userId) approved++;
        else if (b.status === "pending") pending++;
        else if (b.status === "approved" && !b.userId) blocks++;
      }
      html += `<div class="admin-month-cell" data-date="${ymd}">
        <div class="admin-month-daynum">${day}</div>
        <div class="admin-month-badges">
          ${approved ? `<span class="badge badge-approved">${approved}</span>` : ""}
          ${pending ? `<span class="badge badge-pending">${pending}</span>` : ""}
          ${blocks ? `<span class="badge badge-block">${blocks}</span>` : ""}
        </div>
      </div>`;
    }

    // Trailing blanks
    const totalCells = firstDayOfWeek + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < trailing; i++) html += `<div class="admin-month-cell empty"></div>`;
    html += '</div>';
    html += '</div>';

    // Inject HTML before attaching event handlers
    const calendarContainer = document.getElementById('admin-calendar-container');
    if (!calendarContainer) return; // Defensive: container missing
    calendarContainer.innerHTML = html;

    // Prev/Next month
    const prevBtn = document.getElementById('admin-month-prev');
    const nextBtn = document.getElementById('admin-month-next');
    if (prevBtn) prevBtn.onclick = () => {
      adminFocusDate = new Date(year, month - 1, 1);
      renderAdminMonthCalendar(adminFocusDate);
    };
    if (nextBtn) nextBtn.onclick = () => {
      adminFocusDate = new Date(year, month + 1, 1);
      renderAdminMonthCalendar(adminFocusDate);
    };

    // Day click handler
    document.querySelectorAll('.admin-month-cell[data-date]').forEach(cell => {
      cell.onclick = () => {
        const date = cell.getAttribute('data-date');
        adminFocusDate = new Date(date);
        adminViewMode = "week";
        document.getElementById('admin-week-toggle').classList.add('active');
        document.getElementById('admin-month-toggle').classList.remove('active');
        renderAdminWeekCalendar(adminFocusDate);
      };
    });
  }
  // Only bind seed button handler if DEV_MODE is enabled
  if (DEV_MODE) {
    const seedBtn = document.getElementById('seed-demo-btn');
    if (seedBtn) {
      seedBtn.onclick = () => { 
        storage.seedDemoData(); 
        showToast('Demo data seeded'); 
        renderUsersPanel(); 
        renderBookingsPanel(); 
        renderPendingBadge(); 
      };
    }
  }
  document.getElementById('booking-filter').onchange = function() {
    const val = this.value;
    document.querySelectorAll('#admin-panel-bookings tbody tr').forEach(tr => {
      tr.style.display = (val==='all'||tr.getAttribute('data-status')===val)?'':'none';
    });
  };
  // Single delegated click listener for booking action buttons
  const panel = document.getElementById('admin-panel-bookings');
  if (panel._bookingDelegateHandler) panel.removeEventListener('click', panel._bookingDelegateHandler);
  panel._bookingDelegateHandler = function(e) {
    const target = e.target;
    if (!target || !target.matches || !target.matches('button.action-btn')) return;
    const id = target.dataset.id;
    const action = target.dataset.action;
    if (typeof console !== 'undefined' && console.log) console.log('booking action clicked', action, id);
    if (action === 'approve') approveBooking(id);
    else if (action === 'decline') declineBooking(id);
    else if (action === 'cancel') cancelBooking(id);
  };
  panel.addEventListener('click', panel._bookingDelegateHandler);
}

// --- Admin Week Calendar ---
function renderAdminWeekCalendar(focusDate = adminFocusDate) {
  const bookings = storage.getBookings();
  const users = storage.getUsers();
  const settings = storage.getSettings();
  const weekStart = getWeekStart(focusDate);
  const days = Array.from({length: 7}, (_, i) => addDays(weekStart, i));
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
  
  let cal = '<div class="admin-calendar-grid">';
  // Header
  cal += '<div class="calendar-header"></div>';
  for (const d of days) {
    cal += `<div class="calendar-header">${formatDateWeekday(d)}<br>${formatDateYMD(d)}</div>`;
  }
  // Rows
  for (const m of slots) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    // Show time label for both :00 and :30
    const timeLabel = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    cal += `<div class="time-col">${timeLabel}</div>`;
    for (let day = 0; day < 7; day++) {
      const slotDate = new Date(days[day]);
      slotDate.setHours(h, min, 0, 0);
      const slotISO = slotDate.toISOString();
      // Find overlapping booking (only approved or pending block slots)
      const booking = bookings.find(b => {
        if (b.status !== 'approved' && b.status !== 'pending') return false;
        const bStart = new Date(b.startISO);
        const bEnd = new Date(b.endISO);
        return !isNaN(bStart) && !isNaN(bEnd) && slotDate >= bStart && slotDate < bEnd;
      });
      let cellClass = 'slot-cell';
      let cellLabel = '';
      let dataBookingId = '';
      let dataHasBooking = '0';
      if (booking) {
        dataBookingId = booking.id;
        dataHasBooking = '1';
        if (booking.status === 'approved') {
          cellClass += ' blocked';
          cellLabel = 'Booked';
        } else if (booking.status === 'pending') {
          cellClass += ' tentative';
          cellLabel = 'Pending';
        } else if (!booking.userId) {
          cellClass += ' blocked';
          cellLabel = 'Blocked';
        }
      } else {
        cellClass += ' available';
        cellLabel = '';
      }
      cal += `<div class="${cellClass}" data-slot="${slotISO}" data-booking-id="${dataBookingId}" data-has-booking="${dataHasBooking}">${cellLabel}</div>`;
    }
  }
  cal += '</div>';
  document.getElementById('admin-calendar-container').innerHTML = cal;
  // Attach one click handler to all .slot-cell elements
  document.querySelectorAll('.admin-calendar-grid .slot-cell').forEach(cell => {
    cell.onclick = function() {
      const slotISO = cell.getAttribute('data-slot');
      const bookingId = cell.getAttribute('data-booking-id') || null;
      if (typeof console !== 'undefined' && console.log) console.log('admin slot click', slotISO);
      openAdminCalendarSlot(slotISO, bookingId);
    };
  });
}

// --- Admin Calendar Slot Slide-in ---
function openAdminCalendarSlot(slotISO, bookingId) {
  const bookings = storage.getBookings();
  const users = storage.getUsers();
  const slotDate = new Date(slotISO);
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2>${formatDateYMD(slotDate)} ${formatTimeHM(slotDate)}</h2>`;
  let booking = null;
  if (bookingId) {
    booking = bookings.find(b => b.id === bookingId);
  }
  if (booking) {
    const user = users.find(u => u.id === booking.userId);
    html += `<form id="admin-edit-booking-form">
      <div><b>User:</b> ${user ? user.name : 'Unknown'}</div>
      <div><b>Status:</b> ${booking.status}</div>
      <div><b>Notes:</b> ${booking.notes || ''}</div>
      <div class="form-group">
        <label>Admin Notes</label>
        <textarea name="adminNotes" id="admin-notes-input">${booking.adminNotes || ''}</textarea>
      </div>
      <div class="form-group">
        <label>Duration (hours)</label>
        <select name="duration" id="edit-duration">
          ${[...Array(16)].map((_,i)=>{
            const hours = (i+1) * 0.5;
            const minutes = hours * 60;
            const selected = minutes === booking.durationMinutes ? 'selected' : '';
            const label = hours === 1 ? '1 hour' : `${hours} hours`;
            return `<option value="${minutes}" ${selected}>${label}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-actions">
        <button type="submit">Save Changes</button>
        <button type="button" class="danger" id="delete-btn">Delete</button>
        ${booking.status === 'pending' ? `<button type="button" id="approve-btn">Approve</button><button type="button" id="decline-btn">Decline</button>` : ''}
        ${booking.status === 'approved' ? `<button type="button" id="cancel-btn">Cancel</button>` : ''}
        <button type="button" class="secondary" id="cancel-edit-btn">Close</button>
      </div>
    </form>`;
  } else {
    html += `<form id="admin-create-booking-form">
      <div class="form-group">
        <label>User</label>
        <select name="userId" required>
          <option value="">Select user</option>
          ${users.map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Duration (hours)</label>
        <select name="duration" required>
          ${[...Array(16)].map((_,i)=>{
            const hours = (i+1) * 0.5;
            const minutes = hours * 60;
            const label = hours === 1 ? '1 hour' : `${hours} hours`;
            return `<option value="${minutes}">${label}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <input name="notes" type="text">
      </div>
      <div class="form-actions">
        <button type="submit">Create Booking</button>
        <button type="button" class="secondary" id="cancel-create-btn">Cancel</button>
      </div>
    </form>`;
  }
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  if (booking) {
    const editForm = document.getElementById('admin-edit-booking-form');
    if (editForm) {
      editForm.onsubmit = (e) => {
        e.preventDefault();
        const f = e.target;
        const newMin = parseInt(f.duration.value, 10);
        const newAdminNotes = f.adminNotes.value;
        if (isNaN(newMin) || newMin < 60) {
          showToast('Invalid duration', 'error');
          return;
        }
        const newEnd = new Date(booking.startISO);
        newEnd.setMinutes(newEnd.getMinutes() + newMin);
        const newEndISO = newEnd.toISOString();
        
        // Validate no conflicts with new duration
        const check = storage.checkBookingConflict({
          startISO: booking.startISO,
          endISO: newEndISO,
          excludeId: booking.id
        });
        
        if (!check.ok) {
          if (check.conflict) {
            const conflictStart = formatTimeHM(new Date(check.conflict.startISO));
            const conflictDate = formatDateYMD(new Date(check.conflict.startISO));
            showToast(`Cannot extend: conflicts with ${check.conflict.status} booking at ${conflictDate} ${conflictStart}`, 'error');
          } else {
            showToast(check.reason || 'Cannot update booking', 'error');
          }
          return;
        }
        
        updateAdminBooking({
          id: booking.id,
          durationMinutes: newMin,
          endISO: newEndISO,
          adminNotes: newAdminNotes
        });
        closeSlidein();
        renderBookingsPanel();
      };
      document.getElementById('delete-btn').onclick = () => {
        confirmDeleteBooking(booking.id);
      };
      if (booking.status === 'pending') {
        document.getElementById('approve-btn').onclick = () => { approveBooking(booking.id); closeSlidein(); };
        document.getElementById('decline-btn').onclick = () => { declineBooking(booking.id); closeSlidein(); };
      }
      if (booking.status === 'approved') {
        document.getElementById('cancel-btn').onclick = () => { cancelBooking(booking.id); closeSlidein(); };
      }
      document.getElementById('cancel-edit-btn').onclick = closeSlidein;
    }
  } else {
    const form = document.getElementById('admin-create-booking-form');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const f = e.target;
        const userId = f.userId.value;
        const duration = parseInt(f.duration.value, 10);
        const notes = f.notes.value;
        if (!userId || isNaN(duration) || duration < 60) {
          showToast('Please select user and valid duration', 'error');
          return;
        }
        createAdminBooking({ userId, slotDate, duration, notes });
        closeSlidein();
        renderBookingsPanel();
      };
      document.getElementById('cancel-create-btn').onclick = closeSlidein;
    }
  }

// Helper: update booking from admin slot
function updateAdminBooking({ id, durationMinutes, endISO, adminNotes }) {
  storage.updateBooking(id, { durationMinutes, endISO, adminNotes });
  showToast('Booking updated', 'success');
}

// Helper: delete booking from admin slot
function confirmDeleteBooking(id) {
  const booking = storage.getBookingById(id);
  if (!booking) {
    showToast('Booking not found', 'error');
    return;
  }
  
  const user = storage.getUserById(booking.userId);
  
  // Show confirmation slide-out
  let html = `<button class="close-btn" aria-label="Close">×</button>`;
  html += `<h2 style="color: var(--danger);">⚠️ Delete Booking</h2>`;
  html += `<div style="margin: 1.5rem 0;">
    <p style="font-size: 1.1rem; margin-bottom: 1rem;">Are you sure you want to permanently delete this booking?</p>
    <div style="background: rgba(255, 255, 255, 0.05); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
      <p style="margin: 0.5rem 0;"><strong>User:</strong> ${user ? user.name : 'Unknown'}</p>
      <p style="margin: 0.5rem 0;"><strong>Date:</strong> ${formatDateYMD(new Date(booking.startISO))}</p>
      <p style="margin: 0.5rem 0;"><strong>Time:</strong> ${formatTimeHM(new Date(booking.startISO))} - ${formatTimeHM(new Date(booking.endISO))}</p>
      <p style="margin: 0.5rem 0;"><strong>Status:</strong> ${booking.status}</p>
      ${booking.notes ? `<p style="margin: 0.5rem 0;"><strong>Notes:</strong> ${booking.notes}</p>` : ''}
    </div>
    <p style="color: var(--danger); font-weight: 600;">⚠️ This action cannot be undone!</p>
  </div>`;
  html += `<div class="form-actions">
    <button class="danger" id="confirm-delete-booking-btn">Yes, Delete Booking</button>
    <button class="secondary" id="cancel-delete-booking-btn">Cancel</button>
  </div>`;
  
  openSlidein(html);
  document.querySelector('.close-btn').onclick = closeSlidein;
  document.getElementById('cancel-delete-booking-btn').onclick = closeSlidein;
  document.getElementById('confirm-delete-booking-btn').onclick = () => {
    storage.deleteBooking(id);
    showToast('Booking deleted', 'success');
    closeSlidein();
    renderBookingsPanel();
  };
}

function deleteAdminBooking(id) {
  storage.deleteBooking(id);
  showToast('Booking deleted', 'success');
}
// Helper: create booking from admin slot
function createAdminBooking({ userId, slotDate, duration, notes }) {
  const startISO = slotDate.toISOString();
  const end = new Date(slotDate);
  end.setMinutes(end.getMinutes() + duration);
  const endISO = end.toISOString();
  
  // Validate no conflicts before creating
  const check = storage.checkBookingConflict({
    startISO,
    endISO,
    excludeId: null
  });
  
  if (!check.ok) {
    if (check.conflict) {
      const conflictStart = formatTimeHM(new Date(check.conflict.startISO));
      const conflictDate = formatDateYMD(new Date(check.conflict.startISO));
      showToast(`Cannot create: conflicts with ${check.conflict.status} booking at ${conflictDate} ${conflictStart}`, 'error');
    } else {
      showToast(check.reason || 'Cannot create booking', 'error');
    }
    return;
  }
  
  const booking = {
    id: 'b' + Date.now(),
    userId,
    startISO,
    endISO,
    durationMinutes: duration,
    status: 'approved',
    notes: notes || '',
    adminNotes: '',
    createdAtISO: new Date().toISOString(),
  };
  storage.addBooking(booking);
  showToast('Booking created', 'success');
}
}
function approveBooking(id) {
  if (typeof console !== 'undefined' && console.log) console.log('approveBooking called', id);
  const b = storage.getBookingById(id);
  if (typeof console !== 'undefined' && console.log) console.log('approveBooking booking', b);
  if (!b) { showToast('Booking not found', 'error'); return; }
  const user = storage.getUserById(b.userId);
  if (!user) { showToast('User not found', 'error'); return; }

  // Debug: log user and booking details before weekly-limit check
  if (typeof console !== 'undefined' && console.log) {
    console.log('before weekly-limit check', {
      membership: user.membership,
      userId: user.id,
      startISO: b.startISO,
      currentStatus: b.status
    });
  }

  // Main approval logic with conflict checks
  function doApprove(isExtra) {
    if (typeof console !== 'undefined' && console.log) console.log('doApprove called with isExtra:', isExtra);
    
    const settings = storage.getSettings();
    const bookings = storage.getBookings();
    const buffer = settings.bufferMinutes;
    
    // Debug: checking conflicts
    if (typeof console !== 'undefined' && console.log) console.log('checking conflicts');
    
    // Check for overlap with buffer
    for (const other of bookings) {
      if (other.id === b.id || ['declined', 'cancelled'].includes(other.status)) continue;
      if ((new Date(b.startISO) < addMinutes(new Date(other.endISO), buffer)) && (new Date(b.endISO) > addMinutes(new Date(other.startISO), -buffer))) {
        if (['approved', 'pending'].includes(other.status)) {
          if (typeof console !== 'undefined' && console.log) console.log('conflict found', other);
          showToast('Conflicts with another booking', 'error');
          return;
        }
      }
    }
    
    // Debug: right before update
    if (typeof console !== 'undefined' && console.log) {
      console.log('updating booking to approved', { id, isExtra });
    }
    
    storage.updateBooking(id, { status: 'approved', isExtra });
    
    // Debug: after update
    if (typeof console !== 'undefined' && console.log) console.log('update complete');
    
    showToast('Booking approved', 'success');
    renderBookingsPanel();
    renderPendingBadge();
    closeSlidein();
  }

  // Check weekly limit for subscribed users with pending bookings
  if (user.membership === 'subscribed' && userHasApprovedThisWeek(user.id, b.startISO) && b.status === 'pending') {
    if (typeof console !== 'undefined' && console.log) console.log('weekly limit triggered');
    const ok = window.confirm('This user already has an approved booking this week. Approve anyway as an extra session?');
    if (!ok) {
      showToast('Approval cancelled', 'info');
      return;
    }
    // User confirmed, proceed with approval as extra session
    doApprove(true);
    return;
  }
  
  // Normal approval
  doApprove(false);
}
function declineBooking(id) {
  storage.updateBooking(id, { status: 'declined' });
  showToast('Booking declined', 'success');
  renderBookingsPanel();
  renderPendingBadge();
}
function cancelBooking(id) {
  showConfirmDialog({
    title: 'Cancel Booking',
    message: 'Cancel this booking? This cannot be undone.',
    onConfirm: () => {
      storage.updateBooking(id, { status: 'cancelled' });
      showToast('Booking cancelled', 'success');
      renderBookingsPanel();
      renderPendingBadge();
    }
  });
}
function userHasApprovedThisWeek(userId, refDateISO) {
  const bookings = storage.getBookings();
  const refDate = refDateISO ? new Date(refDateISO) : new Date();
  const weekStart = getWeekStart(refDate);
  const weekEnd = addDays(weekStart, 7);
  return bookings.some(b => b.userId === userId && b.status === 'approved' && (!b.isExtra) && new Date(b.startISO) >= weekStart && new Date(b.startISO) < weekEnd);
}

// --- Settings Panel ---
function renderSettingsPanel() {
  const settings = storage.getSettings();
  let html = `<h2>System Settings</h2>
    <form id="settings-form">
      <div class="form-group">
        <label>Timezone</label>
        <input name="timezone" value="${settings.timezone}" readonly>
      </div>
      <div class="form-group">
        <label>Open Time</label>
        <input name="openTime" value="${settings.openTime}" readonly>
      </div>
      <div class="form-group">
        <label>Close Time</label>
        <input name="closeTime" value="${settings.closeTime}" readonly>
      </div>
      <div class="form-group">
        <label>Buffer Minutes</label>
        <input name="bufferMinutes" value="${settings.bufferMinutes}" readonly>
      </div>
      <div class="form-group">
        <label>Slot Interval (minutes)</label>
        <input name="slotIntervalMinutes" value="${settings.slotIntervalMinutes}" readonly>
      </div>
      <div class="form-actions">
        <button type="button" class="danger" id="reset-btn">Reset Data</button>
      </div>
    </form>`;
  document.getElementById('admin-panel-settings').innerHTML = html;
  document.getElementById('reset-btn').onclick = () => {
    showConfirmDialog({
      title: 'Reset All Data',
      message: 'This will erase all users and bookings. Continue?',
      onConfirm: () => { storage.resetAll(); showToast('Data reset'); location.reload(); }
    });
  };
}


// --- Init ---
function initAdmin() {
  if (!adminLoggedIn) renderAdminLogin();
  else renderAdminApp();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}
})();
