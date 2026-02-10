-- ============================================================
-- RLS POLICY FIXES - Minimal changes for Issue 1 & 2
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- FIX ISSUE 1: Allow users to check their own admin status
-- ============================================================

-- Drop all existing SELECT policies on admin_users (idempotent)
DROP POLICY IF EXISTS "Admins can view admin list" ON admin_users;
DROP POLICY IF EXISTS "Users can check own admin status" ON admin_users;

-- Create new policy: users can view their own row OR view all if admin
-- This allows checkAdminStatus() to work for first-time admin login
CREATE POLICY "Users can check own admin status"
  ON admin_users FOR SELECT
  USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- ============================================================
-- FIX ISSUE 2: Allow users to see approved bookings (availability)
-- ============================================================
-- Root cause: Without this policy, non-admins only see their own bookings
-- (policy "Users can view own bookings"), so the calendar shows slots as free
-- when another user has an approved booking. This policy fixes that.
-- "My bookings" stays correct because the frontend filters by userId.

-- Drop if exists (idempotent)
DROP POLICY IF EXISTS "Users can view approved bookings for availability" ON bookings;

-- Add new policy: all authenticated users can see approved bookings
-- This is SAFE because approved bookings should be visible for availability
-- Users still can't see other users' pending/cancelled/declined bookings
CREATE POLICY "Users can view approved bookings for availability"
  ON bookings FOR SELECT
  USING (status = 'approved' AND auth.uid() IS NOT NULL);

-- Note: The existing "Users can view own bookings" and "Admins can view all bookings"
-- policies remain in place and work together with this new policy.
-- PostgreSQL RLS evaluates policies with OR logic, so a booking is visible if ANY policy allows it.

-- ============================================================
-- VERIFICATION QUERIES (optional - run these to test)
-- ============================================================

-- Check that policies exist:
-- SELECT tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE schemaname = 'public' AND tablename IN ('admin_users', 'bookings')
-- ORDER BY tablename, policyname;
