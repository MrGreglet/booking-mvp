# Booking System – Installation Guide

Quick checklist for installing the system for a new client.

---

## Prerequisites

- **Supabase account** (free tier is sufficient)
- **Static hosting** (GitHub Pages, Netlify, or Vercel)
- **Ability to edit** `config.js` (Supabase credentials and branding)

---

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Choose a region close to your client's location
3. Save the database password (for backups/migrations)

---

## 2. Run Database Setup

### For fresh installations
1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the entire contents of `supabase/setup_fresh.sql`
4. Paste into the SQL Editor
5. Click **Run**

This creates all tables, RLS policies, indexes, and RPC functions.

### For existing installations / updates
1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the entire contents of `supabase/upgrade_safe.sql`
4. Paste into the SQL Editor
5. Click **Run**

This safely updates functions and policies without dropping tables or data.

---

## 3. Configure Authentication

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider
3. **Disable** "Confirm email" (invite-only access)
4. **Enable** "Auto Confirm User" (users created by admin are auto-confirmed)
5. Save changes

---

## 4. Create First Admin User

### 4a. Create the user account
1. Go to **Authentication** → **Users**
2. Click **Add User**
3. Enter your email address
4. Set a strong password
5. Enable **Auto Confirm User**
6. Click **Create User**

### 4b. Get your user ID
1. Go to **SQL Editor**
2. Run:
   ```sql
   SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';
   ```
3. Copy your `id` (UUID)

### 4c. Grant admin privileges
1. In SQL Editor, run:
   ```sql
   INSERT INTO admin_users (user_id) VALUES ('paste-your-user-id-here');
   INSERT INTO allowed_users (email) VALUES ('your-email@example.com');
   ```

---

## 5. Configure Frontend

### 5a. Get Supabase credentials
1. Go to **Settings** → **API**
2. Copy:
   - **Project URL** (e.g. `https://xxx.supabase.co`)
   - **anon public** key

### 5b. Update config.js
File: `assets/js/config.js`

Replace these values:
```javascript
supabase: {
  url: 'https://your-project.supabase.co',  // ← Paste Project URL
  anonKey: 'your-anon-key-here'             // ← Paste anon key
}
```

### 5c. Customize branding (optional)
```javascript
branding: {
  appName: 'Your Business Name',
  appNameAdmin: 'Your Business Admin',
  supportEmail: 'support@yourbusiness.com'
}
```

---

## 6. Deploy Static Site

### Option A: GitHub Pages
1. Push code to GitHub repository
2. Go to **Settings** → **Pages**
3. Source: **main** branch, **/ (root)** folder
4. Click **Save**
5. Site live at: `https://username.github.io/repo-name/`

### Option B: Netlify
1. Connect your GitHub repository
2. Build command: (leave empty)
3. Publish directory: `.` (root)
4. Click **Deploy site**

### Option C: Vercel
1. Import your GitHub repository
2. Framework: **Other**
3. Build command: (leave empty)
4. Output directory: `.` (root)
5. Click **Deploy**

---

## 7. Test Installation

### Test admin access
1. Go to `https://your-site.com/admin.html`
2. Log in with admin email and password
3. Should see admin dashboard with 4 tabs

### Test user creation
1. Admin dashboard → **Invites** tab
2. Enter test email: `test@example.com`
3. Click **Create User**
4. Copy the temporary password displayed
5. Open public site: `https://your-site.com/`
6. Log in with test credentials
7. Should be prompted to change password

### Test booking flow
1. As test user, click an available calendar slot
2. Select duration, add notes
3. Click **Submit Request**
4. Should see "Booking request submitted"
5. In admin dashboard → **Bookings**, approve the request
6. User should see booking status update to "approved"

---

## Troubleshooting

### "Configuration error" on page load
**Fix:** Edit `assets/js/config.js` and set your Supabase URL and anon key.

### "Admin access required" after login
**Fix:** Your user_id is not in the `admin_users` table. Run:
```sql
SELECT id FROM auth.users WHERE email = 'your-email@example.com';
INSERT INTO admin_users (user_id) VALUES ('your-user-id');
```

### User can't log in
**Fix:** Admin must create the user first via the Invites tab.

### RLS policy errors
**Fix:** Verify database setup script ran completely without errors. Check Supabase logs.

---

## Estimated Time

- **Fresh install**: 15–20 minutes
- **Experienced**: 10 minutes

---

## Support

For issues, check:
1. Browser console (F12) for JavaScript errors
2. Supabase Dashboard → Logs for backend errors
3. Verify all SQL scripts ran successfully
