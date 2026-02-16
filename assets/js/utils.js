// utils.js - General utilities for Studio94 Booking
// All time logic uses CONFIG.timezone (default Europe/London).

function getTimezone() {
  return window.CONFIG?.timezone || 'Europe/London';
}

/**
 * Create an ISO string for a specific date/time in the configured timezone
 * @param {Date|string} date - Date object or 'YYYY-MM-DD' string
 * @param {number} hour - Hour (0-23)
 * @param {number} minute - Minute (0-59)
 * @returns {string} ISO string in UTC representing that local time in configured timezone
 */
function createISOInTimezone(date, hour, minute) {
  const tz = getTimezone();
  
  // Get date string in YYYY-MM-DD format
  let dateStr;
  if (typeof date === 'string') {
    dateStr = date;
  } else if (date instanceof Date) {
    dateStr = formatDateYMD(date);
  } else {
    throw new Error('Invalid date parameter');
  }
  
  // Create datetime string
  const hourStr = String(hour).padStart(2, '0');
  const minStr = String(minute).padStart(2, '0');
  const dateTimeStr = `${dateStr}T${hourStr}:${minStr}:00`;
  
  // Parse this datetime AS IF it's in the target timezone
  // Strategy: Use Intl.DateTimeFormat to get UTC offset at this moment
  
  // First, create a reference date in UTC
  const referenceDate = new Date(dateTimeStr + 'Z');
  
  // Get what this date/time would be in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Format the reference date to see what it looks like in target timezone
  const parts = formatter.formatToParts(referenceDate);
  const tzYear = parts.find(p => p.type === 'year').value;
  const tzMonth = parts.find(p => p.type === 'month').value;
  const tzDay = parts.find(p => p.type === 'day').value;
  const tzHour = parts.find(p => p.type === 'hour').value;
  const tzMinute = parts.find(p => p.type === 'minute').value;
  const tzSecond = parts.find(p => p.type === 'second').value;
  
  const tzDateTimeStr = `${tzYear}-${tzMonth}-${tzDay}T${tzHour}:${tzMinute}:${tzSecond}`;
  const tzDateTime = new Date(tzDateTimeStr + 'Z');
  
  // Calculate offset
  const offset = referenceDate.getTime() - tzDateTime.getTime();
  
  // Apply inverse offset to get correct UTC time for our desired local time
  const targetDate = new Date(dateTimeStr + 'Z');
  const correctUTC = new Date(targetDate.getTime() - offset);
  
  return correctUTC.toISOString();
}

// --- Date/Time Utilities ---

function formatTimeHM(date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: getTimezone()
  }).format(date);
}

function formatDateYMD(date) {
  // Returns 'YYYY-MM-DD' in configured timezone (for internal use, date inputs, comparisons)
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: getTimezone()
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

function formatDateDDMMYY(date) {
  // Returns 'dd/mm/yy' for display (e.g. 10/02/25)
  const parts = new Intl.DateTimeFormat('en-GB', {
    year: '2-digit', month: '2-digit', day: '2-digit', timeZone: getTimezone()
  }).formatToParts(date);
  const d = parts.find(p => p.type === 'day').value;
  const m = parts.find(p => p.type === 'month').value;
  const y = parts.find(p => p.type === 'year').value;
  return `${d}/${m}/${y}`;
}

function formatDateWeekday(date) {
  // Returns 'Mon 3 Feb' in configured timezone
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: getTimezone()
  }).formatToParts(date);
  const weekday = parts.find(p => p.type === 'weekday').value;
  const day = parts.find(p => p.type === 'day').value;
  const month = parts.find(p => p.type === 'month').value;
  return `${weekday} ${day} ${month}`;
}

function getISOWeek(date) {
  // Returns ISO week number (Mon–Sun) in local time
  const d = new Date(date);
  d.setHours(0,0,0,0);
  // Thursday in current week decides the year
  d.setDate(d.getDate() + 4 - (d.getDay()||7));
  const yearStart = new Date(d.getFullYear(),0,1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
  return weekNo;
}

function getWeekStart(date) {
  // Returns Date of Monday of the week in local time
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay() || 7;
  if(day !== 1) d.setDate(d.getDate() - (day - 1));
  return d;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function addMinutes(date, mins) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + mins);
  return d;
}
function minutesBetween(a, b) {
  return Math.round((b - a) / 60000);
}
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// --- Hashing (simple, for PIN) ---
function simpleHash(str) {
  // Not cryptographically secure! Just for hiding PIN in UI/LS.
  let hash = 0, i, chr;
  if (str.length === 0) return hash.toString();
  for (i = 0; i < str.length; i++) {
    chr   = str.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// --- UI Helpers ---
function showToast(msg, type = 'success', timeout = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = (msg != null && String(msg)) ? msg : 'Something went wrong';
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 600);
  }, timeout);
}

function showConfirmDialog({title, message, onConfirm, onCancel}) {
  // Simple modal confirm dialog
  const panel = document.createElement('div');
  panel.className = 'slidein-panel open';
  panel.innerHTML = `
    <button class="close-btn" aria-label="Close">×</button>
    <h2>${title}</h2>
    <p>${message}</p>
    <div class="form-actions">
      <button class="danger">Confirm</button>
      <button class="secondary">Cancel</button>
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('.close-btn').onclick = close;
  panel.querySelector('.secondary').onclick = close;
  panel.querySelector('.danger').onclick = () => { close(); onConfirm && onConfirm(); };
  function close() { panel.remove(); onCancel && onCancel(); }
}

function openSlidein(html) {
  const panel = document.getElementById('slidein-panel');
  if (!panel) {
    if (typeof console !== 'undefined' && console.error) console.error('openSlidein: #slidein-panel not found');
    return;
  }
  panel.innerHTML = html;
  panel.classList.add('open');
}
function closeSlidein() {
  const panel = document.getElementById('slidein-panel');
  if (!panel) return;
  panel.classList.remove('open');
  setTimeout(() => { panel.innerHTML = ''; }, 400);
}

// Format date as "dd/mm/yy" (same as formatDateDDMMYY, alias for week labels etc.)
function formatDateShort(date) {
  return formatDateDDMMYY(date);
}

// Get day name (Mon, Tue, etc.)
function getDayName(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[date.getDay()];
}

// Check if two dates are the same day
function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

// --- Export ---
window.utils = {
  formatTimeHM, formatDateYMD, formatDateDDMMYY, formatDateWeekday, formatDateShort, getDayName, isSameDay,
  getISOWeek, getWeekStart, addDays, addMinutes, minutesBetween, clamp,
  simpleHash, showToast, showConfirmDialog, openSlidein, closeSlidein,
  getTimezone, createISOInTimezone
};
