# Testing Checklist for Studio94 Booking System

## ✅ Pre-Testing Setup (DO THESE FIRST!)

### 1. Apply Database Migration
- [ ] Go to Supabase SQL Editor
- [ ] Create new query
- [ ] Paste entire contents of `supabase-auth-migration.sql`
- [ ] Run query (should complete in ~10 seconds)

### 2. Set Up Admin Account
- [ ] Create admin user in Supabase Dashboard → Authentication → Users
- [ ] Use your email and a strong password
- [ ] Enable "Auto Confirm User"
- [ ] Get your user ID:
  ```sql
  SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';
  ```
- [ ] Make yourself admin:
  ```sql
  INSERT INTO admin_users (user_id) VALUES ('YOUR_USER_ID_HERE');
  INSERT INTO allowed_users (email) VALUES ('your-email@example.com');
  ```

### 3. Configure Frontend
- [ ] Update `assets/js/supabase-config.js` with your Supabase URL and anon key
- [ ] Deploy to GitHub Pages or test locally

---

## 🧪 Core Functionality Tests

### Test 1: Auth - Non-Invited User Blocked ❌
- [ ] Open site in incognito mode
- [ ] Try to log in with: `hacker@test.com` / any password
- [ ] Should show error: "Invalid email or password"
- [ ] **Expected**: Login denied

### Test 2: Auth - Admin Can Login ✅
- [ ] Open site
- [ ] Navigate to `/admin.html`
- [ ] Enter admin email and password
- [ ] **Expected**: See dashboard with tabs: Invites, Profiles, Bookings, Settings

### Test 3: Create New User
- [ ] Admin → Invites tab
- [ ] Click "+ Invite User"
- [ ] Enter: `test@example.com`
- [ ] Click "Create User"
- [ ] **Expected**: Success dialog with temporary password
- [ ] Copy the temporary password

### Test 4: User First Login & Password Change
- [ ] Log out from admin
- [ ] Log in with test user email and temporary password
- [ ] **Expected**: Prompted to change password
- [ ] Set new password (8+ characters)
- [ ] **Expected**: See calendar interface

### Test 5: Non-Admin Cannot Access Dashboard ❌
- [ ] Log in as test user
- [ ] Try to navigate to `/admin.html`
- [ ] **Expected**: Blocked with "Admin Access Required"

---

## 📅 Booking Flow Tests

### Test 6: Create Booking Request
- [ ] Log in as test user
- [ ] Click on tomorrow's date at 10:00 AM
- [ ] Select duration: 2 hours
- [ ] Add note: "Test booking"
- [ ] Click "Submit Request"
- [ ] **Expected**: "Booking request submitted! Waiting for admin approval"

### Test 7: Admin Approves Booking
- [ ] Log in as admin
- [ ] Go to `admin.html` → Bookings tab
- [ ] See pending booking from Test 6
- [ ] Click "Approve" button
- [ ] **Expected**: Status changes to "approved", success toast

### Test 8: User Sees Approved Booking
- [ ] Log back in as test user
- [ ] Navigate to calendar
- [ ] **Expected**: See booking shown as approved (green/confirmed)
- [ ] Click "My Bookings"
- [ ] **Expected**: Booking listed with "approved" status

---

## 🚫 Validation Tests

### Test 9: Buffer Conflict Detection
- [ ] As test user, try to book tomorrow 11:30-13:30
- [ ] **Expected**: Error - "Booking conflicts with existing booking (including 30-minute buffer)"

### Test 10: Weekly Limit (Subscribed Users)
- [ ] Admin → Profiles tab → Edit test user
- [ ] Set membership to "subscribed"
- [ ] Save changes
- [ ] Test user tries to book another slot this week
- [ ] **Expected**: Error - "Weekly booking limit reached"

---

## 🛡️ Security Tests

### Test 11: RLS - User Cannot See Others' Bookings
- [ ] Create second user: `user2@example.com`
- [ ] Create booking for user2
- [ ] Log in as test user (first user)
- [ ] Open browser console (F12)
- [ ] Run:
  ```javascript
  const { data } = await window.supabaseClient.from('bookings').select('*');
  console.log(data);
  ```
- [ ] **Expected**: Only see own bookings (not user2's)

### Test 12: Non-Admin Cannot Call Admin Functions
- [ ] Log in as test user (non-admin)
- [ ] Open browser console
- [ ] Try to approve a booking:
  ```javascript
  await window.supabaseClient.rpc('admin_set_booking_status', {
    p_booking_id: 'some-uuid',
    p_status: 'approved'
  });
  ```
- [ ] **Expected**: Error - "Admin access required"

---

## ⚙️ Admin Functions

### Test 13: Admin Can Edit Profiles
- [ ] Admin → Profiles tab
- [ ] Click "Edit" on test user
- [ ] Change name to "John Doe"
- [ ] Change membership to "standard"
- [ ] Save changes
- [ ] **Expected**: Profile updated successfully

### Test 14: Admin Can Update Settings
- [ ] Admin → Settings tab
- [ ] Change business hours to 08:00 - 18:00
- [ ] Change buffer to 45 minutes
- [ ] Save settings
- [ ] **Expected**: Settings saved, calendar reflects new hours

### Test 15: Admin Can Remove User
- [ ] Admin → Invites tab
- [ ] Click "Remove" on a test user
- [ ] Confirm removal
- [ ] **Expected**: User removed from allowed_users
- [ ] User can no longer log in

---

## 🎯 Edge Cases

### Test 16: User Cancels Own Pending Booking
- [ ] User creates booking (pending status)
- [ ] User goes to "My Bookings"
- [ ] Clicks "Cancel" on pending booking
- [ ] **Expected**: Status changes to "cancelled"

### Test 17: User Cannot Cancel Approved Booking
- [ ] Admin approves a booking
- [ ] User views "My Bookings"
- [ ] **Expected**: NO "Cancel" button for approved bookings

### Test 18: User Cannot Navigate to Past Weeks
- [ ] As regular user, try clicking "Previous Week"
- [ ] **Expected**: Toast - "Cannot view past weeks"
- [ ] Calendar stays on current/future weeks

---

## ✅ Success Criteria

All tests should pass before going to production:

- ✅ Non-invited users cannot log in
- ✅ Invited users can log in with password
- ✅ First-time users must change password
- ✅ Admins have full dashboard access
- ✅ Non-admins cannot access admin functions
- ✅ Server validates all booking rules
- ✅ RLS policies prevent unauthorized data access
- ✅ Password requirements enforced

---

## 📝 Useful Commands

**SQL Queries:**

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
DELETE FROM bookings WHERE user_notes LIKE '%test%';
```

---

**Ready to test? Start with the Pre-Testing Setup section!** 🚀
