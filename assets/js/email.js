// ============================================================
// EMAIL.JS - Booking email notification helper
// Calls send-booking-email Edge Function via direct fetch
// ============================================================

(function() {
'use strict';

/**
 * Send booking email notification via Edge Function
 * Non-blocking - logs errors but doesn't throw
 * @param {string} event - BOOKING_SUBMITTED | BOOKING_APPROVED | BOOKING_DECLINED | BOOKING_CANCELLED
 * @param {string} bookingId - UUID of the booking
 */
async function notifyBookingEmail(event, bookingId) {
  if (!event || !bookingId) {
    console.error('notifyBookingEmail: Missing event or bookingId');
    return;
  }

  const validEvents = ['BOOKING_SUBMITTED', 'BOOKING_APPROVED', 'BOOKING_DECLINED', 'BOOKING_CANCELLED'];
  if (!validEvents.includes(event)) {
    console.error('notifyBookingEmail: Invalid event type:', event);
    return;
  }

  try {
    // Validate user and refresh session if needed
    const { data: userData, error: userErr } = await window.supabaseClient.auth.getUser();
    
    if (userErr || !userData.user) {
      console.warn('Email notification skipped: User validation failed');
      return;
    }
    
    // Get fresh session after validation (may have been refreshed)
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    
    if (!session || !session.access_token) {
      console.warn('Email notification skipped: No active session');
      return;
    }
    
    // Call Edge Function using Supabase client (handles auth automatically)
    const { data, error } = await window.supabaseClient.functions.invoke('send-booking-email', {
      body: {
        event,
        bookingId
      }
    });

    if (error) {
      console.error('Email notification failed:', error);
      return;
    }

    if (data && data.ok !== true) {
      console.error('Email notification error:', data.error || 'Unknown error');
      return;
    }
    
  } catch (err) {
    console.error('Email notification error:', err);
  }
}

// Export to global scope
window.emailNotifications = {
  notifyBookingEmail
};

})();
