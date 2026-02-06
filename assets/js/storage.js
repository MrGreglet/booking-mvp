// ============================================================
// STORAGE.JS - Supabase Auth + RPC Backend Layer
// Invite-only magic link auth with server-enforced security
// ============================================================

(function() {
'use strict';

const db = window.supabaseClient;

// Default settings
const DEFAULT_SETTINGS = {
  openTime: '09:00',
  closeTime: '17:00',
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

// ========== AUTH MANAGEMENT ==========

async function initAuth() {
  try {
    // Get current session
    const { data: { session }, error } = await db.auth.getSession();
    
    if (error) {
      // Invalid session - clear it
      console.warn('Invalid session detected, clearing...');
      await db.auth.signOut();
      return null;
    }
    
    if (session) {
      currentSession = session;
      currentUser = session.user;
      
      // Check if user is admin
      await checkAdminStatus();
      
      // Ensure profile exists
      try {
        await db.rpc('get_or_create_profile');
      } catch (err) {
        // Silently fail if profile creation errors (user might not have access)
        console.log('Profile check skipped');
      }
      
      return currentUser;
    }
    
    return null;
  } catch (error) {
    // Catch any unexpected errors and clear session
    console.warn('Auth initialization error, clearing session');
    try {
      await db.auth.signOut();
    } catch (e) {
      // Ignore signOut errors
    }
    return null;
  }
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

// Magic link request via Edge Function (DEPRECATED - keeping for backwards compatibility)
async function requestMagicLink(email) {
  // Use Supabase client's built-in functions.invoke method
  try {
    const { data, error } = await db.functions.invoke('request-magic-link', {
      body: { email }
    });
    
    if (error) {
      throw new Error(error.message || 'Failed to send magic link');
    }
    
    return data;
  } catch (error) {
    console.error('Error requesting magic link:', error);
    throw error;
  }
}

// Password authentication
async function signInWithPassword(email, password) {
  const { data, error } = await db.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: password
  });
  
  if (error) {
    throw new Error(error.message || 'Login failed');
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
  
  try {
    if (event === 'SIGNED_IN' && session) {
      currentSession = session;
      currentUser = session.user;
      
      try {
        await checkAdminStatus();
      } catch (err) {
        console.warn('Could not check admin status:', err.message);
        isAdmin = false;
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
    openTime: data.business_hours_start,
    closeTime: data.business_hours_end,
    bufferMinutes: data.buffer_minutes,
    slotIntervalMinutes: data.slot_interval_minutes
  };
  
  return cachedSettings;
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
    // Non-admins can only see their own profile
    if (!currentUser) return [];
    
    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('user_id', currentUser.id)
      .single();
    
    if (error) {
      console.error('Error loading profile:', error);
      return [];
    }
    
    cachedProfiles = data ? [data] : [];
    return cachedProfiles;
  }
  
  // Admins can see all profiles
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  
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
  let query = db
    .from('bookings')
    .select('*')
    .order('start_time', { ascending: true });
  
  // Non-admins only see their own bookings
  if (!isAdmin && currentUser) {
    query = query.eq('user_id', currentUser.id);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error loading bookings:', error);
    return [];
  }
  
  // Transform to match old format
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
  
  try {
    const { data, error } = await db.rpc('request_booking', {
      p_start: startISO,
      p_end: endISO,
      p_user_notes: userNotes || null
    });
    
    if (error) {
      // Extract meaningful error message
      const errorMsg = error.message || 'Failed to create booking';
      throw new Error(errorMsg);
    }
    
    // Refresh bookings
    await loadBookings();
    
    return data; // Returns booking ID
  } catch (error) {
    console.error('Error requesting booking:', error);
    throw error;
  }
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
  try {
    // Initialize auth first
    await initAuth();
    
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
  requestMagicLink, // deprecated
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
  inviteUser,
  removeInvite,
  loadAllowedUsers,
  getAllowedUsers,
  
  // Initialization
  loadAll
};

})();
