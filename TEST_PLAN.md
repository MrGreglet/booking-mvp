# Studio94 Booking System - Test Plan

## Comprehensive test plan for invite-only magic link auth

---

## Test Categories

1. [Authentication & Authorization](#1-authentication--authorization)
2. [Invite Management](#2-invite-management)
3. [Booking Creation (Server Validation)](#3-booking-creation-server-validation)
4. [Booking Approval](#4-booking-approval)
5. [Admin Functions](#5-admin-functions)
6. [Edge Cases](#6-edge-cases)
7. [Security Tests](#7-security-tests)

---

## 1. Authentication & Authorization

### Test 1.1: Non-Invited Email Cannot Request Magic Link
**Objective**: Verify Edge Function blocks non-invited emails

**Steps**:
1. Open public site: `https://mrgreglet.github.io/booking-mvp/`
2. Enter email that is NOT in `allowed_users`: `hacker@evil.com`
3. Click "Send Login Link"

**Expected Result**:
- ✅ Generic message shown: "If your email is registered, you will receive a login link shortly."
- ✅ NO email is sent
- ✅ User cannot access the system

**Verification**:
```sql
-- Email should NOT be in allowed_users
SELECT * FROM allowed_users WHERE email = 'hacker@evil.com';
-- Returns 0 rows
```

---

### Test 1.2: Invited Email Can Request Magic Link
**Objective**: Verify invited users receive magic links

**Steps**:
1. Ensure test email is in allowlist:
   ```sql
   INSERT INTO allowed_users (email) VALUES ('test@example.com');
   ```
2. Open public site
3. Enter `test@example.com`
4. Click "Send Login Link"

**Expected Result**:
- ✅ Success message: "Check your email!"
- ✅ Email delivered with magic link
- ✅ Link expires in 1 hour

**Verification**:
- Check email inbox
- Click link → should redirect to site with auth token in URL hash

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
SELECT * FROM admin_users WHERE user_id = 'user-uuid';
-- Returns 0 rows
```

---

### Test 1.4: Admin Can Access Admin Dashboard
**Objective**: Verify admin users can access dashboard

**Steps**:
1. Ensure user is in admin_users:
   ```sql
   INSERT INTO admin_users (user_id) VALUES ('admin-user-uuid');
   ```
2. Log in with admin email via magic link
3. Navigate to `/admin.html`

**Expected Result**:
- ✅ Dashboard loads immediately
- ✅ Shows all tabs: Invites, Profiles, Bookings, Settings
- ✅ Pending badge shows count

**Verification**:
```sql
-- User should be in admin_users
SELECT * FROM admin_users WHERE user_id = 'admin-user-uuid';
-- Returns 1 row
```

---

## 2. Invite Management

### Test 2.1: Admin Can Invite New User
**Objective**: Verify invite creation works

**Steps**:
1. Log in as admin
2. Go to Invites tab
3. Click "+ Invite User"
4. Enter email: `newuser@example.com`
5. Click "Send Invite"

**Expected Result**:
- ✅ Toast: "Invited newuser@example.com"
- ✅ Email appears in invites table
- ✅ `invited_by` field set to admin's user_id

**Verification**:
```sql
SELECT * FROM allowed_users WHERE email = 'newuser@example.com';
-- Should return 1 row with invited_by = admin user_id
```

---

### Test 2.2: Admin Can Remove Invite
**Objective**: Verify invite removal works

**Steps**:
1. Log in as admin
2. Go to Invites tab
3. Find user to remove
4. Click "Remove" button
5. Confirm deletion

**Expected Result**:
- ✅ Confirmation dialog shown
- ✅ Toast: "Access removed"
- ✅ Email removed from table
- ✅ User can no longer log in

**Verification**:
```sql
SELECT * FROM allowed_users WHERE email = 'removed-user@example.com';
-- Should return 0 rows
```

---

### Test 2.3: Duplicate Invite is Idempotent
**Objective**: Verify re-inviting same email doesn't cause errors

**Steps**:
1. Invite `test@example.com`
2. Invite `test@example.com` again

**Expected Result**:
- ✅ No error
- ✅ Only 1 row in `allowed_users`
- ✅ `invited_by` remains unchanged (or updates to latest)

**Verification**:
```sql
SELECT COUNT(*) FROM allowed_users WHERE email = 'test@example.com';
-- Should return 1
```

---

## 3. Booking Creation (Server Validation)

### Test 3.1: Valid Booking Request
**Objective**: Verify valid booking is created

**Steps**:
1. Log in as invited user
2. Navigate to future week
3. Click available slot (e.g., Tomorrow 10:00 AM)
4. Select duration: 2 hours
5. Add note: "Test booking"
6. Click "Submit Request"

**Expected Result**:
- ✅ Toast: "Booking request submitted! Waiting for admin approval."
- ✅ Booking created with status='pending'
- ✅ `user_id` and `user_email` set correctly
- ✅ `duration_minutes` = 120

**Verification**:
```sql
SELECT * FROM bookings 
WHERE user_email = 'test@example.com' 
AND status = 'pending'
ORDER BY created_at DESC LIMIT 1;
```

---

### Test 3.2: Buffer Conflict Detection
**Objective**: Verify 30-minute buffer prevents overlapping bookings

**Setup**:
1. Admin approves booking: Tomorrow 10:00-12:00 (approved)

**Steps**:
1. User tries to book: Tomorrow 11:30-13:30

**Expected Result**:
- ❌ Error: "Booking conflicts with existing booking (including 30-minute buffer)"
- ✅ Booking NOT created
- ✅ Toast shows error message

**Verification**:
```sql
-- Only the first booking should exist
SELECT COUNT(*) FROM bookings 
WHERE start_time::date = (CURRENT_DATE + 1)
AND status = 'approved';
-- Should return 1
```

---

### Test 3.3: Buffer Edge Case (30-minute gap)
**Objective**: Verify buffer prevents bookings 30 min before/after

**Setup**:
1. Booking exists: Tomorrow 10:00-12:00 (approved)

**Test Cases**:
| New Booking Start | New Booking End | Expected Result |
|-------------------|-----------------|-----------------|
| 09:30 | 10:00 | ❌ Conflict (within buffer) |
| 12:00 | 14:00 | ❌ Conflict (within buffer) |
| 09:00 | 09:30 | ✅ Success (outside buffer) |
| 12:30 | 14:30 | ✅ Success (outside buffer) |

---

### Test 3.4: Duration Validation
**Objective**: Verify duration rules are enforced

**Test Cases**:
| Duration | Expected Result |
|----------|----------------|
| 30 min   | ❌ Error: "Booking must be at least 1 hour" |
| 1 hour   | ✅ Success |
| 8 hours  | ✅ Success |
| 13 hours | ❌ Error: "Booking cannot exceed 12 hours" |
| 45 min   | ❌ Error: "Booking duration must be a multiple of 30 minutes" |

**Note**: UI only allows 1-8 hours, so manual testing requires direct RPC call.

---

### Test 3.5: Weekly Limit (Subscribed Users)
**Objective**: Verify subscribed users limited to 1 approved booking per week

**Setup**:
1. User profile set to `membership='subscribed'`
2. Admin approves booking for User A: This week Monday 10:00-12:00

**Steps**:
1. User A tries to book another slot this week (e.g., Wednesday 14:00-16:00)

**Expected Result**:
- ❌ Error: "Weekly booking limit reached (subscribed users: 1 per week)"
- ✅ Booking NOT created

**Verification**:
```sql
SELECT COUNT(*) FROM bookings 
WHERE user_id = 'user-a-uuid'
AND status = 'approved'
AND EXTRACT(WEEK FROM start_time) = EXTRACT(WEEK FROM CURRENT_DATE);
-- Should return 1
```

---

### Test 3.6: Non-Invited User Cannot Book (Even if Logged In)
**Objective**: Verify RPC enforces invite check

**Steps**:
1. Manually create user in `auth.users` (bypassing invite system)
2. User logs in via magic link (somehow gets link)
3. User tries to book

**Expected Result**:
- ❌ Error: "Email not invited to use this system"
- ✅ Booking NOT created

**Verification**:
```sql
-- User should NOT be in allowed_users
SELECT * FROM allowed_users WHERE email = 'uninvited@example.com';
-- Returns 0 rows
```

---

## 4. Booking Approval

### Test 4.1: Admin Approves Booking (No Conflicts)
**Objective**: Verify admin can approve valid booking

**Steps**:
1. User creates booking request
2. Admin logs in → Bookings tab
3. Click "Approve" button

**Expected Result**:
- ✅ Toast: "Booking approved"
- ✅ Status changed to 'approved'
- ✅ Booking appears in user's calendar as booked (green)

**Verification**:
```sql
SELECT status FROM bookings WHERE id = 'booking-uuid';
-- Should return 'approved'
```

---

### Test 4.2: Admin Approval Detects Conflicts
**Objective**: Verify server-side conflict check during approval

**Setup**:
1. User A requests: Tomorrow 10:00-12:00 (pending)
2. User B requests: Tomorrow 11:00-13:00 (pending)
3. Admin approves User A booking ✅

**Steps**:
1. Admin tries to approve User B booking

**Expected Result**:
- ❌ Error: "Cannot approve: conflicts with existing approved booking"
- ✅ User B booking remains 'pending'
- ✅ Toast shows error message

**Verification**:
```sql
SELECT status FROM bookings WHERE user_id = 'user-b-uuid';
-- Should still be 'pending'
```

---

### Test 4.3: Admin Declines Booking
**Objective**: Verify decline functionality

**Steps**:
1. Admin clicks "Decline" button
2. Enters reason: "Time not available"
3. Confirms

**Expected Result**:
- ✅ Toast: "Booking declined"
- ✅ Status = 'declined'
- ✅ `admin_notes` = "Time not available"
- ✅ Slot becomes available again

**Verification**:
```sql
SELECT status, admin_notes FROM bookings WHERE id = 'booking-uuid';
-- status = 'declined', admin_notes = 'Time not available'
```

---

### Test 4.4: Admin Cancels Approved Booking
**Objective**: Verify admin can cancel approved bookings

**Steps**:
1. Booking has status='approved'
2. Admin clicks "Cancel" button
3. Enters reason: "Emergency closure"

**Expected Result**:
- ✅ Toast: "Booking cancelled"
- ✅ Status = 'cancelled'
- ✅ Slot becomes available for re-booking

**Verification**:
```sql
SELECT status FROM bookings WHERE id = 'booking-uuid';
-- Should return 'cancelled'
```

---

## 5. Admin Functions

### Test 5.1: Admin Updates Profile
**Objective**: Verify profile editing works

**Steps**:
1. Admin → Profiles tab
2. Click "Edit" on a user
3. Change name: "John Doe"
4. Change membership: "subscribed"
5. Add contract details: "Monthly subscription"
6. Click "Save Changes"

**Expected Result**:
- ✅ Toast: "Profile updated"
- ✅ Changes reflected in table
- ✅ Weekly limit now applies to user

**Verification**:
```sql
SELECT name, membership, contract_details 
FROM profiles 
WHERE user_id = 'user-uuid';
-- Should show updated values
```

---

### Test 5.2: Admin Updates Settings
**Objective**: Verify settings changes work

**Steps**:
1. Admin → Settings tab
2. Change business hours: 08:00 - 18:00
3. Change buffer: 45 minutes
4. Click "Save Settings"

**Expected Result**:
- ✅ Toast: "Settings saved"
- ✅ Changes saved to database
- ✅ New bookings use new settings

**Verification**:
```sql
SELECT * FROM settings WHERE id = 'default';
-- Should show updated values
```

---

### Test 5.3: Admin Deletes Booking
**Objective**: Verify permanent deletion works

**Steps**:
1. Admin → Bookings tab
2. Click "Delete" button
3. Confirm deletion

**Expected Result**:
- ✅ Confirmation dialog with booking details
- ✅ Toast: "Booking deleted"
- ✅ Booking removed from database
- ✅ Cannot be undone

**Verification**:
```sql
SELECT * FROM bookings WHERE id = 'deleted-booking-uuid';
-- Should return 0 rows
```

---

## 6. Edge Cases

### Test 6.1: User Cancels Own Pending Booking
**Objective**: Verify users can cancel their own bookings

**Steps**:
1. User creates booking (pending)
2. User → My Bookings
3. Click "Cancel" button
4. Confirm cancellation

**Expected Result**:
- ✅ Toast: "Booking cancelled"
- ✅ Status = 'cancelled'
- ✅ Slot available for re-booking

---

### Test 6.2: User Cannot Cancel Approved Booking
**Objective**: Verify users can only cancel pending bookings

**Steps**:
1. Admin approves booking
2. User → My Bookings
3. Check for "Cancel" button

**Expected Result**:
- ✅ NO "Cancel" button shown for approved bookings
- ✅ User must contact admin to cancel

---

### Test 6.3: Past Date Prevention (Users)
**Objective**: Verify users cannot view/book past dates

**Steps**:
1. User navigates to current week
2. Click "Previous Week" button

**Expected Result**:
- ❌ Toast: "Cannot view past weeks"
- ✅ Calendar stays on current week
- ✅ User cannot book past slots

---

### Test 6.4: Admin Can View Past Dates
**Objective**: Verify admins can see historical data

**Steps**:
1. Admin → Bookings tab
2. Check if past bookings are visible

**Expected Result**:
- ✅ All bookings shown (past and future)
- ✅ Admin can see full history

---

## 7. Security Tests

### Test 7.1: RLS Blocks Direct Database Access
**Objective**: Verify users cannot bypass RLS via SQL

**Steps**:
1. Log in as User A
2. Try to query User B's bookings via JavaScript console:
   ```javascript
   await window.supabaseClient
     .from('bookings')
     .select('*')
     .eq('user_email', 'user-b@example.com');
   ```

**Expected Result**:
- ✅ Returns empty array or error
- ✅ User A can only see their own bookings

---

### Test 7.2: Non-Admin Cannot Approve Bookings
**Objective**: Verify RPC enforces admin check

**Steps**:
1. Log in as regular user
2. Try to call admin RPC via console:
   ```javascript
   await window.supabaseClient.rpc('admin_set_booking_status', {
     p_booking_id: 'some-uuid',
     p_status: 'approved'
   });
   ```

**Expected Result**:
- ❌ Error: "Admin access required"
- ✅ Booking status unchanged

---

### Test 7.3: Edge Function Validates Allowlist
**Objective**: Verify Edge Function cannot be bypassed

**Steps**:
1. Send direct HTTP request to Edge Function with non-invited email:
   ```bash
   curl -X POST https://qkjcqtsacuspfdslgfxj.supabase.co/functions/v1/request-magic-link \
     -H "Content-Type: application/json" \
     -d '{"email": "hacker@evil.com"}'
   ```

**Expected Result**:
- ✅ Returns 403 with generic message
- ✅ NO email sent
- ✅ Check Edge Function logs for "Magic link request denied"

---

### Test 7.4: Service Role Key Not Exposed
**Objective**: Verify secrets are not in client-side code

**Steps**:
1. View page source
2. Check all JavaScript files
3. Search for "service" or "secret"

**Expected Result**:
- ✅ NO service_role key in any client-side file
- ✅ Only anon key is visible (this is safe)

---

## Test Execution Checklist

Run tests in this order:

1. ✅ Authentication & Authorization (Tests 1.1-1.4)
2. ✅ Invite Management (Tests 2.1-2.3)
3. ✅ Booking Creation (Tests 3.1-3.6)
4. ✅ Booking Approval (Tests 4.1-4.4)
5. ✅ Admin Functions (Tests 5.1-5.3)
6. ✅ Edge Cases (Tests 6.1-6.4)
7. ✅ Security Tests (Tests 7.1-7.4)

---

## Success Criteria

**All tests must pass for production deployment:**

- ✅ Non-invited users cannot log in
- ✅ Invited users can log in via magic link
- ✅ Admins have full dashboard access
- ✅ Non-admins cannot access admin functions
- ✅ Server validates all booking rules (duration, buffer, weekly limit)
- ✅ RLS policies prevent unauthorized data access
- ✅ Edge Function enforces invite-only access
- ✅ No secrets exposed in client-side code

---

**Test Plan Complete! 🧪**

All critical security and functionality scenarios covered.
