-- ============================================================
-- BOOKING SYSTEM - SAFE UPGRADE/UPDATE SCRIPT
-- Updates functions, policies, and indexes without destroying data
--
-- This script is SAFE to run on production systems with existing data.
-- It will NOT drop tables or delete data.
--
-- RECOMMENDATION: Run during a maintenance window or low traffic period.
-- While this script does not drop tables, policies and triggers will be
-- replaced, which may briefly affect concurrent operations.
--
-- Use this to:
-- - Update RPC functions
-- - Update RLS policies
-- - Add new indexes
-- - Fix triggers
-- ============================================================

-- ============================================================
-- 1. DROP AND RECREATE TRIGGERS (safe - no data loss)
-- ============================================================

DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS update_users_updated_at ON users;
  DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
  DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
  DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================
-- 2. CREATE TABLES (IF NOT EXISTS - safe)
-- ============================================================

-- Allowlist for invited emails
CREATE TABLE IF NOT EXISTS allowed_users (
  email TEXT PRIMARY KEY,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Admin users
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User profiles
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  membership TEXT CHECK (membership IN ('subscribed', 'standard')) DEFAULT 'standard',
  weekly_limit INT DEFAULT 1,
  contract_details TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')) DEFAULT 'pending',
  user_notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Settings (business rules)
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  business_hours_start TEXT NOT NULL DEFAULT '06:00',
  business_hours_end TEXT NOT NULL DEFAULT '24:00',
  buffer_minutes INT NOT NULL DEFAULT 30,
  slot_interval_minutes INT NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default settings (safe - ON CONFLICT does nothing)
INSERT INTO settings (id, business_hours_start, business_hours_end, buffer_minutes, slot_interval_minutes)
VALUES ('default', '06:00', '24:00', 30, 60)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. CREATE INDEXES (IF NOT EXISTS - safe)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_email ON bookings(user_email);
CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON bookings(start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_user_status ON bookings(user_id, status);

-- ============================================================
-- 4. ENABLE ROW LEVEL SECURITY (safe - idempotent)
-- ============================================================

ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. HELPER FUNCTIONS (CREATE OR REPLACE - safe)
-- ============================================================

-- Check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users WHERE admin_users.user_id = $1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if email is invited
CREATE OR REPLACE FUNCTION is_invited(user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM allowed_users WHERE email = $1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get ISO week number
CREATE OR REPLACE FUNCTION get_iso_week(dt TIMESTAMPTZ)
RETURNS INT AS $$
BEGIN
  RETURN EXTRACT(WEEK FROM dt)::INT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get ISO year
CREATE OR REPLACE FUNCTION get_iso_year(dt TIMESTAMPTZ)
RETURNS INT AS $$
BEGIN
  RETURN EXTRACT(ISOYEAR FROM dt)::INT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 6. RLS POLICIES - allowed_users (admin-only)
-- ============================================================

DROP POLICY IF EXISTS "Admins can view all allowed users" ON allowed_users;
DROP POLICY IF EXISTS "Admins can invite users" ON allowed_users;
DROP POLICY IF EXISTS "Admins can remove invited users" ON allowed_users;

CREATE POLICY "Admins can view all allowed users"
  ON allowed_users FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can invite users"
  ON allowed_users FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can remove invited users"
  ON allowed_users FOR DELETE
  USING (is_admin(auth.uid()));

-- ============================================================
-- 7. RLS POLICIES - admin_users
-- ============================================================

DROP POLICY IF EXISTS "Admins can view admin list" ON admin_users;
DROP POLICY IF EXISTS "Users can check own admin status" ON admin_users;
DROP POLICY IF EXISTS "Admins can add new admins" ON admin_users;

-- Users can check if they are admin (needed for checkAdminStatus())
CREATE POLICY "Users can check own admin status"
  ON admin_users FOR SELECT
  USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Admins can add new admins"
  ON admin_users FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- ============================================================
-- 8. RLS POLICIES - profiles
-- ============================================================

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_invited(email));

-- ============================================================
-- 9. RLS POLICIES - bookings
-- ============================================================

DROP POLICY IF EXISTS "Users can view own bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can view all bookings" ON bookings;
DROP POLICY IF EXISTS "Users can view approved bookings for availability" ON bookings;
DROP POLICY IF EXISTS "Users can create booking requests" ON bookings;
DROP POLICY IF EXISTS "Users can cancel own pending bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can update all bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can delete bookings" ON bookings;

CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all bookings"
  ON bookings FOR SELECT
  USING (is_admin(auth.uid()));

-- Note: "Users can view approved bookings" is NOT added here
-- Users get approved slots via get_approved_booking_slots() RPC (no PII)

CREATE POLICY "Users can create booking requests"
  ON bookings FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    AND is_invited(user_email)
    AND status = 'pending'
  );

CREATE POLICY "Users can cancel own pending bookings"
  ON bookings FOR UPDATE
  USING (auth.uid() = user_id AND status IN ('pending', 'approved'))
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

CREATE POLICY "Admins can update all bookings"
  ON bookings FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete bookings"
  ON bookings FOR DELETE
  USING (is_admin(auth.uid()));

-- ============================================================
-- 10. RLS POLICIES - settings
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view settings" ON settings;
DROP POLICY IF EXISTS "Admins can update settings" ON settings;

CREATE POLICY "Anyone can view settings"
  ON settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can update settings"
  ON settings FOR UPDATE
  USING (is_admin(auth.uid()));

-- ============================================================
-- 11. RPC FUNCTION - request_booking
-- ============================================================

CREATE OR REPLACE FUNCTION request_booking(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_user_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_duration_minutes INT;
  v_membership TEXT;
  v_iso_week INT;
  v_iso_year INT;
  v_approved_this_week INT;
  v_conflicting_bookings INT;
  v_booking_id UUID;
BEGIN
  -- 1. Check authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Get user email from auth.users
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User email not found';
  END IF;

  -- 3. Check if user is invited
  IF NOT is_invited(v_user_email) THEN
    RAISE EXCEPTION 'Email not invited to use this system';
  END IF;

  -- 4. Validate duration
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

  -- 5. Check for conflicts with buffer (30 minutes before/after)
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
    RAISE EXCEPTION 'Booking conflicts with existing booking (including 30-minute buffer)';
  END IF;

  -- 6. Check weekly limit for subscribed users
  SELECT membership INTO v_membership
  FROM profiles
  WHERE user_id = v_user_id;

  IF v_membership = 'subscribed' THEN
    v_iso_week := get_iso_week(p_start);
    v_iso_year := get_iso_year(p_start);

    SELECT COUNT(*) INTO v_approved_this_week
    FROM bookings
    WHERE user_id = v_user_id
      AND status = 'approved'
      AND get_iso_week(start_time) = v_iso_week
      AND get_iso_year(start_time) = v_iso_year;

    IF v_approved_this_week >= 1 THEN
      RAISE EXCEPTION 'Weekly booking limit reached (subscribed users: 1 per week)';
    END IF;
  END IF;

  -- 7. Insert booking as pending
  INSERT INTO bookings (
    user_id,
    user_email,
    start_time,
    end_time,
    duration_minutes,
    status,
    user_notes
  ) VALUES (
    v_user_id,
    v_user_email,
    p_start,
    p_end,
    v_duration_minutes,
    'pending',
    p_user_notes
  ) RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 12. RPC FUNCTION - admin_set_booking_status
-- ============================================================

CREATE OR REPLACE FUNCTION admin_set_booking_status(
  p_booking_id UUID,
  p_status TEXT,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_booking RECORD;
  v_conflicting_bookings INT;
BEGIN
  -- 1. Check if user is admin
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- 2. Validate status
  IF p_status NOT IN ('pending', 'approved', 'declined', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  -- 3. Get booking details
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- 4. If approving, check for conflicts
  IF p_status = 'approved' AND v_booking.status != 'approved' THEN
    SELECT COUNT(*) INTO v_conflicting_bookings
    FROM bookings
    WHERE id != p_booking_id
      AND status = 'approved'
      AND (
        (v_booking.start_time >= start_time - INTERVAL '30 minutes' AND v_booking.start_time < end_time + INTERVAL '30 minutes')
        OR
        (v_booking.end_time > start_time - INTERVAL '30 minutes' AND v_booking.end_time <= end_time + INTERVAL '30 minutes')
        OR
        (v_booking.start_time <= start_time - INTERVAL '30 minutes' AND v_booking.end_time >= end_time + INTERVAL '30 minutes')
      );

    IF v_conflicting_bookings > 0 THEN
      RAISE EXCEPTION 'Cannot approve: conflicts with existing approved booking';
    END IF;
  END IF;

  -- 5. Update booking
  UPDATE bookings
  SET 
    status = p_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes)
  WHERE id = p_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 13. RPC FUNCTION - admin_invite_email
-- ============================================================

CREATE OR REPLACE FUNCTION admin_invite_email(p_email TEXT)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  INSERT INTO allowed_users (email, invited_by)
  VALUES (LOWER(p_email), v_user_id)
  ON CONFLICT (email) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 14. RPC FUNCTION - admin_remove_invite
-- ============================================================

CREATE OR REPLACE FUNCTION admin_remove_invite(p_email TEXT)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  DELETE FROM allowed_users WHERE email = LOWER(p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 15. RPC FUNCTION - get_or_create_profile
-- ============================================================

CREATE OR REPLACE FUNCTION get_or_create_profile()
RETURNS profiles AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_profile profiles;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  IF NOT is_invited(v_user_email) THEN
    RAISE EXCEPTION 'Email not invited';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE user_id = v_user_id;

  IF v_profile IS NULL THEN
    INSERT INTO profiles (user_id, email, name, membership)
    VALUES (v_user_id, v_user_email, v_user_email, 'standard')
    RETURNING * INTO v_profile;
  END IF;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 16. RPC FUNCTION - get_approved_booking_slots
-- ============================================================

CREATE OR REPLACE FUNCTION get_approved_booking_slots()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes int
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, user_id, start_time, end_time, duration_minutes
  FROM bookings
  WHERE status = 'approved';
$$;

-- ============================================================
-- 17. RPC FUNCTION - admin_create_booking
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

-- ============================================================
-- 18. GRANTS
-- ============================================================

GRANT EXECUTE ON FUNCTION get_approved_booking_slots() TO authenticated;
GRANT EXECUTE ON FUNCTION request_booking(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_booking_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_invite_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_remove_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_create_booking(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
-- UPDATE COMPLETE
-- ============================================================

-- This script has safely updated:
-- ✓ Functions (CREATE OR REPLACE)
-- ✓ Policies (DROP IF EXISTS + CREATE)
-- ✓ Indexes (CREATE IF NOT EXISTS)
-- ✓ Triggers (DROP IF EXISTS + CREATE)
-- ✓ Tables created if missing (CREATE IF NOT EXISTS)

-- No data was destroyed.
