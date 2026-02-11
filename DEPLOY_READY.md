# ✅ Deployment Ready

This project has been cleaned and is ready to deploy as a static site.

## Recent Changes

### Password Reset Loop Fix (2026-02-11)
- **assets/js/app.js**: Fixed infinite password change loop
  - Added `markPasswordChanged()` call in recovery flow
  - Users no longer forced to change password twice

### Invite System Implementation (2026-02-11)
**NEW: Proper invite-only signup with Supabase**

**Files Added:**
- ✅ `auth.html` - Auth landing page for invites/recovery
- ✅ `assets/js/auth-handler.js` - Token exchange and password setup
- ✅ `supabase/functions/admin-invite-user/index.ts` - Server-side invite Edge Function
- ✅ `supabase/functions/admin-invite-user/README.md` - Edge Function docs

**Files Modified:**
- ✅ `assets/js/admin.js` - Replaced temp password flow with Edge Function invites
  - Removed `generateTempPassword()` and `showCredentialsDialog()`
  - Updated `handleInviteUserInline()` to call Edge Function
  - Changed button text from "Create User" to "Send Invite"
- ✅ `DEPLOY_READY.md` - Added Supabase configuration requirements

**What Changed:**
- **Before:** Admin creates user with temp password, manually sends credentials
- **After:** Admin sends invite email, user sets password via link, no manual steps

**Benefits:**
- ✅ No manual password sharing
- ✅ More secure (no temp passwords)
- ✅ Better UX (one password set, no forced change)
- ✅ Follows Supabase best practices

---

## Pre-Deployment Checklist

Before deploying, ensure you have:

- [ ] Set up Supabase project and run `supabase/setup_fresh.sql`
- [ ] Created your admin user in the `admin_users` table
- [ ] Updated `assets/js/config.js` with your Supabase URL and anon key
- [ ] Updated branding in `assets/js/config.js` (appName, supportEmail, etc.)
- [ ] **Deployed Edge Function** `admin-invite-user` (see below)
- [ ] **Configured Supabase Auth URLs** (Site URL and redirect URLs - see below)
- [ ] Tested invite flow and booking locally
- [ ] Verified admin dashboard access

---

## Supabase Configuration (REQUIRED)

### Step 1: Deploy Edge Function

The invite system requires a server-side Edge Function.

**Install Supabase CLI:**
```bash
npm install -g supabase
```

**Login and link to your project:**
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

**Deploy the function:**
```bash
cd supabase/functions
supabase functions deploy admin-invite-user
```

**Verify deployment:**
```bash
supabase functions list
```

You should see `admin-invite-user` with status "Active".

---

### Step 2: Configure Auth URLs

**Go to:** Supabase Dashboard → Authentication → URL Configuration

**Set these values:**

1. **Site URL:**
   - Production: `https://your-domain.com`
   - Development: `http://localhost:5500` (or your local dev server)

2. **Redirect URLs (Add all of these):**
   ```
   https://your-domain.com/**
   https://your-domain.com/auth.html
   http://localhost:5500/**
   http://localhost:5500/auth.html
   ```

3. **Email Template Redirect URLs:**
   - Go to: Authentication → Email Templates
   - Click on **"Invite user"** template
   - Ensure redirect URL is: `{{ .SiteURL }}/auth.html`
   - Click on **"Reset Password"** template  
   - Ensure redirect URL is: `{{ .SiteURL }}/auth.html`

**Why this matters:**
- Users receive invite/recovery emails with links to `auth.html`
- After setting password, they're redirected to `index.html`
- Without correct URLs, invite links won't work

---

### Step 3: Test the Invite Flow

1. Deploy your Edge Function (step 1)
2. Configure Auth URLs (step 2)
3. Log in to admin dashboard
4. Go to Invites tab
5. Enter a test email and click "Send Invite"
6. Check test email inbox for invite email
7. Click invite link → should land on `auth.html`
8. Set password → should redirect to `index.html`

---

## Deploy to Netlify (Drag & Drop)

### Step 1: Prepare the Folder
Your entire project folder is ready to deploy as-is. All files in this directory:
```
booking-mvpv1/
├── index.html
├── admin.html
├── assets/
├── docs/
└── supabase/
```

### Step 2: Deploy to Netlify
1. **Go to:** https://app.netlify.com/drop
2. **Drag and drop** the entire `booking-mvpv1` folder into the drop zone
3. **Wait** for upload to complete (usually 10-30 seconds)
4. **Done!** Netlify will give you a URL like `https://random-name-123.netlify.app`

### Step 3: Custom Domain (Optional)
1. In Netlify dashboard, click **Domain settings**
2. Click **Add custom domain**
3. Follow instructions to point your domain to Netlify

### Alternative: Deploy via GitHub
1. Push this folder to a GitHub repository
2. In Netlify dashboard, click **Import from Git**
3. Select your repository
4. Build settings: Leave empty (no build needed!)
5. Publish directory: `/` (root)
6. Click **Deploy**

---

## Deploy to Vercel

1. **Go to:** https://vercel.com/new
2. **Import your GitHub repository** (or drag & drop folder)
3. **Framework preset:** Select "Other"
4. **Build command:** Leave empty
5. **Output directory:** `.` (current directory)
6. Click **Deploy**

---

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository
2. Go to repository **Settings** → **Pages**
3. **Source:** Select "Deploy from a branch"
4. **Branch:** Select `main` and folder `/ (root)`
5. Click **Save**
6. Your site will be live at `https://yourusername.github.io/repo-name`

---

## Testing After Deployment

### 1. Test Public Site
- Visit your deployed URL
- Try logging in with a test user account
- View the calendar and request a booking
- Verify "My Bookings" shows your request

### 2. Test Admin Dashboard
- Visit `your-url.com/admin.html`
- Log in with your admin account
- Check all 4 tabs: Invites, Profiles, Bookings, Settings
- Approve/decline a test booking

### 3. Common Issues

**"Configuration error" on page load**
- You forgot to update `assets/js/config.js` with your Supabase credentials

**"Failed to send invite" error**
- Edge Function not deployed: Run `supabase functions deploy admin-invite-user`
- Edge Function not accessible: Check function logs in Supabase dashboard
- Not an admin: Your user_id must be in `admin_users` table

**Invite email not received**
- Check spam/junk folder
- Verify email address is correct
- Check Supabase → Authentication → Email Templates → Rate Limits
- View Supabase → Authentication → Logs for delivery status

**Invite link shows "Invalid Link" error**
- Link expired (default: 24 hours) - send new invite
- Redirect URLs not configured in Supabase (see setup above)
- Site URL mismatch (development vs production URL)

**Login fails with "Invalid credentials"**
- Check that the user's email is in the `allowed_users` table
- Verify the account exists in Supabase Auth
- User must have clicked invite link and set password

**"Admin access required" after login**
- Your user_id is not in the `admin_users` table
- Run: `INSERT INTO admin_users (user_id) VALUES ('your-user-id');`

---

## Security Notes

✅ **Safe to deploy:**
- `anonKey` is safe to expose in client-side code
- Row Level Security (RLS) policies protect your data
- All admin operations require authentication + admin_users entry

⚠️ **Never commit:**
- Service role keys (only used server-side in Edge Functions)
- Private environment files
- `.env` files with credentials

🔒 **Recommended:**
- Enable Supabase's email rate limiting
- Monitor authentication logs
- Regularly backup your database

---

## Support

- **Documentation:** See `README.md` for full project overview
- **Deployment Guide:** See `docs/DEPLOYMENT.md` for detailed setup
- **Test Plan:** See `TEST_PLAN.md` for testing scenarios

---

**Last updated:** 2026-02-11  
**Status:** ✅ Production Ready (with invite system)

---

## Quick Start Summary

1. **Database:** Run `supabase/setup_fresh.sql`
2. **Admin User:** Add your user_id to `admin_users` table
3. **Edge Function:** Deploy `admin-invite-user` via Supabase CLI
4. **Auth URLs:** Configure Site URL and Redirect URLs in Supabase
5. **Frontend Config:** Update `assets/js/config.js` with your credentials
6. **Deploy:** Upload to Netlify/Vercel/any static host
7. **Test:** Send invite, set password, log in, book session
