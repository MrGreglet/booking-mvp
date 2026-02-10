# Studio94 Booking System - Deployment Guide

## Complete setup guide for invite-only password-based auth system

---

## Overview

This system uses:
- **Supabase Auth** for password authentication
- **Invite-only access** via user creation
- **Row Level Security (RLS)** for data protection
- **Server-side validation** via Postgres functions

---

## Prerequisites

1. **Supabase Account** (free tier is sufficient)
2. **GitHub Account** (for GitHub Pages hosting)

---

## Part 1: Database Setup

### Step 1: Run Migration SQL

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the entire contents of `supabase-auth-migration.sql`
4. Paste into SQL Editor
5. Click **Run**

This will create:
- ✅ `allowed_users` table (user allowlist)
- ✅ `admin_users` table (admin privileges)
- ✅ `profiles` table (user data)
- ✅ `bookings` table (with auth integration)
- ✅ `settings` table
- ✅ RLS policies (all tables secured)
- ✅ Postgres functions (request_booking, admin_set_booking_status, etc.)

### Step 2: Configure Auth Settings

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider
3. **Disable** "Confirm email" (we're controlling access via user creation)
4. **Enable** "Auto Confirm" for new users

### Step 3: Create Your Admin Account

1. **Create admin user in Supabase Dashboard**:
   - Go to **Authentication** → **Users**
   - Click **Add User**
   - Enter your email address
   - Create a strong password
   - Enable **Auto Confirm User**
   - Click **Create User**

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

## Part 2: Frontend Configuration

### Step 4: Update Supabase Config

File: `assets/js/supabase-config.js`

**IMPORTANT**: Replace the placeholder values with your own Supabase project credentials!

```javascript
const SUPABASE_URL = 'https://your-project-ref.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

**Where to find these values:**
1. Supabase Dashboard → Settings → API
2. **Project URL** → Copy the URL
3. **anon / public key** → Copy the anon key (this is safe to expose)

⚠️ **NEVER use the service_role key in frontend code!**

---

## Part 3: GitHub Pages Deployment

### Step 5: Update .gitignore

Ensure these are NOT committed:
```
.env
.env.local
**/service-role-key*
.secrets
```

### Step 6: Commit and Push

```bash
git add .
git commit -m "Deploy password-based booking system"
git push origin main
```

### Step 7: Enable GitHub Pages

1. Go to your GitHub repository
2. Settings → Pages
3. Source: **main** branch
4. Folder: **/ (root)**
5. Click **Save**

Site will be live at: `https://your-username.github.io/your-repo-name/`

---

## Part 4: Testing & Verification

### Test 1: Admin Login

1. Go to `https://your-site.com/admin.html`
2. Enter your admin email and password
3. Click "Login"
4. Should see admin dashboard with 4 tabs:
   - Invites
   - Profiles
   - Bookings
   - Settings

✅ **PASS**: Dashboard loads and you can see all tabs
❌ **FAIL**: If you see "Admin Access Required" → check admin_users table

### Test 2: Create New User

1. In admin dashboard → **Invites** tab
2. Click "+ Invite User"
3. Enter test email (e.g., `test@example.com`)
4. Click "Create User"
5. Copy the temporary password shown in the dialog
6. Check `allowed_users` table in Supabase:
   ```sql
   SELECT * FROM allowed_users WHERE email = 'test@example.com';
   ```

✅ **PASS**: Email appears in table and user exists in auth.users
❌ **FAIL**: Check admin status and Supabase logs

### Test 3: User Login (Invited Email)

1. Open public site: `https://your-site.com/`
2. Enter the created email and temporary password
3. Click "Login"
4. Should be prompted to change password
5. Set new password
6. Should see calendar with login confirmation

✅ **PASS**: User can log in and change password
❌ **FAIL**: Check allowed_users table and auth.users

### Test 4: User Login (NON-Invited Email)

1. Open public site
2. Enter random email (e.g., `hacker@evil.com`)
3. Enter any password
4. Click "Login"
5. Should see error: "Invalid email or password"

✅ **PASS**: Login rejected
❌ **FAIL**: If user can log in without being created → check RLS policies

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
3. Log in on mobile (same email and password)
4. Should see booking immediately

✅ **PASS**: Data syncs via Supabase

---

## Troubleshooting

### Issue: "Invalid login credentials"
**Solution**: 
1. Verify user exists: Supabase → Authentication → Users
2. Check if email is in allowed_users table
3. Ensure password is correct
4. Try resetting password via Supabase dashboard

### Issue: "Admin access required" after login
**Solution**: 
```sql
-- Check admin_users table
SELECT * FROM admin_users WHERE user_id = 'your-user-id';

-- If missing, add yourself
INSERT INTO admin_users (user_id) VALUES ('your-user-id');
```

### Issue: User can't log in
**Solution**:
1. Admin must create user via Invites tab
2. Check auth.users table for user account
3. Verify email is in allowed_users table

### Issue: "Email not invited" error during booking
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

### Issue: First-time password change not working
**Solution**:
1. Check browser console for errors
2. Verify password meets minimum requirements (8 characters)
3. Check Supabase logs for auth errors

---

## Security Checklist

- ✅ RLS enabled on all tables
- ✅ Email confirmation disabled (access controlled by admin)
- ✅ Auto-confirm enabled for new users
- ✅ Booking validation on server (RPC functions)
- ✅ Admin status checked via database (not client-side)
- ✅ All destructive actions require admin privileges
- ✅ Passwords stored securely (bcrypt via Supabase Auth)
- ✅ First-login password change enforced

---

## Next Steps

1. **Customize branding**: Update colors and logo in CSS
2. **Set up custom domain**: Configure CNAME for GitHub Pages
3. **Monitor usage**: Supabase → Logs & Analytics
4. **Backup database**: Set up daily backups in Supabase settings
5. **Configure email templates**: Supabase → Authentication → Email Templates

---

## Support

If you encounter issues:
1. Check Supabase Logs: Dashboard → Logs → Postgres
2. Check browser console for JavaScript errors
3. Verify auth state: `window.storage.getCurrentUser()`
4. Test RPC functions directly in SQL Editor

---

## Creating Additional Users

As an admin, you can create new users:

1. Go to admin dashboard (`/admin.html`)
2. Navigate to **Invites** tab
3. Click **+ Invite User**
4. Enter user's email address
5. Click **Create User**
6. **IMPORTANT**: Copy the temporary password displayed
7. Send credentials to the user via secure channel
8. User must change password on first login

---

**Deployment Complete! 🚀**

Your invite-only booking system is now live with secure password authentication.
