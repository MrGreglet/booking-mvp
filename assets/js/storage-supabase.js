// storage-supabase.js - Supabase Backend Storage Layer
// This file replaces LocalStorage with Supabase database

(function() {
'use strict';

const db = window.supabaseClient;

// Default settings
const DEFAULT_SETTINGS = {
  openTime: '06:00',
  closeTime: '00:00',
  bufferMinutes: 30,
  slotIntervalMinutes: 30
};

// Cache for loaded data
let cachedUsers = null;
let cachedBookings = null;
let cachedSettings = null;
let isLoading = false;

// ========== INITIALIZATION ==========

async function initializeDB() {
  // Load settings, create default if doesn't exist
  const { data: settings } = await db
    .from('settings')
    .select('*')
    .eq('id', 'default')
    .single();
  
  if (!settings) {
    await db.from('settings').insert({
      id: 'default',
      ...DEFAULT_SETTINGS
    });
  }
}

// ========== SETTINGS ==========

function getSettings() {
  if (cachedSettings) return cachedSettings;
  
  // Synchronous fallback while loading
  return DEFAULT_SETTINGS;
}

async function loadSettings() {
  const { data, error } = await db
    .from('settings')
    .select('*')
    .eq('id', 'default')
    .single();
  
  if (error) {
    console.error('Error loading settings:', error);
    return DEFAULT_SETTINGS;
  }
  
  cachedSettings = {
    openTime: data.open_time,
    closeTime: data.close_time,
    bufferMinutes: data.buffer_minutes,
    slotIntervalMinutes: data.slot_interval_minutes
  };
  
  return cachedSettings;
}

async function setSettings(updates) {
  const newSettings = {
    open_time: updates.openTime,
    close_time: updates.closeTime,
    buffer_minutes: updates.bufferMinutes,
    slot_interval_minutes: updates.slotIntervalMinutes
  };
  
  const { error } = await db
    .from('settings')
    .update(newSettings)
    .eq('id', 'default');
  
  if (error) {
    console.error('Error updating settings:', error);
    return;
  }
  
  cachedSettings = updates;
}

// ========== USERS ==========

function getUsers() {
  return cachedUsers || [];
}

async function loadUsers() {
  const { data, error } = await db
    .from('users')
    .select('*')
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error loading users:', error);
    return [];
  }
  
  cachedUsers = data.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    pinHash: u.pin_hash,
    membership: u.membership,
    contractRef: u.contract_ref,
    createdAtISO: u.created_at
  }));
  
  return cachedUsers;
}

function getUserById(id) {
  return getUsers().find(u => u.id === id);
}

function getUserByEmail(email) {
  return getUsers().find(u => u.email === email);
}

async function addUser(user) {
  const dbUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    pin_hash: user.pinHash,
    membership: user.membership,
    contract_ref: user.contractRef || ''
  };
  
  const { data, error } = await db
    .from('users')
    .insert(dbUser)
    .select()
    .single();
  
  if (error) {
    console.error('Error adding user:', error);
    return;
  }
  
  // Refresh cache
  await loadUsers();
}

async function updateUser(id, updates) {
  const dbUpdates = {};
  if (updates.name) dbUpdates.name = updates.name;
  if (updates.email) dbUpdates.email = updates.email;
  if (updates.pinHash) dbUpdates.pin_hash = updates.pinHash;
  if (updates.membership) dbUpdates.membership = updates.membership;
  if (updates.contractRef !== undefined) dbUpdates.contract_ref = updates.contractRef;
  
  const { error } = await db
    .from('users')
    .update(dbUpdates)
    .eq('id', id);
  
  if (error) {
    console.error('Error updating user:', error);
    return;
  }
  
  // Refresh cache
  await loadUsers();
}

async function deleteUser(id) {
  const { error } = await db
    .from('users')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Error deleting user:', error);
    return;
  }
  
  // Refresh cache
  await loadUsers();
}

// ========== BOOKINGS ==========

function getBookings() {
  return cachedBookings || [];
}

async function loadBookings() {
  const { data, error } = await db
    .from('bookings')
    .select('*')
    .order('start_iso', { ascending: true });
  
  if (error) {
    console.error('Error loading bookings:', error);
    return [];
  }
  
  cachedBookings = data.map(b => ({
    id: b.id,
    userId: b.user_id,
    startISO: b.start_iso,
    endISO: b.end_iso,
    durationMinutes: b.duration_minutes,
    status: b.status,
    notes: b.notes || '',
    adminNotes: b.admin_notes || '',
    isExtra: b.is_extra || false,
    createdAtISO: b.created_at
  }));
  
  return cachedBookings;
}

function getBookingById(id) {
  return getBookings().find(b => b.id === id);
}

async function addBooking(booking) {
  const dbBooking = {
    id: booking.id,
    user_id: booking.userId,
    start_iso: booking.startISO,
    end_iso: booking.endISO,
    duration_minutes: booking.durationMinutes,
    status: booking.status,
    notes: booking.notes || '',
    admin_notes: booking.adminNotes || '',
    is_extra: booking.isExtra || false
  };
  
  const { error } = await db
    .from('bookings')
    .insert(dbBooking);
  
  if (error) {
    console.error('Error adding booking:', error);
    return;
  }
  
  // Refresh cache
  await loadBookings();
}

async function updateBooking(id, updates) {
  const dbUpdates = {};
  if (updates.status) dbUpdates.status = updates.status;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.adminNotes !== undefined) dbUpdates.admin_notes = updates.adminNotes;
  if (updates.isExtra !== undefined) dbUpdates.is_extra = updates.isExtra;
  if (updates.durationMinutes) dbUpdates.duration_minutes = updates.durationMinutes;
  if (updates.endISO) dbUpdates.end_iso = updates.endISO;
  
  const { error } = await db
    .from('bookings')
    .update(dbUpdates)
    .eq('id', id);
  
  if (error) {
    console.error('Error updating booking:', error);
    return;
  }
  
  // Refresh cache
  await loadBookings();
}

async function deleteBooking(id) {
  const { error } = await db
    .from('bookings')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Error deleting booking:', error);
    return;
  }
  
  // Refresh cache
  await loadBookings();
}

// ========== CONFLICT CHECK ==========

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
    if (excludeId && b.id === excludeId) continue;
    if (b.status === 'declined' || b.status === 'cancelled') continue;
    
    const bStart = new Date(b.startISO);
    const bEnd = new Date(b.endISO);
    
    if (isNaN(bStart) || isNaN(bEnd)) continue;
    
    const bufferStart = new Date(bStart);
    bufferStart.setMinutes(bufferStart.getMinutes() - buffer);
    const bufferEnd = new Date(bEnd);
    bufferEnd.setMinutes(bufferEnd.getMinutes() + buffer);
    
    if (start < bufferEnd && end > bufferStart) {
      return { ok: false, conflict: b, reason: `Conflicts with ${b.status} booking` };
    }
  }
  
  return { ok: true };
}

// ========== SEED DEMO DATA ==========

async function seedDemoData() {
  // Clear existing data
  await db.from('bookings').delete().neq('id', '');
  await db.from('users').delete().neq('id', '');
  
  // Add demo users
  const demoUsers = [
    { id: 'u1', name: 'John Doe', email: 'john@example.com', pinHash: window.utils.simpleHash('1234'), membership: 'subscribed', contractRef: 'SUB-001' },
    { id: 'u2', name: 'Jane Smith', email: 'jane@example.com', pinHash: window.utils.simpleHash('5678'), membership: 'standard', contractRef: '' }
  ];
  
  for (const user of demoUsers) {
    await addUser(user);
  }
  
  console.log('Demo data seeded!');
  await loadAll();
}

// ========== LOAD ALL DATA ==========

async function loadAll() {
  if (isLoading) return;
  isLoading = true;
  
  try {
    await initializeDB();
    await Promise.all([
      loadSettings(),
      loadUsers(),
      loadBookings()
    ]);
  } catch (error) {
    console.error('Error loading data:', error);
  } finally {
    isLoading = false;
  }
}

// ========== RESET ALL ==========

async function resetAll() {
  await db.from('bookings').delete().neq('id', '');
  await db.from('users').delete().neq('id', '');
  cachedUsers = [];
  cachedBookings = [];
  await loadAll();
}

// ========== INITIALIZE ON LOAD ==========

// Auto-load data on startup
loadAll();

// ========== EXPORT ==========

window.storage = {
  getSettings, setSettings,
  getUsers, getUserById, getUserByEmail, addUser, updateUser, deleteUser,
  getBookings, getBookingById, addBooking, updateBooking, deleteBooking,
  checkBookingConflict,
  seedDemoData, resetAll,
  loadAll // Expose for manual refresh
};

})();
