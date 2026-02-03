// storage.js - Data access layer for Studio94 Booking
// All data in LocalStorage, but API is future-proofed for Firebase, etc.

const STORAGE_VERSION = 1;
const LS_KEY = 'studio94-booking-v1';

const DEFAULT_SETTINGS = {
  timezone: 'Europe/London',
  openTime: '06:00',
  closeTime: '00:00',
  bufferMinutes: 30,
  slotIntervalMinutes: 30  // 30-min slots: bookings can start at :00 or :30
};

function loadAll() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    // Always return all default settings fields on first load
    return {
      settings: {
        timezone: DEFAULT_SETTINGS.timezone,
        openTime: DEFAULT_SETTINGS.openTime,
        closeTime: DEFAULT_SETTINGS.closeTime,
        bufferMinutes: DEFAULT_SETTINGS.bufferMinutes,
        slotIntervalMinutes: DEFAULT_SETTINGS.slotIntervalMinutes
      },
      users: [],
      bookings: []
    };
  }
  try {
    const data = JSON.parse(raw);
    if (!data.settings) data.settings = { ...DEFAULT_SETTINGS };
    // Ensure all required settings fields are present
    data.settings.timezone = data.settings.timezone || DEFAULT_SETTINGS.timezone;
    data.settings.openTime = data.settings.openTime || DEFAULT_SETTINGS.openTime;
    data.settings.closeTime = data.settings.closeTime || DEFAULT_SETTINGS.closeTime;
    data.settings.bufferMinutes = (typeof data.settings.bufferMinutes === 'number') ? data.settings.bufferMinutes : DEFAULT_SETTINGS.bufferMinutes;
    data.settings.slotIntervalMinutes = (typeof data.settings.slotIntervalMinutes === 'number') ? data.settings.slotIntervalMinutes : DEFAULT_SETTINGS.slotIntervalMinutes;
    
    // MIGRATION: upgrade to 30-minute slots if still on hourly (60) or invalid
    if (!data.settings.slotIntervalMinutes || data.settings.slotIntervalMinutes === 60) {
      data.settings.slotIntervalMinutes = 30;
      saveAll(data); // persist migration immediately
    }
    
    if (!data.users) data.users = [];
    if (!data.bookings) data.bookings = [];
    return data;
  } catch {
    return {
      settings: {
        timezone: DEFAULT_SETTINGS.timezone,
        openTime: DEFAULT_SETTINGS.openTime,
        closeTime: DEFAULT_SETTINGS.closeTime,
        bufferMinutes: DEFAULT_SETTINGS.bufferMinutes,
        slotIntervalMinutes: DEFAULT_SETTINGS.slotIntervalMinutes
      },
      users: [],
      bookings: []
    };
  }
}
function saveAll(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

// --- Settings ---
function getSettings() {
  return loadAll().settings;
}
function setSettings(newSettings) {
  const data = loadAll();
  data.settings = { ...data.settings, ...newSettings };
  saveAll(data);
}

// --- Users ---
function getUsers() {
  return loadAll().users;
}
function getUserById(id) {
  return getUsers().find(u => u.id === id);
}
function getUserByEmail(email) {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}
function addUser(user) {
  const data = loadAll();
  data.users.push(user);
  saveAll(data);
}
function updateUser(id, updates) {
  const data = loadAll();
  const idx = data.users.findIndex(u => u.id === id);
  if (idx >= 0) {
    data.users[idx] = { ...data.users[idx], ...updates };
    saveAll(data);
  }
}
function deleteUser(id) {
  const data = loadAll();
  data.users = data.users.filter(u => u.id !== id);
  data.bookings = data.bookings.filter(b => b.userId !== id);
  saveAll(data);
}

// --- Bookings ---
function getBookings() {
  return loadAll().bookings;
}
function getBookingById(id) {
  return getBookings().find(b => b.id === id);
}
function addBooking(booking) {
  const data = loadAll();
  data.bookings.push(booking);
  saveAll(data);
}
function updateBooking(id, updates) {
  const data = loadAll();
  const idx = data.bookings.findIndex(b => b.id === id);
  if (idx >= 0) {
    data.bookings[idx] = { ...data.bookings[idx], ...updates, updatedAtISO: new Date().toISOString() };
    saveAll(data);
  }
}
function deleteBooking(id) {
  const data = loadAll();
  data.bookings = data.bookings.filter(b => b.id !== id);
  saveAll(data);
}

// --- Demo Data ---
function seedDemoData() {
  const now = new Date();
  const users = [
    { id: 'u1', name: 'Alice Sub', email: 'alice@studio.com', pinHash: window.utils.simpleHash('1234'), membership: 'subscribed', contractRef: 'C-001', createdAtISO: now.toISOString() },
    { id: 'u2', name: 'Bob Standard', email: 'bob@studio.com', pinHash: window.utils.simpleHash('5678'), membership: 'standard', contractRef: 'C-002', createdAtISO: now.toISOString() }
  ];
  const bookings = [
    { id: 'b1', userId: 'u1', startISO: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0).toISOString(), endISO: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0).toISOString(), durationMinutes: 240, notes: 'Band practice', status: 'approved', createdAtISO: now.toISOString(), updatedAtISO: now.toISOString() },
    { id: 'b2', userId: 'u2', startISO: new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 16, 0, 0).toISOString(), endISO: new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 18, 0, 0).toISOString(), durationMinutes: 120, notes: 'Solo session', status: 'pending', createdAtISO: now.toISOString(), updatedAtISO: now.toISOString() }
  ];
  const settings = { ...DEFAULT_SETTINGS };
  saveAll({ settings, users, bookings });
}

// --- Reset ---
function resetAll() {
  localStorage.removeItem(LS_KEY);
}

// --- Business Rules: Conflict Detection ---
/**
 * Check if a booking time range conflicts with existing bookings.
 * @param {object} params
 * @param {string} params.startISO - ISO string of booking start
 * @param {string} params.endISO - ISO string of booking end
 * @param {string} [params.excludeId] - Optional booking ID to exclude (for edits)
 * @returns {object} { ok: true } or { ok: false, conflict: bookingObject }
 * 
 * Test scenarios:
 * 1) Booking ends 13:00 with 30-min buffer → next allowed start is 13:30
 * 2) Admin tries to extend a booking into another booking → blocked
 * 3) Cancelled booking no longer blocks slots
 */
function checkBookingConflict({ startISO, endISO, excludeId }) {
  const settings = getSettings();
  const bookings = getBookings();
  const buffer = settings.bufferMinutes;
  const start = new Date(startISO);
  const end = new Date(endISO);
  
  if (isNaN(start) || isNaN(end)) {
    return { ok: false, conflict: null, reason: 'Invalid start or end time' };
  }
  
  // Check closing time
  const closeHM = settings.closeTime.split(':').map(Number);
  let closeHour = closeHM[0];
  if (closeHour === 0) closeHour = 24;
  const closeDate = new Date(start);
  closeDate.setHours(closeHour, 0, 0, 0);
  if (end > closeDate) {
    return { ok: false, conflict: null, reason: 'Booking exceeds closing time' };
  }
  
  // Check for conflicts with other bookings (with buffer)
  for (const b of bookings) {
    // Skip self (for edit operations)
    if (excludeId && b.id === excludeId) continue;
    
    // Skip declined/cancelled bookings (they don't block)
    if (b.status === 'declined' || b.status === 'cancelled') continue;
    
    const bStart = new Date(b.startISO);
    const bEnd = new Date(b.endISO);
    
    if (isNaN(bStart) || isNaN(bEnd)) continue;
    
    // Check overlap with buffer zone
    // Expand each booking by buffer minutes on both sides
    const bufferStart = new Date(bStart);
    bufferStart.setMinutes(bufferStart.getMinutes() - buffer);
    const bufferEnd = new Date(bEnd);
    bufferEnd.setMinutes(bufferEnd.getMinutes() + buffer);
    
    // Conflict if ranges overlap
    if (start < bufferEnd && end > bufferStart) {
      return { ok: false, conflict: b, reason: `Conflicts with ${b.status} booking` };
    }
  }
  
  return { ok: true };
}

// --- Export ---
window.storage = {
  getSettings, setSettings,
  getUsers, getUserById, getUserByEmail, addUser, updateUser, deleteUser,
  getBookings, getBookingById, addBooking, updateBooking, deleteBooking,
  checkBookingConflict,
  seedDemoData, resetAll
};
