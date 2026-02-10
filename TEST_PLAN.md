# Studio94 Booking System - Test Plan

## Comprehensive test plan for password-based authentication

---

## Test Categories

1. [Authentication & Authorization](#1-authentication--authorization)
2. [User Management](#2-user-management)
3. [Booking Creation (Server Validation)](#3-booking-creation-server-validation)
4. [Booking Approval](#4-booking-approval)
5. [Admin Functions](#5-admin-functions)
6. [Edge Cases](#6-edge-cases)
7. [Security Tests](#7-security-tests)

---

## 1. Authentication & Authorization

### Test 1.1: Non-Invited User Cannot Log In
**Objective**: Verify non-invited users cannot access the system

**Steps**:
1. Open public site
2. Enter email that is NOT in `allowed_users`: `hacker@evil.com`
3. Enter any password
4. Click "Login"

**Expected Result**:
- ✅ Error message: "Invalid email or password"
- ✅ User cannot access the system

**Verification**:
```sql
-- Email should NOT be in allowed_users
SELECT * FROM allowed_users WHERE email = 'hacker@evil.com';
-- Returns 0 rows
```

---

### Test 1.2: Invited User Can Log In
**Objective**: Verify invited users can log in with correct password

**Steps**:
1. Admin creates user with email: `test@example.com`
2. Admin provides temporary password to user
3. User enters email and temporary password
4. Click "Login"

**Expected Result**:
- ✅ User prompted to change password
- ✅ After changing password, user sees calendar
- ✅ Session persists across page refreshes

**Verification**:
```sql
-- User should be in allowed_users and auth.users
SELECT * FROM allowed_users WHERE email = 'test@example.com';
SELECT * FROM auth.users WHERE email = 'test@example.com';
```

---

### Test 1.3: Non-Admin Cannot Access Admin Dashboard
**Objective**: Verify admin page blocks non-admin users

**Steps**:
1. Log in as regular user (not in `admin_users`)
2. Navigate to `/admin.html`

**Expected Result**:
- ✅ Admin login screen shown
- ✅ Cannot access dashboard
- ✅ Message: "Admin Access Required"

**Verification**:
```sql
-- User should NOT be in admin_users
SELECT * FROM admin_users WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'test@example.com'
);
-- Returns 0 rows
```

---

### Test 1.4: Admin Can Access Dashboard
**Objective**: Verify admins can access dashboard

**Steps**:
1. Log in with admin credentials
2. Navigate to `/admin.html`

**Expected Result**:
- ✅ Dashboard loads with 4 tabs
- ✅ Can view all sections
- ✅ User bar shows admin email

**Verification**:
```sql
-- Admin should be in admin_users
SELECT * FROM admin_users;
-- Should show your user_id
```

---

## 2. User Management

### Test 2.1: Admin Can Create New User
**Objective**: Verify user creation workflow

**Steps**:
1. Admin → Invites tab
2. Click "+ Invite User"
3. Enter email: `newuser@example.com`
4. Click "Create User"

**Expected Result**:
- ✅ Success dialog shows temporary password
- ✅ User appears in allowed_users table
- ✅ User account created in auth.users
- ✅ Password can be copied to clipboard

**Verification**:
```sql
SELECT * FROM allowed_users WHERE email = 'newuser@example.com';
SELECT * FROM auth.users WHERE email = 'newuser@example.com';
```

---

### Test 2.2: Admin Can Remove User
**Objective**: Verify user removal workflow

**Steps**:
1. Admin → Invites tab
2. Click "Remove" on a user
3. Confirm removal

**Expected Result**:
- ✅ User removed from allowed_users table
- ✅ User cannot log in anymore
- ✅ Confirmation toast shown

---

### Test 2.3: First-Time Login Requires Password Change
**Objective**: Verify mandatory password change on first login

**Steps**:
1. Log in with temporary password
2. System detects first login

**Expected Result**:
- ✅ Password change form shown automatically
- ✅ Cannot close without changing password
- ✅ New password must be 8+ characters
- ✅ After changing, normal interface loads

---

## 3. Booking Creation (Server Validation)

### Test 3.1: Valid Booking Request
**Objective**: Verify server accepts valid bookings

**Steps**:
1. Log in as regular user
2. Click tomorrow's 10:00 AM slot
3. Select duration: 2 hours
4. Add note: "Test booking"
5. Submit

**Expected Result**:
- ✅ Toast: "Booking request submitted!"
- ✅ Booking appears in "My Bookings" (pending)
- ✅ Admin sees booking in Bookings tab

**Verification**:
```sql
SELECT * FROM bookings WHERE user_notes = 'Test booking';
```

---

### Test 3.2: Conflict Detection (30-min Buffer)
**Objective**: Verify server rejects conflicting bookings

**Steps**:
1. Admin approves booking: Tomorrow 10:00-12:00
2. User tries to book: Tomorrow 11:00-13:00

**Expected Result**:
- ✅ Error: "Booking conflicts with existing booking (including 30-minute buffer)"
- ✅ Booking NOT created
- ✅ User can try different slot

**Verification**:
```sql
-- Should only show first booking
SELECT * FROM bookings WHERE DATE(start_time) = CURRENT_DATE + 1;
```

---

### Test 3.3: Duration Validation
**Objective**: Verify server enforces duration rules

**Steps**:
1. Via RPC, try to book 30 minutes:
   ```javascript
   await window.supabaseClient.rpc('request_booking', {
     p_start: '2026-02-11T10:00:00Z',
     p_end: '2026-02-11T10:30:00Z'
   });
   ```

**Expected Result**:
- ✅ Error: "Booking must be at least 1 hour"

---

### Test 3.4: Weekly Limit (Subscribed Users)
**Objective**: Verify weekly booking limits enforced

**Steps**:
1. Admin → Profiles → Edit user → Set to "Subscribed"
2. Admin approves 1 booking this week
3. User tries to book another slot this week

**Expected Result**:
- ✅ Error: "Weekly booking limit reached (subscribed users: 1 per week)"
- ✅ Booking NOT created

**Verification**:
```sql
-- Check user membership
SELECT membership, weekly_limit FROM profiles WHERE email = 'test@example.com';
```

---

## 4. Booking Approval

### Test 4.1: Admin Can Approve Booking
**Objective**: Verify booking approval workflow

**Steps**:
1. User creates booking (pending)
2. Admin → Bookings tab
3. Click "Approve" on booking

**Expected Result**:
- ✅ Status changes to "approved"
- ✅ Success toast shown
- ✅ User sees approved booking in calendar

---

### Test 4.2: Admin Cannot Approve Conflicting Booking
**Objective**: Verify server prevents conflicting approvals

**Steps**:
1. User A books: Tomorrow 10:00-12:00
2. User B books: Tomorrow 11:00-13:00
3. Admin approves User A booking
4. Admin tries to approve User B booking

**Expected Result**:
- ✅ Error: "Cannot approve: conflicts with existing approved booking"
- ✅ User B booking remains pending

---

### Test 4.3: Admin Can Decline Booking
**Objective**: Verify booking decline workflow

**Steps**:
1. Admin → Bookings tab
2. Click "Decline" on pending booking
3. Enter reason: "Facility maintenance"

**Expected Result**:
- ✅ Status changes to "declined"
- ✅ Admin notes saved
- ✅ User sees declined status

---

## 5. Admin Functions

### Test 5.1: Admin Can Edit User Profiles
**Objective**: Verify profile management

**Steps**:
1. Admin → Profiles tab
2. Click "Edit" on a user
3. Change name to "John Doe"
4. Change membership to "Subscribed"
5. Save

**Expected Result**:
- ✅ Profile updated in database
- ✅ Changes reflected immediately

---

### Test 5.2: Admin Can Update Settings
**Objective**: Verify system settings management

**Steps**:
1. Admin → Settings tab
2. Change business hours: 08:00 - 18:00
3. Change buffer: 45 minutes
4. Save

**Expected Result**:
- ✅ Settings saved to database
- ✅ Calendar reflects new hours
- ✅ New bookings use new buffer

---

## 6. Edge Cases

### Test 6.1: User Cannot Cancel Approved Booking
**Objective**: Verify users can only cancel pending bookings

**Steps**:
1. Admin approves user's booking
2. User views "My Bookings"

**Expected Result**:
- ✅ NO "Cancel" button for approved bookings
- ✅ Only pending bookings show "Cancel"

---

### Test 6.2: User Cannot View Past Weeks
**Objective**: Verify past date restriction for users

**Steps**:
1. As regular user, click "Previous Week"

**Expected Result**:
- ✅ Toast: "Cannot view past weeks"
- ✅ Calendar stays on current week

---

### Test 6.3: Admin Can View All Weeks
**Objective**: Verify admins have no date restrictions

**Steps**:
1. As admin, navigate to past weeks
2. View past bookings

**Expected Result**:
- ✅ Can navigate freely
- ✅ See all historical bookings

---

## 7. Security Tests

### Test 7.1: RLS - User Cannot See Others' Bookings
**Objective**: Verify Row Level Security on bookings

**Steps**:
1. Log in as User A
2. Open browser console (F12)
3. Run:
   ```javascript
   const { data } = await window.supabaseClient
     .from('bookings')
     .select('*');
   console.log(data);
   ```

**Expected Result**:
- ✅ Only User A's bookings returned
- ✅ Other users' bookings NOT visible

---

### Test 7.2: RLS - Non-Admin Cannot Call Admin RPC
**Objective**: Verify admin function protection

**Steps**:
1. Log in as regular user
2. Open browser console
3. Try to approve booking:
   ```javascript
   await window.supabaseClient.rpc('admin_set_booking_status', {
     p_booking_id: 'some-uuid',
     p_status: 'approved'
   });
   ```

**Expected Result**:
- ✅ Error: "Admin access required"
- ✅ Booking status NOT changed

---

### Test 7.3: Password Security
**Objective**: Verify password requirements

**Steps**:
1. Try to set password < 8 characters
2. Try to set very weak password

**Expected Result**:
- ✅ Error: "Password must be at least 8 characters"
- ✅ Password stored securely (bcrypt)

---

### Test 7.4: Session Persistence
**Objective**: Verify auth session management

**Steps**:
1. Log in
2. Refresh page
3. Close browser, reopen site

**Expected Result**:
- ✅ Session persists across page refreshes
- ✅ Session persists across browser restarts
- ✅ Can log out successfully

---

## Summary

**Total Tests**: 25+

**Critical Tests**:
- ✅ Non-invited users cannot log in
- ✅ Password authentication works
- ✅ First-login password change enforced
- ✅ Admin access restricted properly
- ✅ Booking rules enforced server-side
- ✅ RLS policies prevent unauthorized access
- ✅ Weekly limits enforced

**All tests must pass before production deployment.**

---

## Test Execution

Run tests in order:
1. Authentication tests first
2. User management tests
3. Booking tests
4. Admin tests
5. Security tests last

**Estimated Time**: 2-3 hours for complete test suite

---

**End of Test Plan**
