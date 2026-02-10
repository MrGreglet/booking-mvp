// ============================================================
// STORAGE.JS - Supabase Auth + RPC Backend Layer
// Password-based authentication with server-enforced security
// ============================================================

(function() {
'use strict';

const db = window.supabaseClient;

// Default settings (6 AM to midnight)
const DEFAULT_SETTINGS = {
  openTime: '06:00',
  closeTime: '24:00',
  bufferMinutes: 30,
  slotIntervalMinutes: 60
};

// Cache for loaded data
let cachedSettings = null;
let cachedBookings = null;
let cachedProfiles = null;
let cachedAllowedUsers = null;
let currentUser = null;
let currentSession = null;
let isAdmin = false;

// Retry data fetch on AbortError (auth state change often aborts in-flight requests)
async function fetchWithAbortRetry(fetchFn, retries = 4) {
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await fetchFn();
      const err = result?.error;
      const isAbort = err && (String(err.message || '').toLowerCase().includes('abort') || err.name === 'AbortError');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/be562c05-4b81-44cd-b5e5-6919afb000f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage.js:fetchWithAbortRetry',message:'attempt',data:{attempt:i,retries,hasError:!!err,isAbort:!!isAbort,lastAttempt:i===retries},timestamp:Date.now(),hypothesisId:'H3',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      if (!err || (!isAbort || i === retries)) return result;
    } catch (e) {
      const isAbort = (e?.message || '').toLowerCase().includes('abort') || e?.name === 'AbortError';
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/be562c05-4b81-44cd-b5e5-6919afb000f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage.js:fetchWithAbortRetry',message:'attempt threw',data:{attempt:i,retries,isAbort,lastAttempt:i===retries},timestamp:Date.now(),hypothesisId:'H3',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      if (!isAbort || i === retries) throw e;
    }
    await new Promise(r => setTimeout(r, 500 * (i + 1)));
  }
  return { data: null, error: { message: 'AbortError' } };
}

// ========== AUTH MANAGEMENT ==========

async function initAuth() {
  let session = null;
  let sessionError = null;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/be562c05-4b81-44cd-b5e5-6919afb000f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage.js:initAuth',message:'initAuth started',data:{},timestamp:Date.now(),hypothesisId:'H1',runId:'post-fix'})}).catch(()=>{});
  // #endregion
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const result = await db.auth.getSession();
      session = result?.data?.session ?? null;
      sessionError = result?.error ?? null;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/be562c05-4b81-44cd-b5e5-6919afb000f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage.js:initAuth',message:'getSession ok',data:{hasSession:!!session,attempt},timestamp:Date.now(),hypothesisId:'H1',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      break;
    } catch (error) {
      const isAbort = (error?.message || '').toLowerCase().includes('abort') || error?.name === 'AbortError';
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/be562c05-4b81-44cd-b5e5-6919afb000f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage.js:initAuth',message:'getSession threw',data:{attempt,isAbort},timestamp:Date.now(),hypothesisId:'H1',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      if (!isAbort || attempt === 3) {
        console.warn('Auth getSession failed (network/abort):', error?.message || error);
        return currentUser;
      }
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  if (sessionError) {
    console.warn('Invalid session detected, clearing...');
    try {
      await db.auth.signOut();
    } catch (e) {
      /* ignore */
    }
    currentUser = null;
    currentSession = null;
    isAdmin = false;
    return null;
  }

  if (session) {
    currentSession = session;
    currentUser = session.user;

    try {
      await checkAdminStatus();
    } catch (err) {
      console.warn('Admin check failed:', err?.message || err);
      /* leave isAdmin unchanged - may have been set by signInWithPassword */
    }

    try {
      await db.rpc('get_or_create_profile');
    } catch (err) {
      /* profile creation optional */
    }

    return currentUser;
  }

  currentUser = null;
  currentSession = null;
  isAdmin = false;
  return null;
}

async function checkAdminStatus() {
  if (!currentUser) {
    isAdmin = false;
    return false;
  }
  
  const { data, error } = await db
    .from('admin_users')
    .select('user_id')
    .eq('user_id', currentUser.id)
    .single();
  
  isAdmin = !error && !!data;
  return isAdmin;
}

function getCurrentUser() {
  return currentUser;
}

function getCurrentSession() {
  return currentSession;
}

function getIsAdmin() {
  return isAdmin;
}

async function signOut() {
  const { error } = await db.auth.signOut();
  if (error) {
    console.error('Error signing out:', error);
    return;
  }
  
  currentUser = null;
  currentSession = null;
  isAdmin = false;
  
  // Clear cache
  cachedBookings = null;
  cachedProfiles = null;
  cachedAllowedUsers = null;
}

// Password authentication functions below

// Password authentication
async function signInWithPassword(email, password) {
  const { data, error } = await db.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });
  
  if (error) {
    const msg = error.message || '';
    if (msg.includes('Invalid login credentials')) {
      throw new Error('Invalid email or password. Check your credentials and try again.');
    }
    if (msg.includes('Email not confirmed')) {
      throw new Error('Email not confirmed. Please check your inbox.');
    }
    throw new Error(msg || 'Login failed');
  }
  
  currentSession = data.session;
  currentUser = data.user;
  await checkAdminStatus();
  return data;
}

// Change password
async function changePassword(newPassword) {
  const { data, error } = await db.auth.updateUser({
    password: newPassword
  });
  
  if (error) {
    throw new Error(error.message || 'Failed to change password');
  }
  
  return data;
}

// Check if user needs to change password (first login)
function needsPasswordChange() {
  if (!currentUser) return false;
  // Check if user metadata has first_login flag
  return currentUser.user_metadata?.first_login === true;
}

// Mark password as changed
async function markPasswordChanged() {
  const { data, error } = await db.auth.updateUser({
    data: { first_login: false }
  });
  
  if (error) {
    console.error('Error updating user metadata:', error);
  }
  
  return data;
}

// Listen for auth state changes
db.auth.onAuthStateChange(async (event, session) => {
  console.log('Auth state changed:', event);
  // #region agent log
  if (event === 'SIGNED_IN') fetch('http://127.0.0.1:7242/ingest/be562c05-4b81-44cd-b5e5-6919afb000f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage.js:onAuthStateChange',message:'Auth SIGNED_IN',data:{},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  try {
    if (event === 'SIGNED_IN' && session) {
      currentSession = session;
      currentUser = session.user;
      
      try {
        await checkAdminStatus();
      } catch (err) {
        console.warn('Could not check admin status:', err.message);
        /* leave isAdmin unchanged - may have been set by signInWithPassword */
      }
      
      // Ensure profile exists
      try {
        await db.rpc('get_or_create_profile');
      } catch (err) {
        console.log('Profile check skipped');
      }
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentSession = null;
      isAdmin = false;
      cachedBookings = null;
      cachedProfiles = null;
      cachedAllowedUsers = null;
    }
  } catch (error) {
    console.warn('Auth state change handler error:', error.message);
  }
});

// ========== SETTINGS ==========

function getSettings() {
  return cachedSettings || DEFAULT_SETTINGS;
}

async function loadSettings() {
  const { data, error } = await fetchWithAbortRetry(() =>
    db.from('settings').select('*').eq('id', 'default').single()
  );
  
  if (error) {
    console.error('Error loading settings:', error);
    return DEFAULT_SETTINGS;
  }
  
  if (data) {
    cachedSettings = {
      openTime: data.business_hours_start,
      closeTime: data.business_hours_end,
      bufferMinutes: data.buffer_minutes,
      slotIntervalMinutes: data.slot_interval_minutes
    };
  }
  return cachedSettings || DEFAULT_SETTINGS;
}

async function setSettings(updates) {
  if (!isAdmin) {
    throw new Error('Admin access required');
  }
  
  const newSettings = {
    business_hours_start: updates.openTime,
    business_hours_end: updates.closeTime,
    buffer_minutes: updates.bufferMinutes,
    slot_interval_minutes: updates.slotIntervalMinutes
  };
  
  const { error } = await db
    .from('settings')
    .update(newSettings)
    .eq('id', 'default');
  
  if (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
  
  cachedSettings = updates;
}

// ========== PROFILES (replaces old users) ==========

async function loadProfiles() {
  if (!isAdmin) {
    if (!currentUser) return [];
    const { data, error } = await fetchWithAbortRetry(() =>
      db.from('profiles').select('*').eq('user_id', currentUser.id).single()
    );
    if (error) {
      console.error('Error loading profile:', error);
      return [];
    }
    cachedProfiles = data ? [data] : [];
    return cachedProfiles;
  }
  const { data, error } = await fetchWithAbortRetry(() =>
    db.from('profiles').select('*').order('created_at', { ascending: false })
  );
  if (error) {
    console.error('Error loading profiles:', error);
    return [];
  }
  cachedProfiles = data || [];
  return cachedProfiles;
}

function getProfiles() {
  return cachedProfiles || [];
}

async function updateProfile(userId, updates) {
  // Users can only update their own profile, admins can update any
  if (!isAdmin && currentUser?.id !== userId) {
    throw new Error('Cannot update another user\'s profile');
  }
  
  const profileUpdates = {
    name: updates.name,
    membership: updates.membership,
    contract_details: updates.contractDetails
  };
  
  const { error } = await db
    .from('profiles')
    .update(profileUpdates)
    .eq('user_id', userId);
  
  if (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
  
  // Refresh cache
  await loadProfiles();
}

// ========== BOOKINGS ==========

async function loadBookings() {
  // RLS policies: non-admins see own + all approved; admins see all
  const { data, error } = await fetchWithAbortRetry(() =>
    db.from('bookings').select('*').order('start_time', { ascending: true })
  );
  
  if (error) {
    console.error('Error loading bookings:', error);
    return [];
  }
  
  cachedBookings = (data || []).map(booking => ({
    id: booking.id,
    userId: booking.user_id,
    userEmail: booking.user_email,
    startISO: booking.start_time,
    endISO: booking.end_time,
    durationMinutes: booking.duration_minutes,
    status: booking.status,
    userNotes: booking.user_notes,
    adminNotes: booking.admin_notes,
    createdAt: booking.created_at
  }));
  
  return cachedBookings;
}

function getBookings() {
  return cachedBookings || [];
}

// Request booking via RPC (server validates everything)
async function requestBooking(startISO, endISO, userNotes = '') {
  if (!currentUser) {
    throw new Error('Must be logged in to book');
  }

  const { data, error } = await db.rpc('request_booking', {
    p_start: startISO,
    p_end: endISO,
    p_user_notes: userNotes || null
  });
  
  if (error) {
    throw new Error(error.message || 'Failed to create booking');
  }
  
  await loadBookings();
  return data;
}

// Cancel own booking (users can only cancel pending bookings)
async function cancelBooking(bookingId) {
  const { error } = await db
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)
    .eq('user_id', currentUser.id)
    .eq('status', 'pending');
  
  if (error) {
    console.error('Error cancelling booking:', error);
    throw error;
  }
  
  // Refresh cache
  await loadBookings();
}

// ========== ADMIN FUNCTIONS ==========

// Approve/decline/cancel bookings (admin only)
async function setBookingStatus(bookingId, status, adminNotes = '') {
  if (!isAdmin) {
    throw new Error('Admin access required');
  }
  
  try {
    const { error } = await db.rpc('admin_set_booking_status', {
      p_booking_id: bookingId,
      p_status: status,
      p_admin_notes: adminNotes || null
    });
    
    if (error) {
      throw new Error(error.message || 'Failed to update booking status');
    }
    
    // Refresh bookings
    await loadBookings();
  } catch (error) {
    console.error('Error setting booking status:', error);
    throw error;
  }
}

// Delete booking (admin only)
async function deleteBooking(bookingId) {
  if (!isAdmin) {
    throw new Error('Admin access required');
  }
  
  const { error } = await db
    .from('bookings')
    .delete()
    .eq('id', bookingId);
  
  if (error) {
    console.error('Error deleting booking:', error);
    throw error;
  }
  
  // Refresh cache
  await loadBookings();
}

// Update booking (admin only) - date, time, duration, notes
async function updateBooking(bookingId, { startISO, endISO, durationMinutes, userNotes, adminNotes }) {
  if (!isAdmin) {
    throw new Error('Admin access required');
  }
  
  const updates = {};
  if (startISO != null) updates.start_time = startISO;
  if (endISO != null) updates.end_time = endISO;
  if (durationMinutes != null) updates.duration_minutes = durationMinutes;
  if (userNotes !== undefined) updates.user_notes = userNotes || null;
  if (adminNotes !== undefined) updates.admin_notes = adminNotes || null;
  
  if (Object.keys(updates).length === 0) return;
  
  const { error } = await db
    .from('bookings')
    .update(updates)
    .eq('id', bookingId);
  
  if (error) {
    console.error('Error updating booking:', error);
    throw error;
  }
  
  await loadBookings();
}

// Admin create one-off booking (no user account required)
async function adminCreateBooking(startISO, endISO, userEmail = 'Walk-in', userNotes = '', adminNotes = '') {
  if (!isAdmin) {
    throw new Error('Admin access required');
  }
  
  const { data, error } = await db.rpc('admin_create_booking', {
    p_start: startISO,
    p_end: endISO,
    p_user_email: userEmail || 'Walk-in',
    p_user_notes: userNotes || null,
    p_admin_notes: adminNotes || null
  });
  
  if (error) {
    throw new Error(error.message || 'Failed to create booking');
  }
  
  await loadBookings();
  return data;
}

// Invite user (admin only)
async function inviteUser(email) {
  if (!isAdmin) {
    throw new Error('Admin access required');
  }
  
  try {
    const { error } = await db.rpc('admin_invite_email', {
      p_email: email.toLowerCase().trim()
    });
    
    if (error) {
      throw new Error(error.message || 'Failed to invite user');
    }
    
    // Refresh allowed users
    await loadAllowedUsers();
  } catch (error) {
    console.error('Error inviting user:', error);
    throw error;
  }
}

// Remove invitation (admin only)
async function removeInvite(email) {
  if (!isAdmin) {
    throw new Error('Admin access required');
  }
  
  try {
    const { error } = await db.rpc('admin_remove_invite', {
      p_email: email.toLowerCase().trim()
    });
    
    if (error) {
      throw new Error(error.message || 'Failed to remove invite');
    }
    
    // Refresh allowed users
    await loadAllowedUsers();
  } catch (error) {
    console.error('Error removing invite:', error);
    throw error;
  }
}

// Load allowed users (admin only)
async function loadAllowedUsers() {
  if (!isAdmin) {
    cachedAllowedUsers = [];
    return [];
  }
  
  const { data, error } = await db
    .from('allowed_users')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error loading allowed users:', error);
    return [];
  }
  
  cachedAllowedUsers = data || [];
  return cachedAllowedUsers;
}

function getAllowedUsers() {
  return cachedAllowedUsers || [];
}

// ========== INITIALIZATION ==========

async function loadAll() {
  // #region agent log
  var _loadAllRunId = Date.now();
  fetch('http://127.0.0.1:7242/ingest/be562c05-4b81-44cd-b5e5-6919afb000f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'storage.js:loadAll',message:'loadAll started',data:{runId:_loadAllRunId},timestamp:_loadAllRunId,runId:String(_loadAllRunId),hypothesisId:'H4'})}).catch(()=>{});
  // #endregion
  try {
    await initAuth();
    // Brief delay so auth state change from getSession() can settle (reduces AbortErrors)
    await new Promise(r => setTimeout(r, 400));
    
    // Load settings (always - public data)
    try {
      await loadSettings();
    } catch (err) {
      console.warn('Could not load settings, using defaults');
      cachedSettings = DEFAULT_SETTINGS;
    }
    
    // Load data based on auth status
    if (currentUser) {
      try {
        await loadBookings();
      } catch (err) {
        console.warn('Could not load bookings');
        cachedBookings = [];
      }
      
      try {
        await loadProfiles();
      } catch (err) {
        console.warn('Could not load profiles');
        cachedProfiles = [];
      }
      
      if (isAdmin) {
        try {
          await loadAllowedUsers();
        } catch (err) {
          console.warn('Could not load allowed users');
          cachedAllowedUsers = [];
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error in loadAll:', error);
    return false;
  }
}

// ========== CONFLICT CHECKING (CLIENT-SIDE HELPER) ==========

function checkBookingConflict(startISO, endISO, excludeId = null) {
  const settings = getSettings();
  const bufferMs = settings.bufferMinutes * 60 * 1000;
  
  const newStart = new Date(startISO).getTime();
  const newEnd = new Date(endISO).getTime();
  
  const bookings = getBookings();
  
  for (const booking of bookings) {
    // Skip excluded booking
    if (booking.id === excludeId) continue;
    
    // Only check approved bookings
    if (booking.status !== 'approved') continue;
    
    const existingStart = new Date(booking.startISO).getTime();
    const existingEnd = new Date(booking.endISO).getTime();
    
    // Check overlap with buffer
    if (
      (newStart >= existingStart - bufferMs && newStart < existingEnd + bufferMs) ||
      (newEnd > existingStart - bufferMs && newEnd <= existingEnd + bufferMs) ||
      (newStart <= existingStart - bufferMs && newEnd >= existingEnd + bufferMs)
    ) {
      return booking;
    }
  }
  
  return null;
}

// ========== EXPORT ==========

window.storage = {
  // Auth
  initAuth,
  getCurrentUser,
  getCurrentSession,
  getIsAdmin,
  signOut,
  signInWithPassword,
  changePassword,
  needsPasswordChange,
  markPasswordChanged,
  
  // Settings
  getSettings,
  loadSettings,
  setSettings,
  
  // Profiles (replaces users)
  loadProfiles,
  getProfiles,
  updateProfile,
  
  // Bookings
  loadBookings,
  getBookings,
  requestBooking,
  cancelBooking,
  checkBookingConflict,
  
  // Admin functions
  setBookingStatus,
  deleteBooking,
  updateBooking,
  adminCreateBooking,
  inviteUser,
  removeInvite,
  loadAllowedUsers,
  getAllowedUsers,
  
  // Initialization
  loadAll
};

})();
