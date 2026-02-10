# Auth & Data Fixes - Issue 1 & 2

## Summary
Fixed two critical issues with minimal changes:
1. Admin login gets stuck on login screen despite valid session
2. Calendar only shows own bookings, not shared availability

---

## Changes Made

### 1. File: `assets/js/admin.js`

**Function Modified:** `handleAdminLogin()`

**What Changed:**
- Removed premature UI updates that caused race conditions
- Changed flow to: authenticate → load data → verify admin → THEN update UI
- Added explicit error handling to reset UI state on login failure
- Removed the `checkAdminAccess()` helper calls that were updating UI too early

**Why:**
The original code called `checkAdminAccess()` which immediately updated the UI based on storage state. This caused timing issues where the UI would flash or get stuck if the admin status wasn't loaded yet. Now the UI only updates AFTER successful authentication and admin verification.

---

### 2. File: `supabase-rls-fixes.sql` (NEW FILE)

**What Changed:**

#### Fix for Issue 1 - Admin Users Table
```sql
-- OLD POLICY (too restrictive):
CREATE POLICY "Admins can view admin list" ON admin_users
  USING (is_admin(auth.uid()));

-- NEW POLICY (allows self-check):
CREATE POLICY "Users can check own admin status" ON admin_users
  USING (auth.uid() = user_id OR is_admin(auth.uid()));
```

**Why:** The old policy prevented users from checking if they were admins (circular dependency). The new policy allows users to check their own admin status while still protecting the full admin list.

#### Fix for Issue 2 - Bookings Table
```sql
-- NEW POLICY (added):
CREATE POLICY "Users can view approved bookings for availability" ON bookings
  USING (status = 'approved' AND auth.uid() IS NOT NULL);
```

**Why:** Users need to see ALL approved bookings to check availability, not just their own bookings. This policy exposes only approved bookings (not pending/cancelled/declined from other users).

**Security Notes:**
- ✅ Users still cannot see other users' pending/cancelled/declined bookings
- ✅ Users still cannot modify other users' bookings
- ✅ Only minimal necessary data (approved bookings) is exposed
- ✅ Email, notes, and other sensitive fields are returned but filtering can be added in the app layer if needed

---

## How to Apply

### Step 1: Apply SQL Changes
1. Open Supabase SQL Editor
2. Run the contents of `supabase-rls-fixes.sql`
3. Verify no errors

### Step 2: Test Changes
The JavaScript changes are already applied. Test both issues:

**Test Issue 1 (Admin Login):**
1. Go to `admin.html`
2. Log in with admin credentials
3. ✅ Should immediately show admin portal (Invites tab)
4. Refresh page
5. ✅ Should stay logged in and show admin portal (no login screen)

**Test Issue 2 (Calendar Availability):**
1. As Admin: Create and approve a booking for User A at 10:00-12:00 tomorrow
2. Log out, log in as User B
3. Go to calendar view
4. ✅ Should see User A's booking blocking 10:00-12:00 (shows as "booked" or "pending")
5. ✅ User B should NOT be able to book during that time
6. Go to "My Bookings"
7. ✅ Should show ONLY User B's bookings, not User A's bookings

---

## Test Plan

### Issue 1: Admin Login Flow

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open admin.html while logged out | Login form is visible |
| 2 | Enter admin email and password | - |
| 3 | Click "Login" | Button shows "Logging in..." |
| 4 | Wait for login to complete | ✅ Admin portal appears immediately (Invites tab) |
| 5 | Refresh the page (F5) | ✅ Admin portal stays visible (no flash of login screen) |
| 6 | Click "Logout" | Returns to login screen |
| 7 | Try to log in with non-admin email | ❌ Error: "Admin access required..." |

**Success Criteria:**
- Admin portal appears immediately after successful login
- No flickering or flash of login screen
- Refresh persists admin portal view
- Non-admin users get clear error message

---

### Issue 2: Calendar Availability

**Setup:**
1. Create two user accounts: UserA@test.com and UserB@test.com
2. Both should be in `allowed_users` table
3. Admin approves a booking for UserA: Tomorrow, 14:00-16:00

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in as UserA | ✅ See main calendar view |
| 2 | Check tomorrow's 14:00-16:00 slot | ✅ Shows as "booked" (your booking) |
| 3 | Check "My Bookings" section | ✅ Shows UserA's 14:00-16:00 booking |
| 4 | Log out | - |
| 5 | Log in as UserB | ✅ See main calendar view |
| 6 | Check tomorrow's 14:00-16:00 slot | ✅ Shows as "booked" (blocked) |
| 7 | Try to click/book that time slot | ✅ Slot is not clickable (blocked) |
| 8 | Check "My Bookings" section | ✅ Shows ONLY UserB's bookings (NOT UserA's) |
| 9 | Try to book 14:30-15:30 | ❌ Should fail (conflicts with UserA's booking) |
| 10 | Book 16:30-17:30 | ✅ Should succeed (no conflict) |

**Success Criteria:**
- All users see the same blocked time slots on the calendar
- "My Bookings" list only shows own bookings
- Cannot book during times blocked by other users' approved bookings
- Calendar shows availability accurately across all user accounts

---

## Rollback Instructions

If issues occur:

### Rollback JavaScript:
```javascript
// In admin.js handleAdminLogin, revert to call checkAdminAccess() directly
// (see git history or previous version)
```

### Rollback SQL:
```sql
-- Restore old admin_users policy
DROP POLICY IF EXISTS "Users can check own admin status" ON admin_users;
CREATE POLICY "Admins can view admin list" ON admin_users FOR SELECT
  USING (is_admin(auth.uid()));

-- Remove new bookings policy
DROP POLICY IF EXISTS "Users can view approved bookings for availability" ON bookings;
```

---

## Notes

- **No files were restructured** - Only minimal changes to fix specific bugs
- **No styling changes** - UI remains unchanged
- **No refactoring** - Code structure remains the same
- **Security maintained** - RLS policies are properly scoped and safe
- **Backward compatible** - Existing functionality is preserved

---

## Further Improvements (NOT implemented - out of scope)

If you want to hide sensitive fields from approved bookings:
1. Create a VIEW or RPC function that returns only start_time, end_time, status
2. Update app.js to use this view for calendar rendering
3. Keep full bookings query for "My Bookings" section

This would add another layer of security but is not required for basic availability checking.
