# Studio94 Booking System

**Invite-only booking platform with password authentication and enterprise-grade security.**

Built with vanilla JavaScript, Supabase Auth, and PostgreSQL. Features glassmorphism dark theme and real-time data synchronization.

---

## 🔐 Security-First Architecture

- **Invite-Only Access**: Only pre-approved users can log in
- **Password Authentication**: Secure password-based login
- **Server-Side Validation**: All booking rules enforced by PostgreSQL functions
- **Row Level Security (RLS)**: Database-level access control
- **First-Login Password Change**: Users must change temporary password on first login

---

## Features

### 🎟️ Invite System (Admin)
- **User Creation**: Create users with auto-generated temporary passwords
- **Admin Control**: Only admins can create new users
- **Real-time Updates**: User list syncs across all devices
- **Audit Trail**: Track who invited whom

### 👤 User Experience
- **Password Login**: Enter email and password to log in
- **Week Calendar View**: Browse available time slots
- **Instant Booking**: Request bookings with optional notes
- **My Bookings**: View all your bookings (pending, approved, declined)
- **Status Tracking**: Real-time booking status updates
- **Cancel Requests**: Cancel pending bookings anytime
- **Mobile Optimized**: Works perfectly on phones and tablets

### 🛠️ Admin Dashboard
- **4-Tab Interface**: Invites | Profiles | Bookings | Settings
- **User Management**: Invite users via Edge Function with email notifications
- **Profile Editor**: Manage user memberships and contracts
- **Booking Approval**: Approve, decline, or cancel bookings
- **Email Notifications**: Auto-notify users on booking status changes
- **Conflict Detection**: Automatic overlap prevention
- **Weekly Limits**: Enforce booking quotas for subscribed users
- **Admin Notes**: Add internal notes to bookings
- **Settings Control**: Configure business hours, buffers, and intervals

### 🔒 Server-Enforced Rules
- **Duration Rules**: 1-12 hours, multiple of 30 minutes
- **Buffer Enforcement**: 30-minute minimum gap between bookings
- **Weekly Limits**: Max 1 booking/week for subscribed users
- **Conflict Prevention**: Server validates all booking overlaps
- **Invite Validation**: Only invited users can create bookings

### 🚀 Technical Highlights
- **Supabase Auth**: Built-in password authentication
- **Edge Functions**: Serverless email notifications via Resend
- **PostgreSQL RLS**: Row-level security policies
- **RPC Functions**: Server-side business logic
- **Email Notifications**: Automated booking status emails (BCC to all admins)
- **Real-time Sync**: Multi-device data synchronization
- **Zero Dependencies**: Pure vanilla JavaScript
- **Responsive Design**: Mobile-first UI with glassmorphism

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  User Browser                        │
│  ┌──────────────┐         ┌──────────────┐         │
│  │ Public Site  │         │  Admin Site  │         │
│  │ (index.html) │         │ (admin.html) │         │
│  └──────┬───────┘         └──────┬───────┘         │
│         │                        │                  │
│         │  Password Login        │                  │
│         └────────────┬───────────┘                  │
└──────────────────────┼──────────────────────────────┘
                       │
           ┌───────────▼───────────┐
           │  Supabase Backend     │
           ├───────────────────────┤
           │  • Auth (passwords)   │
           │  • PostgreSQL DB      │
           │  • RLS Policies       │
           │  • RPC Functions      │
           └───────────────────────┘
                       │
           ┌───────────▼───────────┐
           │  Tables               │
           ├───────────────────────┤
           │  • allowed_users      │
           │  • admin_users        │
           │  • profiles           │
           │  • bookings           │
           │  • settings           │
           └───────────────────────┘
```

---

## Project Structure

```
booking-mvp/
├── index.html                              # Public booking interface
├── admin.html                              # Admin dashboard
├── auth.html                               # Password reset page
├── README.md                               # Project overview
├── docs/
│   ├── DEPLOYMENT.md                       # Deployment guide
│   ├── DEPLOY_READY.md                     # Deployment changelog
│   ├── INVITE_SYSTEM_IMPLEMENTATION.md     # Invite system details
│   └── TEST_PLAN.md                        # Comprehensive test plan
├── assets/
│   ├── css/
│   │   └── styles.css                      # Glassmorphism dark theme
│   └── js/
│       ├── config.js                       # Configuration (Supabase URL/key, branding, settings)
│       ├── supabase-config.js              # Supabase client initialization
│       ├── email.js                        # Email notification helper
│       ├── utils.js                        # Utility functions (dates, toasts, etc.)
│       ├── storage.js                      # Data layer with Auth + RPC
│       ├── app.js                          # Public booking UI logic
│       └── admin.js                        # Admin dashboard logic
├── docs/
│   └── DEPLOYMENT.md                       # Complete installation guide
└── supabase/
    ├── setup_fresh.sql                     # Fresh install (drops tables)
    ├── upgrade_safe.sql                    # Safe updates (no data loss)
    └── functions/
        ├── admin-invite-user/              # Edge Function: User invites
        │   ├── index.ts
        │   └── README.md
        └── send-booking-email/             # Edge Function: Email notifications
            ├── index.ts
            └── README.md
```

---

## Quick Start

### For Users

1. **Get Account**: Admin must create an account for you
2. **Receive Credentials**: Admin provides email and temporary password
3. **First Login**: Log in and change your temporary password
4. **Book Session**: Click available slot, choose duration, submit request
5. **Wait for Approval**: Admin will approve/decline your booking

### For Admins

1. **Get Admin Access**: Your email must be in `admin_users` table
2. **Login**: Use email and password at `/admin.html`
3. **Create Users**: Go to Invites tab, click "Invite User"
4. **Approve Bookings**: Go to Bookings tab, review pending requests
5. **Manage Profiles**: Edit user memberships and contracts

---

## Deployment

**See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for complete setup instructions.**

### Quick Summary

1. **Database Setup**: Run `supabase/setup_fresh.sql` in Supabase SQL Editor (or `supabase/upgrade_safe.sql` to update existing database)
2. **Create Admin**: Insert your user_id into `admin_users` table
3. **Configure Frontend**: Edit `assets/js/config.js` with your Supabase URL, anon key, and branding
4. **Deploy**: Upload to any static host (Netlify, Vercel, GitHub Pages, etc.)

---

## Testing

**See [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) for comprehensive test scenarios.**

### Critical Tests

✅ Non-invited user cannot log in  
✅ Invited user can log in with password  
✅ First-time users must change password  
✅ Non-admin cannot access admin dashboard  
✅ Admin can create/remove users  
✅ Booking conflicts detected (30-min buffer)  
✅ Weekly limits enforced for subscribed users  
✅ RLS policies prevent unauthorized access  
✅ Server validates all booking rules  

---

## Database Schema

### Core Tables

**`allowed_users`** - User allowlist
- `email` (PK) - User email
- `invited_by` (FK) - Admin who invited
- `created_at` - Invite timestamp

**`admin_users`** - Admin privileges
- `user_id` (PK, FK to auth.users) - Admin user
- `created_at` - Admin since

**`profiles`** - User data
- `user_id` (PK, FK to auth.users)
- `email` - User email
- `name` - Display name
- `membership` - 'standard' or 'subscribed'
- `weekly_limit` - Max bookings per week
- `contract_details` - Contract info

**`bookings`** - Booking records
- `id` (PK) - Booking UUID
- `user_id` (FK to auth.users)
- `user_email` - User email (denormalized)
- `start_time` - Start timestamp
- `end_time` - End timestamp
- `duration_minutes` - Duration in minutes
- `status` - 'pending' | 'approved' | 'declined' | 'cancelled'
- `user_notes` - User notes
- `admin_notes` - Admin notes

**`settings`** - System configuration
- `business_hours_start` - Opening time
- `business_hours_end` - Closing time
- `buffer_minutes` - Gap between bookings
- `slot_interval_minutes` - Calendar slot size

---

## RPC Functions

### `request_booking(p_start, p_end, p_user_notes)`
**User-callable** - Creates booking request with server-side validation

Rules enforced:
- User must be authenticated
- Email must be in `allowed_users`
- Duration: 1-12 hours, multiple of 30 minutes
- No conflicts with approved bookings (+ 30-min buffer)
- Weekly limit for subscribed users (1 per week)

Returns: `booking_id` (UUID)

### `admin_set_booking_status(p_booking_id, p_status, p_admin_notes)`
**Admin-only** - Approves, declines, or cancels bookings

Checks:
- User must be in `admin_users`
- Valid status transition
- No conflicts when approving

### `admin_invite_email(p_email)`
**Admin-only** - Adds email to allowlist

### `admin_remove_invite(p_email)`
**Admin-only** - Removes email from allowlist

### `get_or_create_profile()`
**Authenticated users** - Ensures profile exists after first login

---

## Security

### Authentication
- ✅ Password-based authentication (Supabase Auth)
- ✅ Invite-only access
- ✅ First-login password change required
- ✅ Secure password storage (bcrypt)
- ✅ Session management

### Authorization
- ✅ RLS policies on all tables
- ✅ Users see only their own bookings
- ✅ Admins see everything
- ✅ Non-admins cannot call admin RPCs
- ✅ Server validates all actions

### Data Protection
- ✅ Service role key stored as secret (never exposed)
- ✅ Anon key safe for client-side use (RLS protects data)
- ✅ HTTPS via GitHub Pages
- ✅ PostgreSQL injection protection (parameterized queries)
- ✅ Input validation on server

---

## Configuration

### Client Config

File: `assets/js/config.js`

```javascript
window.CONFIG = {
  branding: {
    appName: 'Studio94',
    appNameAdmin: 'Studio94 Admin',
    supportEmail: 'support@example.com'
  },
  supabase: {
    url: 'https://your-project.supabase.co',
    anonKey: 'your-anon-key'  // Safe to expose (RLS protects data)
  },
  timezone: 'Europe/London',
  // ... more settings
};
```

⚠️ **IMPORTANT**: Replace `url` and `anonKey` with your own Supabase project credentials!

---

## Tech Stack

**Frontend**
- Pure Vanilla JavaScript (ES6+)
- HTML5 + CSS3
- Glassmorphism UI design
- No frameworks or build tools

**Backend**
- Supabase (managed PostgreSQL)
- Supabase Auth (password authentication)
- Row Level Security (RLS)
- PostgreSQL Functions (PL/pgSQL)

**Hosting**
- GitHub Pages (static hosting)
- Supabase (database + auth)

---

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile Safari (iOS 14+)
- ✅ Mobile Chrome (Android 10+)

Requires:
- ES6+ support
- Fetch API
- CSS Grid
- CSS Custom Properties

---

## Development

### Local Testing

1. Clone repository
2. Update `assets/js/config.js` with your Supabase credentials
3. Open `index.html` in browser (no build step needed!)

### Debugging

**Check auth state:**
```javascript
const user = window.storage.getCurrentUser();
console.log('Current user:', user);
console.log('Is admin:', window.storage.getIsAdmin());
```

**Check session:**
```javascript
const session = window.storage.getCurrentSession();
console.log('Session:', session);
```

**Test RPC directly:**
```javascript
const { data, error } = await window.supabaseClient.rpc('request_booking', {
  p_start: '2026-02-10T10:00:00Z',
  p_end: '2026-02-10T12:00:00Z',
  p_user_notes: 'Test booking'
});
console.log('Result:', data, error);
```

---

## Troubleshooting

### "Admin access required" after login
**Solution**: Add your user_id to admin_users table

### Invalid login credentials
**Solution**: 
1. Verify email is in allowed_users table
2. Check password is correct
3. Ensure user account exists in Supabase Auth

### User can't log in
**Solution**: Admin must create account via Invites tab

### Booking conflict errors
**Solution**: Check for overlapping approved bookings ± 30 minutes

---

## Support

For issues or questions:
1. Check `DEPLOYMENT.md` for setup help
2. Review `docs/TEST_PLAN.md` for expected behavior
3. Check Supabase logs for backend errors
4. Check browser console for frontend errors

---

## Features Implemented

- ✅ Email notifications for booking status (Resend API)
- ✅ Edge Functions for user invites and emails
- ✅ BCC notifications to all admins
- ✅ Secure JWT validation in Edge Functions

## Future Enhancements

- [ ] Calendar export (iCal format)
- [ ] Recurring bookings
- [ ] Payment integration
- [ ] Custom email templates
- [ ] Multi-location support
- [ ] SMS notifications

---

**Built with ❤️ for Studio94**

*Secure, scalable, and simple.*
