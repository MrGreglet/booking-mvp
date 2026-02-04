# Studio94 Booking System - Deployment Guide

## Complete setup guide for invite-only magic link auth system

---

## Overview

This system uses:
- **Supabase Auth** for passwordless magic link login
- **Invite-only access** via allowlist
- **Row Level Security (RLS)** for data protection
- **Server-side validation** via Postgres functions
- **Edge Functions** for secure magic link delivery

---

## Prerequisites

1. **Supabase Account** (free tier is sufficient)
2. **GitHub Account** (for GitHub Pages hosting)
3. **Supabase CLI** (optional but recommended)

---

## Part 1: Database Setup

### Step 1: Run Migration SQL

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the entire contents of `supabase-auth-migration.sql`
4. Paste into SQL Editor
5. Click **Run**

This will create:
- ✅ `allowed_users` table (invite allowlist)
- ✅ `admin_users` table (admin privileges)
- ✅ `profiles` table (user data)
- ✅ `bookings` table (with auth integration)
- ✅ `settings` table
- ✅ RLS policies (all tables secured)
- ✅ Postgres functions (request_booking, admin_set_booking_status, etc.)

### Step 2: Configure Auth Settings

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider
3. **Disable** "Confirm email" (we're controlling access via invite list)
4. Go to **Authentication** → **Email Templates**
5. Customize the "Magic Link" email template (optional):
   ```
   Subject: Your Studio94 Login Link

   Hello,

   Click the link below to log in to Studio94:
   {{ .ConfirmationURL }}

   This link expires in 1 hour.
   ```

### Step 3: Create Your Admin Account

1. First, you need to **sign in** with your email to create your account:
   - Option A: Use the public site to request a magic link (will fail, but creates account)
   - Option B: Use Supabase Dashboard → Authentication → Add User (manual)

2. **Find your User ID**:
   ```sql
   SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';
   ```
   Copy your `id` (UUID).

3. **Add yourself as admin AND to allowlist**:
   ```sql
   -- Add to admin_users
   INSERT INTO admin_users (user_id) 
   VALUES ('paste-your-user-id-here');

   -- Add to allowed_users
   INSERT INTO allowed_users (email) 
   VALUES ('your-email@example.com');
   ```

4. **Verify admin access**:
   ```sql
   SELECT * FROM admin_users;
   SELECT * FROM allowed_users;
   ```

---

## Part 2: Edge Function Setup

### Step 4: Install Supabase CLI (if not installed)

```bash
# macOS / Linux
brew install supabase/tap/supabase

# Windows
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### Step 5: Link Your Project

```bash
cd booking-mvp
supabase login
supabase link --project-ref qkjcqtsacuspfdslgfxj
```

### Step 6: Deploy Edge Function

```bash
supabase functions deploy request-magic-link
```

### Step 7: Set Edge Function Secrets

```bash
# Set the service role key (CRITICAL - keep this secret!)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Set the magic link redirect URL
supabase secrets set MAGIC_LINK_REDIRECT_URL=https://mrgreglet.github.io/booking-mvp/
```

**Where to find Service Role Key:**
1. Supabase Dashboard → Settings → API
2. Under "Project API keys" → **service_role** (secret)
3. ⚠️ **NEVER commit this key to GitHub!**

### Step 8: Test Edge Function

```bash
# Test locally first (optional)
supabase functions serve request-magic-link

# Test deployed function
curl -X POST https://qkjcqtsacuspfdslgfxj.supabase.co/functions/v1/request-magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email@example.com"}'
```

Expected response (if invited):
```json
{
  "success": true,
  "message": "Check your email for the login link!"
}
```

Expected response (if NOT invited):
```json
{
  "error": "If your email is registered, you will receive a login link shortly."
}
```

---

## Part 3: Frontend Configuration

### Step 9: Update Supabase Config

File: `assets/js/supabase-config.js`

Already configured with:
```javascript
const SUPABASE_URL = 'https://qkjcqtsacuspfdslgfxj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGc...'; // Already set
```

✅ No changes needed (already using your project).

---

## Part 4: GitHub Pages Deployment

### Step 10: Update .gitignore

Ensure these are NOT committed:
```
.env
.env.local
supabase/.env
**/service-role-key*
```

### Step 11: Commit and Push

```bash
git add .
git commit -m "Implement invite-only magic link auth system"
git push origin main
```

### Step 12: Enable GitHub Pages

1. Go to your repository: `https://github.com/MrGreglet/booking-mvp`
2. Settings → Pages
3. Source: **main** branch
4. Folder: **/ (root)**
5. Click **Save**

Site will be live at: `https://mrgreglet.github.io/booking-mvp/`

---

## Part 5: Testing & Verification

### Test 1: Admin Login

1. Go to `https://mrgreglet.github.io/booking-mvp/admin.html`
2. Enter your admin email
3. Click "Send Login Link"
4. Check your email → click link
5. Should see admin dashboard with 4 tabs:
   - Invites
   - Profiles
   - Bookings
   - Settings

✅ **PASS**: Dashboard loads and you can see all tabs
❌ **FAIL**: If you see "Admin Access Required" → check admin_users table

### Test 2: Invite Non-Admin User

1. In admin dashboard → **Invites** tab
2. Click "+ Invite User"
3. Enter test email (e.g., `test@example.com`)
4. Click "Send Invite"
5. Check `allowed_users` table in Supabase:
   ```sql
   SELECT * FROM allowed_users WHERE email = 'test@example.com';
   ```

✅ **PASS**: Email appears in table
❌ **FAIL**: Check admin status and Edge Function logs

### Test 3: User Login (Invited Email)

1. Open public site: `https://mrgreglet.github.io/booking-mvp/`
2. Enter the invited email (`test@example.com`)
3. Click "Send Login Link"
4. Should see success message: "Check your email!"
5. User receives email → clicks link
6. Should see calendar with login confirmation

✅ **PASS**: User can log in and see calendar
❌ **FAIL**: Check allowed_users and Edge Function logs

### Test 4: User Login (NON-Invited Email)

1. Open public site
2. Enter random email (e.g., `hacker@evil.com`)
3. Click "Send Login Link"
4. Should see generic message (not revealing if invited or not)
5. NO email should be sent

✅ **PASS**: Generic message shown, no email sent
❌ **FAIL**: If email sent → check Edge Function code

### Test 5: Create Booking (Rules Enforcement)

#### 5a. Valid Booking
1. Log in as invited user
2. Click available slot (e.g., tomorrow 10:00 AM)
3. Select duration: 2 hours
4. Add note: "Test booking"
5. Click "Submit Request"

✅ **PASS**: "Booking request submitted!" toast
✅ **PASS**: Booking appears in admin → Bookings (pending status)

#### 5b. Conflicting Booking
1. Admin approves the booking
2. User tries to book same time or overlapping time
3. Should see error: "Booking conflicts with existing booking (including 30-minute buffer)"

✅ **PASS**: Conflict detected, booking rejected

#### 5c. Weekly Limit (Subscribed User)
1. Admin → Profiles → Edit user → Set membership to "Subscribed"
2. Admin approves 1 booking for this week
3. User tries to book another slot in same week
4. Should see error: "Weekly booking limit reached (subscribed users: 1 per week)"

✅ **PASS**: Weekly limit enforced

#### 5d. Duration Rules
1. User tries to book less than 1 hour (not possible via UI)
2. User tries to book more than 8 hours (select 8 hours)

✅ **PASS**: 1-8 hours allowed

### Test 6: Admin Approval with Conflict Check

1. User A creates booking: Tomorrow 10:00-12:00
2. User B creates booking: Tomorrow 11:00-13:00
3. Admin approves User A booking ✅
4. Admin tries to approve User B booking
5. Should see error: "Cannot approve: conflicts with existing approved booking"

✅ **PASS**: Server-side conflict validation works

### Test 7: Past Date Prevention (Users Only)

1. As regular user, try to navigate to past week
2. Should see toast: "Cannot view past weeks"
3. Calendar should not show past dates

✅ **PASS**: Users cannot book past dates

### Test 8: Data Sync Across Devices

1. Log in on PC
2. Create booking
3. Log in on mobile (same email)
4. Should see booking immediately

✅ **PASS**: Data syncs via Supabase

---

## Troubleshooting

### Issue: "Not authenticated" error
**Solution**: Check Supabase Auth → Users to verify account exists

### Issue: "Admin access required" after login
**Solution**: 
```sql
-- Check admin_users table
SELECT * FROM admin_users WHERE user_id = 'your-user-id';

-- If missing, add yourself
INSERT INTO admin_users (user_id) VALUES ('your-user-id');
```

### Issue: Magic link email not sent
**Solution**:
1. Check Edge Function logs: Supabase → Edge Functions → Logs
2. Verify secrets are set: `supabase secrets list`
3. Check email in allowed_users table
4. Verify Email provider is enabled in Auth settings

### Issue: "Email not invited" error
**Solution**:
```sql
-- Check if email is in allowlist
SELECT * FROM allowed_users WHERE email = 'user-email';

-- If missing, add via admin panel or SQL:
INSERT INTO allowed_users (email) VALUES ('user-email');
```

### Issue: RLS policy blocking access
**Solution**:
```sql
-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename IN ('bookings', 'profiles', 'allowed_users');

-- Verify user is authenticated
SELECT auth.uid(); -- Should return your user_id, not NULL
```

### Issue: Edge Function returns 403 for invited user
**Solution**:
1. Check Edge Function logs for errors
2. Verify `SUPABASE_SERVICE_ROLE_KEY` secret is set correctly
3. Test SQL query directly:
   ```sql
   SELECT * FROM allowed_users WHERE email = 'test@example.com';
   ```

---

## Security Checklist

- ✅ Service role key stored as secret (not in code)
- ✅ RLS enabled on all tables
- ✅ Email confirmation disabled (access controlled by invite list)
- ✅ Booking validation on server (RPC functions)
- ✅ Edge Function checks allowlist before sending magic links
- ✅ Admin status checked via database (not client-side)
- ✅ All destructive actions require admin privileges

---

## Next Steps

1. **Customize email templates**: Supabase → Authentication → Email Templates
2. **Set up custom domain**: Configure CNAME for GitHub Pages
3. **Monitor usage**: Supabase → Logs & Analytics
4. **Backup database**: Set up daily backups in Supabase settings
5. **Rate limiting**: Consider adding rate limits to Edge Function

---

## Support

If you encounter issues:
1. Check Supabase Logs: Dashboard → Logs → Postgres / Edge Functions
2. Check browser console for JavaScript errors
3. Verify auth state: `window.storage.getCurrentUser()`
4. Test RPC functions directly in SQL Editor

---

**Deployment Complete! 🚀**

Your invite-only booking system is now live with enterprise-grade security.
