# Testing Checklist for Studio94 Booking System

## ✅ Pre-Testing Setup (DO THESE FIRST!)

### 1. Apply Database Migration
- [ ] Go to [SQL Editor](https://supabase.com/dashboard/project/qkjcqtsacuspfdslgfxj/editor)
- [ ] Create new query
- [ ] Paste entire contents of `supabase-auth-migration.sql`
- [ ] Run query (should complete in ~10 seconds)

### 2. Set Up Admin Account
- [ ] Add your email to allowlist:
  ```sql
  INSERT INTO allowed_users (email) VALUES ('your-email@example.com');
  ```
- [ ] Open your site and request magic link with your email
- [ ] Click the magic link in your email
- [ ] Get your user ID:
  ```sql
  SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';
  ```
- [ ] Make yourself admin (replace USER_ID):
  ```sql
  INSERT INTO admin_users (user_id) VALUES ('USER_ID_FROM_ABOVE');
  ```

### 3. Deploy Edge Function
- [ ] ✅ Already done! (`request-magic-link` deployed)

---

## 🧪 Core Functionality Tests

### Test 1: Auth - Non-Invited User Blocked ❌
- [ ] Open site in incognito mode
- [ ] Try to log in with: `hacker@test.com`
- [ ] Should show generic message but NOT send email
- [ ] **Expected**: Login denied

### Test 2: Auth - Invited User Can Login ✅
- [ ] Add test email to allowlist:
  ```sql
  INSERT INTO allowed_users (email) VALUES ('test@example.com');
  ```
- [ ] Open site
- [ ] Enter `test@example.com`
- [ ] Check email and click magic link
- [ ] **Expected**: Redirected to site, logged in successfully

### Test 3: Admin Dashboard Access 🔒
- [ ] Log in with your admin email
- [ ] Navigate to `/admin.html`
- [ ] **Expected**: See dashboard with tabs: Invites, Profiles, Bookings, Settings

### Test 4: Non-Admin Cannot Access Dashboard ❌
- [ ] Log in as regular user (`test@example.com`)
- [ ] Try to navigate to `/admin.html`
- [ ] **Expected**: Blocked with "Admin Access Required"

---

## 📅 Booking Flow Tests

### Test 5: Create Booking Request
- [ ] Log in as regular user
- [ ] Click on tomorrow's date at 10:00 AM
- [ ] Select duration: 2 hours
- [ ] Add note: "Test booking"
- [ ] Click "Submit Request"
- [ ] **Expected**: "Booking request submitted! Waiting for admin approval"

### Test 6: Admin Approves Booking
- [ ] Log in as admin
- [ ] Go to `admin.html` → Bookings tab
- [ ] See pending booking from Test 5
- [ ] Click "Approve" button
- [ ] **Expected**: Status changes to "approved", toast shows success

### Test 7: User Sees Approved Booking
- [ ] Log back in as regular user
- [ ] Navigate to calendar
- [ ] **Expected**: See booking shown as approved/confirmed (green)

---

## 🚫 Validation Tests

### Test 8: Buffer Conflict Detection
- [ ] As regular user, try to book tomorrow 11:30-13:30
- [ ] **Expected**: Error - "Booking conflicts with existing booking (including 30-minute buffer)"

### Test 9: Short Duration Rejected
- [ ] Try to book 30 minutes (requires direct RPC call or manual SQL)
- [ ] **Expected**: Error - "Booking must be at least 1 hour"

### Test 10: Weekly Limit (Subscribed Users)
- [ ] Set user to subscribed:
  ```sql
  UPDATE profiles SET membership = 'subscribed' WHERE email = 'test@example.com';
  ```
- [ ] Admin approves one booking this week
- [ ] User tries to book another slot this week
- [ ] **Expected**: Error - "Weekly booking limit reached"

---

## 🛡️ Security Tests

### Test 11: RLS - User Cannot See Others' Bookings
- [ ] Log in as User A
- [ ] Open browser console (F12)
- [ ] Run:
  ```javascript
  await window.supabaseClient
    .from('bookings')
    .select('*');
  ```
- [ ] **Expected**: Only see own bookings (not other users')

### Test 12: RLS - Non-Admin Cannot Approve Bookings
- [ ] Log in as regular user
- [ ] Open browser console
- [ ] Try to approve a booking:
  ```javascript
  await window.supabaseClient.rpc('admin_set_booking_status', {
    p_booking_id: 'some-uuid',
    p_status: 'approved'
  });
  ```
- [ ] **Expected**: Error - "Admin access required"

### Test 13: Edge Function Blocks Non-Invited
- [ ] In browser console or Postman, send:
  ```bash
  curl -X POST https://qkjcqtsacuspfdslgfxj.supabase.co/functions/v1/request-magic-link \
    -H "Content-Type: application/json" \
    -d '{"email": "notallowed@test.com"}'
  ```
- [ ] **Expected**: 403 response, no email sent

---

## ⚙️ Admin Functions

### Test 14: Admin Can Invite Users
- [ ] Admin → Invites tab
- [ ] Click "+ Invite User"
- [ ] Enter: `newuser@example.com`
- [ ] Click "Send Invite"
- [ ] **Expected**: Email appears in invites table

### Test 15: Admin Can Edit Profiles
- [ ] Admin → Profiles tab
- [ ] Click "Edit" on a user
- [ ] Change name to "John Doe"
- [ ] Change membership to "subscribed"
- [ ] Save changes
- [ ] **Expected**: Profile updated in database

### Test 16: Admin Can Update Settings
- [ ] Admin → Settings tab
- [ ] Change business hours to 08:00 - 18:00
- [ ] Save settings
- [ ] **Expected**: Settings saved, new bookings use new hours

---

## 🎯 Edge Cases

### Test 17: User Cancels Own Pending Booking
- [ ] User creates booking (pending status)
- [ ] User clicks "Cancel" on their own booking
- [ ] **Expected**: Status changes to "cancelled"

### Test 18: User Cannot Cancel Approved Booking
- [ ] Admin approves a booking
- [ ] User views their bookings
- [ ] **Expected**: NO "Cancel" button for approved bookings

### Test 19: User Cannot Navigate to Past Weeks
- [ ] As regular user, try clicking "Previous Week"
- [ ] **Expected**: Toast - "Cannot view past weeks"

### Test 20: Admin Can View Past Bookings
- [ ] As admin, go to Bookings tab
- [ ] **Expected**: See all bookings (past and future)

---

## ✅ Success Criteria

All tests should pass before going to production:

- ✅ Non-invited users cannot log in
- ✅ Invited users can log in via magic link
- ✅ Admins have full dashboard access
- ✅ Non-admins cannot access admin functions
- ✅ Server validates all booking rules
- ✅ RLS policies prevent unauthorized data access
- ✅ Edge Function enforces invite-only access
- ✅ No secrets exposed in client-side code

---

## 📝 Notes

**Your Project:**
- Project ID: `qkjcqtsacuspfdslgfxj`
- Project URL: `https://qkjcqtsacuspfdslgfxj.supabase.co`
- Dashboard: https://supabase.com/dashboard/project/qkjcqtsacuspfdslgfxj
- Edge Function: ✅ Deployed

**Useful SQL Queries:**

```sql
-- Check allowed users
SELECT * FROM allowed_users;

-- Check admin users
SELECT * FROM admin_users;

-- Check all bookings
SELECT * FROM bookings ORDER BY created_at DESC;

-- Check profiles
SELECT * FROM profiles;

-- Check auth users
SELECT id, email, created_at FROM auth.users;

-- Remove a test booking
DELETE FROM bookings WHERE id = 'booking-uuid';

-- Reset test data
DELETE FROM bookings;
DELETE FROM profiles WHERE email LIKE '%test%';
```

---

**Ready to test? Start with the Pre-Testing Setup section!** 🚀
