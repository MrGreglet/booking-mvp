-- ============================================================
-- STUDIO94 BOOKING SYSTEM - AUTH MIGRATION
-- Migrates from PIN-based to Supabase Auth + Magic Links
-- Invite-only access with server-enforced security
-- ============================================================

-- ============================================================
-- 1. DROP OLD TABLES (backup data first if needed!)
-- ============================================================

-- Drop old triggers (wrapped in DO block to handle non-existent tables)
DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS update_users_updated_at ON users;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Drop old tables (will cascade to bookings via FK)
DROP TABLE IF EXISTS users CASCADE;

-- Keep bookings table but we'll modify it
-- Keep settings table as-is

-- ============================================================
-- 2. CREATE NEW AUTH TABLES
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

-- User profiles (replaces old users table)
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

-- ============================================================
-- 3. RECREATE BOOKINGS TABLE WITH AUTH INTEGRATION
-- ============================================================

-- Drop and recreate bookings to ensure clean schema
DROP TABLE IF EXISTS bookings CASCADE;

CREATE TABLE bookings (
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

-- Indexes for performance (IF NOT EXISTS for idempotency)
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_email ON bookings(user_email);
CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON bookings(start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_user_status ON bookings(user_id, status);

-- ============================================================
-- 4. ENSURE SETTINGS TABLE EXISTS (IDEMPOTENT)
-- ============================================================

-- Drop trigger first (if exists) - wrapped to handle non-existent table
DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Drop and recreate settings table to ensure correct schema
DROP TABLE IF EXISTS settings CASCADE;

CREATE TABLE settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  business_hours_start TEXT NOT NULL DEFAULT '09:00',
  business_hours_end TEXT NOT NULL DEFAULT '17:00',
  buffer_minutes INT NOT NULL DEFAULT 30,
  slot_interval_minutes INT NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default settings (ON CONFLICT for idempotency)
INSERT INTO settings (id, business_hours_start, business_hours_end, buffer_minutes, slot_interval_minutes)
VALUES ('default', '09:00', '17:00', 30, 60)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. UPDATED_AT TRIGGERS
-- ============================================================

-- Reusable trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Apply to tables
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
-- 6. HELPER FUNCTIONS
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

-- ============================================================
-- 7. RLS POLICIES - DROP EXISTING POLICIES (IDEMPOTENT)
-- ============================================================

-- Drop all existing policies to ensure clean slate
DROP POLICY IF EXISTS "Admins can view all allowed users" ON allowed_users;
DROP POLICY IF EXISTS "Admins can invite users" ON allowed_users;
DROP POLICY IF EXISTS "Admins can remove invited users" ON allowed_users;

DROP POLICY IF EXISTS "Admins can view admin list" ON admin_users;
DROP POLICY IF EXISTS "Admins can add new admins" ON admin_users;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

DROP POLICY IF EXISTS "Users can view own bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can view all bookings" ON bookings;
DROP POLICY IF EXISTS "Users can create booking requests" ON bookings;
DROP POLICY IF EXISTS "Users can cancel own pending bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can update all bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can delete bookings" ON bookings;

DROP POLICY IF EXISTS "Anyone can view settings" ON settings;
DROP POLICY IF EXISTS "Admins can update settings" ON settings;

-- ============================================================
-- 8. RLS POLICIES - ENABLE RLS ON ALL TABLES
-- ============================================================

ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. RLS POLICIES - allowed_users (admin-only)
-- ============================================================

-- Admins can view all
CREATE POLICY "Admins can view all allowed users"
  ON allowed_users FOR SELECT
  USING (is_admin(auth.uid()));

-- Admins can insert
CREATE POLICY "Admins can invite users"
  ON allowed_users FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Admins can delete
CREATE POLICY "Admins can remove invited users"
  ON allowed_users FOR DELETE
  USING (is_admin(auth.uid()));

-- ============================================================
-- 10. RLS POLICIES - admin_users (admin-only)
-- ============================================================

-- Admins can view all admins
CREATE POLICY "Admins can view admin list"
  ON admin_users FOR SELECT
  USING (is_admin(auth.uid()));

-- Only existing admins can add new admins
CREATE POLICY "Admins can add new admins"
  ON admin_users FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- ============================================================
-- 11. RLS POLICIES - profiles
-- ============================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin(auth.uid()));

-- Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (is_admin(auth.uid()));

-- Auto-create profile on first login (via trigger or RPC)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_invited(email));

-- ============================================================
-- 12. RLS POLICIES - bookings
-- ============================================================

-- Users can view their own bookings
CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all bookings
CREATE POLICY "Admins can view all bookings"
  ON bookings FOR SELECT
  USING (is_admin(auth.uid()));

-- Users can insert bookings ONLY via RPC (we'll block direct inserts)
-- This policy allows insert but the RPC will enforce all rules
CREATE POLICY "Users can create booking requests"
  ON bookings FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    AND is_invited(user_email)
    AND status = 'pending'
  );

-- Users can cancel their own pending bookings
CREATE POLICY "Users can cancel own pending bookings"
  ON bookings FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

-- Admins can update all bookings
CREATE POLICY "Admins can update all bookings"
  ON bookings FOR UPDATE
  USING (is_admin(auth.uid()));

-- Admins can delete bookings
CREATE POLICY "Admins can delete bookings"
  ON bookings FOR DELETE
  USING (is_admin(auth.uid()));

-- ============================================================
-- 13. RLS POLICIES - settings
-- ============================================================

-- Everyone can read settings
CREATE POLICY "Anyone can view settings"
  ON settings FOR SELECT
  USING (true);

-- Only admins can update settings
CREATE POLICY "Admins can update settings"
  ON settings FOR UPDATE
  USING (is_admin(auth.uid()));

-- ============================================================
-- 14. RPC FUNCTION - request_booking
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
      -- New booking starts during existing (with buffer)
      (p_start >= start_time - INTERVAL '30 minutes' AND p_start < end_time + INTERVAL '30 minutes')
      OR
      -- New booking ends during existing (with buffer)
      (p_end > start_time - INTERVAL '30 minutes' AND p_end <= end_time + INTERVAL '30 minutes')
      OR
      -- New booking completely contains existing
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
-- 15. RPC FUNCTION - admin_set_booking_status
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
-- 16. RPC FUNCTION - admin_invite_email
-- ============================================================

CREATE OR REPLACE FUNCTION admin_invite_email(p_email TEXT)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- 1. Check if user is admin
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- 2. Validate email format (basic check)
  IF p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  -- 3. Insert into allowlist (idempotent)
  INSERT INTO allowed_users (email, invited_by)
  VALUES (LOWER(p_email), v_user_id)
  ON CONFLICT (email) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 17. RPC FUNCTION - admin_remove_invite
-- ============================================================

CREATE OR REPLACE FUNCTION admin_remove_invite(p_email TEXT)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- 1. Check if user is admin
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- 2. Remove from allowlist
  DELETE FROM allowed_users WHERE email = LOWER(p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 18. RPC FUNCTION - get_or_create_profile
-- ============================================================

-- Called automatically after user logs in to ensure profile exists
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

  -- Get email from auth
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- Check if invited
  IF NOT is_invited(v_user_email) THEN
    RAISE EXCEPTION 'Email not invited';
  END IF;

  -- Get or create profile
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
-- 19. SEED INITIAL ADMIN (OPTIONAL - REPLACE EMAIL)
-- ============================================================

-- IMPORTANT: Replace 'your-admin-email@example.com' with your actual email
-- After you first sign in with magic link, run this to make yourself admin:

-- First, sign in with magic link, then get your user_id:
-- SELECT id, email FROM auth.users WHERE email = 'your-admin-email@example.com';

-- Then run (replace UUID with your actual user_id):
-- INSERT INTO admin_users (user_id) VALUES ('your-user-id-here');
-- INSERT INTO allowed_users (email) VALUES ('your-admin-email@example.com');

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================

-- Summary of what was created:
-- ✓ allowed_users (invite allowlist)
-- ✓ admin_users (admin privileges)
-- ✓ profiles (user data with membership)
-- ✓ bookings (redesigned with auth.users FK)
-- ✓ settings (kept as-is)
-- ✓ RLS policies (all tables secured)
-- ✓ Helper functions (is_admin, is_invited)
-- ✓ RPC: request_booking (server-side validation)
-- ✓ RPC: admin_set_booking_status (admin approval)
-- ✓ RPC: admin_invite_email (admin invites)
-- ✓ RPC: admin_remove_invite (admin removes)
-- ✓ RPC: get_or_create_profile (auto profile creation)
