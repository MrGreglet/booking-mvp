// ============================================================
// EDGE FUNCTION: send-booking-email
// Sends booking notification emails via Resend API
// Handles: BOOKING_SUBMITTED, BOOKING_APPROVED, BOOKING_DECLINED, BOOKING_CANCELLED
// Security: JWT validation + owner/admin authorization
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type BookingEvent = 'BOOKING_SUBMITTED' | 'BOOKING_APPROVED' | 'BOOKING_DECLINED' | 'BOOKING_CANCELLED'

interface EmailRequest {
  event: BookingEvent
  bookingId: string
}

interface Booking {
  id: string
  user_id: string
  user_email: string
  start_time: string
  end_time: string
  duration_minutes: number
  status: string
  user_notes: string | null
  admin_notes: string | null
  created_at: string
}

interface Settings {
  admin_notification_email?: string
  support_email?: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const emailFrom = Deno.env.get('EMAIL_FROM')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }

    if (!resendApiKey || !emailFrom) {
      throw new Error('Missing Resend configuration')
    }

    // Check for required headers (case-insensitive)
    let authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
    let apikey = req.headers.get('apikey') || req.headers.get('Apikey') || req.headers.get('APIKEY')

    if (!authHeader || !apikey) {
      return new Response(
        JSON.stringify({ code: 401, message: 'Missing auth' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate JWT by calling Supabase Auth API
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': authHeader,
        'apikey': apikey
      }
    })

    if (!authResponse.ok) {
      return new Response(
        JSON.stringify({ code: 401, message: 'Invalid JWT' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authedUser = await authResponse.json()
    const callerId = authedUser.id
    const callerEmail = authedUser.email

    // Create Supabase admin client for data access
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Parse request body
    const { event, bookingId }: EmailRequest = await req.json()

    if (!event || !bookingId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing event or bookingId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const validEvents: BookingEvent[] = ['BOOKING_SUBMITTED', 'BOOKING_APPROVED', 'BOOKING_DECLINED', 'BOOKING_CANCELLED']
    if (!validEvents.includes(event)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid event type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch booking details using service role
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Booking not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Authorization checks
    if (event === 'BOOKING_SUBMITTED') {
      // Caller must be booking owner
      if (booking.user_id !== callerId) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Only booking owner can trigger BOOKING_SUBMITTED' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      // For APPROVED/DECLINED/CANCELLED, caller must be admin
      const { data: adminCheck, error: adminError } = await supabaseAdmin
        .from('admin_users')
        .select('user_id')
        .eq('user_id', callerId)
        .single()

      if (adminError || !adminCheck) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Fetch settings for admin notification email
    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('id', 'default')
      .single()

    // Determine recipient email based on event
    let recipientEmail: string
    let emailSubject: string
    let emailHtml: string
    let emailText: string
    let adminEmails: string[] = []

    const startTime = new Date(booking.start_time).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'UTC'
    })
    const endTime = new Date(booking.end_time).toLocaleString('en-US', {
      timeStyle: 'short',
      timeZone: 'UTC'
    })

    if (event === 'BOOKING_SUBMITTED') {
      // Fetch all admin user IDs
      const { data: adminUsers } = await supabaseAdmin
        .from('admin_users')
        .select('user_id')
      
      if (adminUsers && adminUsers.length > 0) {
        const adminUserIds = adminUsers.map(a => a.user_id)
        
        // Fetch admin emails from profiles table
        const { data: adminProfiles } = await supabaseAdmin
          .from('profiles')
          .select('email')
          .in('user_id', adminUserIds)
        
        if (adminProfiles && adminProfiles.length > 0) {
          adminEmails = adminProfiles
            .map(p => p.email)
            .filter(email => email && email.includes('@'))
        }
      }
      
      // Fallback to settings if no admin emails found
      if (adminEmails.length === 0) {
        const fallbackEmail = (settings as any)?.admin_notification_email || 
                              (settings as any)?.support_email || 
                              'support@studio94.xyz'
        adminEmails = [fallbackEmail]
      }
      
      // Use EmailFrom as the "To" address, admins will be BCC'd
      recipientEmail = emailFrom
      
      emailSubject = `Studio94 - New Booking Request from ${booking.user_email}`
      emailHtml = `
        <h2>New Booking Request</h2>
        <p>A new booking has been submitted and is awaiting your approval.</p>
        
        <h3>Booking Details:</h3>
        <ul>
          <li><strong>User:</strong> ${booking.user_email}</li>
          <li><strong>Start:</strong> ${startTime}</li>
          <li><strong>End:</strong> ${endTime}</li>
          <li><strong>Duration:</strong> ${booking.duration_minutes} minutes</li>
          <li><strong>Status:</strong> ${booking.status}</li>
          ${booking.user_notes ? `<li><strong>Notes:</strong> ${booking.user_notes}</li>` : ''}
        </ul>
        
        <p>Please review and approve/decline this booking in the admin panel.</p>
        
        <p style="color: #666; font-size: 12px;">Booking ID: ${booking.id}</p>
      `
      emailText = `New Booking Request\n\nA new booking has been submitted and is awaiting your approval.\n\nBooking Details:\nUser: ${booking.user_email}\nStart: ${startTime}\nEnd: ${endTime}\nDuration: ${booking.duration_minutes} minutes\nStatus: ${booking.status}\n${booking.user_notes ? `Notes: ${booking.user_notes}\n` : ''}\nBooking ID: ${booking.id}`
    
    } else if (event === 'BOOKING_APPROVED') {
      // Send to user
      recipientEmail = booking.user_email
      emailSubject = `Studio94 - Your Booking is Approved! ${startTime}`
      emailHtml = `
        <h2>Booking Approved ✓</h2>
        <p>Great news! Your booking has been approved.</p>
        
        <h3>Booking Details:</h3>
        <ul>
          <li><strong>Start:</strong> ${startTime}</li>
          <li><strong>End:</strong> ${endTime}</li>
          <li><strong>Duration:</strong> ${booking.duration_minutes} minutes</li>
          ${booking.admin_notes ? `<li><strong>Admin Notes:</strong> ${booking.admin_notes}</li>` : ''}
        </ul>
        
        <p>We look forward to seeing you!</p>
        
        <p style="color: #666; font-size: 12px;">Booking ID: ${booking.id}</p>
      `
      emailText = `Booking Approved\n\nGreat news! Your booking has been approved.\n\nBooking Details:\nStart: ${startTime}\nEnd: ${endTime}\nDuration: ${booking.duration_minutes} minutes\n${booking.admin_notes ? `Admin Notes: ${booking.admin_notes}\n` : ''}\nBooking ID: ${booking.id}`
    
    } else if (event === 'BOOKING_DECLINED') {
      // Send to user
      recipientEmail = booking.user_email
      emailSubject = `Studio94 - Booking Declined for ${startTime}`
      emailHtml = `
        <h2>Booking Declined</h2>
        <p>Unfortunately, your booking request could not be approved at this time.</p>
        
        <h3>Booking Details:</h3>
        <ul>
          <li><strong>Start:</strong> ${startTime}</li>
          <li><strong>End:</strong> ${endTime}</li>
          <li><strong>Duration:</strong> ${booking.duration_minutes} minutes</li>
          ${booking.admin_notes ? `<li><strong>Reason:</strong> ${booking.admin_notes}</li>` : ''}
        </ul>
        
        <p>Please feel free to submit a new booking request for a different time.</p>
        
        <p style="color: #666; font-size: 12px;">Booking ID: ${booking.id}</p>
      `
      emailText = `Booking Declined\n\nUnfortunately, your booking request could not be approved at this time.\n\nBooking Details:\nStart: ${startTime}\nEnd: ${endTime}\nDuration: ${booking.duration_minutes} minutes\n${booking.admin_notes ? `Reason: ${booking.admin_notes}\n` : ''}\nBooking ID: ${booking.id}`
    
    } else if (event === 'BOOKING_CANCELLED') {
      // Send to user
      recipientEmail = booking.user_email
      emailSubject = `Studio94 - Booking Cancelled for ${startTime}`
      emailHtml = `
        <h2>Booking Cancelled</h2>
        <p>Your booking has been cancelled.</p>
        
        <h3>Booking Details:</h3>
        <ul>
          <li><strong>Start:</strong> ${startTime}</li>
          <li><strong>End:</strong> ${endTime}</li>
          <li><strong>Duration:</strong> ${booking.duration_minutes} minutes</li>
          ${booking.admin_notes ? `<li><strong>Notes:</strong> ${booking.admin_notes}</li>` : ''}
        </ul>
        
        <p>If you have any questions, please contact support.</p>
        
        <p style="color: #666; font-size: 12px;">Booking ID: ${booking.id}</p>
      `
      emailText = `Booking Cancelled\n\nYour booking has been cancelled.\n\nBooking Details:\nStart: ${startTime}\nEnd: ${endTime}\nDuration: ${booking.duration_minutes} minutes\n${booking.admin_notes ? `Notes: ${booking.admin_notes}\n` : ''}\nBooking ID: ${booking.id}`
    } else {
      throw new Error('Unhandled event type')
    }

    // Send email via Resend API
    const emailPayload: any = {
      from: emailFrom,
      to: recipientEmail,
      subject: emailSubject,
      html: emailHtml,
      text: emailText
    }
    
    // For BOOKING_SUBMITTED, use BCC to send to all admins
    if (event === 'BOOKING_SUBMITTED' && adminEmails.length > 0) {
      emailPayload.bcc = adminEmails
    }
    
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    })

    const resendData = await resendResponse.json()

    if (!resendResponse.ok) {
      console.error('Resend API error:', resendData)
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: 'Failed to send email',
          details: resendData
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        ok: true,
        emailId: resendData.id,
        recipient: recipientEmail
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message || 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
