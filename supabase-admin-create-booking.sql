-- ============================================================
-- ADMIN CREATE BOOKING RPC
-- Lets admins create one-off bookings without a user account
-- Run this in Supabase SQL Editor after main migration
-- ============================================================

CREATE OR REPLACE FUNCTION admin_create_booking(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_user_email TEXT DEFAULT 'Walk-in',
  p_user_notes TEXT DEFAULT NULL,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_duration_minutes INT;
  v_conflicting_bookings INT;
  v_booking_id UUID;
BEGIN
  -- 1. Check if user is admin
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- 2. Validate duration
  v_duration_minutes := EXTRACT(EPOCH FROM (p_end - p_start)) / 60;
  
  IF v_duration_minutes < 60 THEN
    RAISE EXCEPTION 'Booking must be at least 1 hour';
  END IF;

  IF v_duration_minutes > 720 THEN
    RAISE EXCEPTION 'Booking cannot exceed 12 hours';
  END IF;

  IF v_duration_minutes % 30 != 0 THEN
    RAISE EXCEPTION 'Booking duration must be a multiple of 30 minutes';
  END IF;

  -- 3. Check for conflicts with buffer (30 minutes before/after)
  SELECT COUNT(*) INTO v_conflicting_bookings
  FROM bookings
  WHERE status = 'approved'
    AND (
      (p_start >= start_time - INTERVAL '30 minutes' AND p_start < end_time + INTERVAL '30 minutes')
      OR
      (p_end > start_time - INTERVAL '30 minutes' AND p_end <= end_time + INTERVAL '30 minutes')
      OR
      (p_start <= start_time - INTERVAL '30 minutes' AND p_end >= end_time + INTERVAL '30 minutes')
    );

  IF v_conflicting_bookings > 0 THEN
    RAISE EXCEPTION 'Booking conflicts with existing approved booking (including 30-minute buffer)';
  END IF;

  -- 4. Insert as approved (admin-created bookings are auto-approved)
  INSERT INTO bookings (
    user_id,
    user_email,
    start_time,
    end_time,
    duration_minutes,
    status,
    user_notes,
    admin_notes
  ) VALUES (
    v_user_id,
    COALESCE(NULLIF(TRIM(p_user_email), ''), 'Walk-in'),
    p_start,
    p_end,
    v_duration_minutes,
    'approved',
    p_user_notes,
    p_admin_notes
  ) RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
