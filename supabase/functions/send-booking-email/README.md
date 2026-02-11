# Send Booking Email - Edge Function

Server-side function to send booking notification emails via Resend API.

## Purpose

- Sends email notifications for booking events:
  - **BOOKING_SUBMITTED**: Notifies admin when user submits a booking
  - **BOOKING_APPROVED**: Notifies user when admin approves booking
  - **BOOKING_DECLINED**: Notifies user when admin declines booking
  - **BOOKING_CANCELLED**: Notifies user when booking is cancelled
- Validates authorization (booking owner for SUBMITTED, admin for others)
- Fetches booking details server-side using service role
- Sends emails via Resend REST API

## Prerequisites

1. **Resend API Key**: Set as Supabase secret
2. **Domain Verified**: studio94.xyz must be verified in Resend
3. **Supabase Secrets Set**:
   - `RESEND_API_KEY`
   - `EMAIL_FROM` (e.g., `Studio94 <noreply@studio94.xyz>`)

## Deployment

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

### 3. Link to your project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### 4. Set secrets (if not already set)

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
supabase secrets set EMAIL_FROM="Studio94 <noreply@studio94.xyz>"
```

Verify secrets:

```bash
supabase secrets list
```

### 5. Deploy the function

```bash
supabase functions deploy send-booking-email
```

### 6. Verify deployment

```bash
supabase functions list
```

## Environment Variables

The function requires these environment variables:

**Automatically available (Supabase):**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (has admin privileges)

**Must be set as secrets:**
- `RESEND_API_KEY` - Your Resend API key
- `EMAIL_FROM` - Sender email address (must be verified domain)

## Usage

### From Frontend

Called via `supabase.functions.invoke()`:

```javascript
const { data, error } = await supabaseClient.functions.invoke('send-booking-email', {
  body: { 
    event: 'BOOKING_SUBMITTED',
    bookingId: 'uuid-here'
  }
});
```

### Event Types

| Event | Description | Sender Auth | Recipient |
|-------|-------------|-------------|-----------|
| `BOOKING_SUBMITTED` | User submits booking | Booking owner | Admin notification email |
| `BOOKING_APPROVED` | Admin approves booking | Admin | Booking owner |
| `BOOKING_DECLINED` | Admin declines booking | Admin | Booking owner |
| `BOOKING_CANCELLED` | Booking cancelled | Admin | Booking owner |

## Request Format

**POST** to function endpoint with:

```json
{
  "event": "BOOKING_SUBMITTED" | "BOOKING_APPROVED" | "BOOKING_DECLINED" | "BOOKING_CANCELLED",
  "bookingId": "uuid-of-booking"
}
```

**Headers:**
- `Authorization: Bearer <JWT_TOKEN>` (required)
- `Content-Type: application/json`

## Response Format

**Success (200):**
```json
{
  "ok": true,
  "emailId": "resend-email-id",
  "recipient": "recipient@example.com"
}
```

**Error (400/401/403/404/500):**
```json
{
  "ok": false,
  "error": "Error message",
  "details": {...}
}
```

## Security

- ✅ Requires valid JWT in Authorization header
- ✅ **BOOKING_SUBMITTED**: Only booking owner can trigger
- ✅ **APPROVED/DECLINED/CANCELLED**: Only admins can trigger
- ✅ Service role key never exposed to client
- ✅ All booking data fetched server-side
- ✅ Admin email addresses fetched from settings table

## Email Recipients

### BOOKING_SUBMITTED
Sends to admin notification email (in priority order):
1. `settings.admin_notification_email` (if exists)
2. `settings.support_email` (if exists)
3. Fallback: `support@studio94.xyz`

### APPROVED/DECLINED/CANCELLED
Sends to booking owner's email (`bookings.user_email`)

## Testing Locally

### 1. Create `.env.local` file

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM="Studio94 <noreply@studio94.xyz>"
```

### 2. Serve function locally

```bash
supabase functions serve send-booking-email --env-file .env.local
```

### 3. Test with curl

**Test BOOKING_SUBMITTED (as booking owner):**
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/send-booking-email' \
  --header 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "event": "BOOKING_SUBMITTED",
    "bookingId": "your-booking-uuid"
  }'
```

**Test BOOKING_APPROVED (as admin):**
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/send-booking-email' \
  --header 'Authorization: Bearer YOUR_ADMIN_JWT_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "event": "BOOKING_APPROVED",
    "bookingId": "your-booking-uuid"
  }'
```

### 4. Get JWT token for testing

From browser console (while logged in):
```javascript
const { data: { session } } = await supabaseClient.auth.getSession();
console.log(session.access_token);
```

## Testing in Production

### 1. Create a test booking

Use the booking form to create a booking.

### 2. Trigger email via frontend

```javascript
// After booking submission
const { data, error } = await supabaseClient.functions.invoke('send-booking-email', {
  body: { 
    event: 'BOOKING_SUBMITTED',
    bookingId: newBookingId
  }
});

if (error) {
  console.error('Email send failed:', error);
} else {
  console.log('Email sent:', data);
}
```

### 3. Check Resend Dashboard

- Login to [Resend Dashboard](https://resend.com/emails)
- View sent emails and delivery status
- Check for any errors or bounces

## Troubleshooting

### Email not sending

1. **Check secrets are set:**
   ```bash
   supabase secrets list
   ```

2. **Check function logs:**
   ```bash
   supabase functions logs send-booking-email
   ```

3. **Verify Resend domain:**
   - Go to [Resend Domains](https://resend.com/domains)
   - Ensure studio94.xyz is verified
   - Check DNS records are correct

4. **Check EMAIL_FROM format:**
   - Must be: `Name <email@verified-domain.com>`
   - Email domain must match verified domain

### Authorization errors

- **401 Unauthorized**: Invalid or missing JWT token
- **403 Forbidden (BOOKING_SUBMITTED)**: Caller is not booking owner
- **403 Forbidden (other events)**: Caller is not admin
- **404 Not Found**: Booking ID doesn't exist

### Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| "Missing Resend configuration" | Secrets not set | Run `supabase secrets set` commands |
| "Booking not found" | Invalid booking ID | Verify booking exists in database |
| "Admin access required" | Non-admin trying admin action | Ensure user is in admin_users table |
| "Failed to send email" | Resend API error | Check Resend API key and domain verification |

## Integration with Frontend

### After booking submission:

```javascript
// In booking form submission handler
const { data: booking, error } = await supabaseClient.rpc('create_booking', {...});

if (!error && booking?.id) {
  // Send notification email (non-blocking)
  supabaseClient.functions.invoke('send-booking-email', {
    body: { 
      event: 'BOOKING_SUBMITTED',
      bookingId: booking.id
    }
  }).then(({ data, error }) => {
    if (error) console.error('Email notification failed:', error);
  });
}
```

### After admin approval/decline:

```javascript
// In admin panel after status change
const { error } = await supabaseClient.rpc('admin_set_booking_status', {
  p_booking_id: bookingId,
  p_status: 'approved',
  p_admin_notes: notes
});

if (!error) {
  // Send notification email
  await supabaseClient.functions.invoke('send-booking-email', {
    body: { 
      event: 'BOOKING_APPROVED',
      bookingId: bookingId
    }
  });
}
```

## Email Templates

### BOOKING_SUBMITTED (to admin)
- Subject: `Studio94 - New Booking Request from {user_email}`
- Contains: User email, start/end times, duration, user notes
- CTA: Review in admin panel

### BOOKING_APPROVED (to user)
- Subject: `Studio94 - Your Booking is Approved! {date/time}`
- Contains: Start/end times, duration, admin notes
- Tone: Positive confirmation

### BOOKING_DECLINED (to user)
- Subject: `Studio94 - Booking Declined for {date/time}`
- Contains: Start/end times, duration, reason (admin notes)
- Tone: Professional, encouraging to try again

### BOOKING_CANCELLED (to user)
- Subject: `Studio94 - Booking Cancelled for {date/time}`
- Contains: Start/end times, duration, notes
- Tone: Neutral, contact support offered

## Notes

- Emails are sent immediately (not queued)
- Email sending is non-blocking for user actions
- Failed emails are logged but don't break the booking flow
- All emails include booking ID for tracking
- HTML and plain text versions provided
- Times displayed in UTC (consider timezone handling in future)
