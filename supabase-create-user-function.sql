-- ============================================================
-- RPC FUNCTION - admin_create_user_with_password
-- Admin creates a new user with temp password
-- ============================================================

CREATE OR REPLACE FUNCTION admin_create_user_with_password(
  p_email TEXT,
  p_password TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  -- 1. Check if caller is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- 2. Validate email format
  IF p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  -- 3. Check if email already exists in auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = LOWER(p_email);

  IF v_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'User with this email already exists';
  END IF;

  -- 4. Insert into allowed_users (invite)
  INSERT INTO allowed_users (email, invited_by)
  VALUES (LOWER(p_email), auth.uid())
  ON CONFLICT (email) DO NOTHING;

  -- 5. Return success (user will be created via Supabase client-side with service key workaround)
  v_result := json_build_object(
    'success', true,
    'email', LOWER(p_email),
    'message', 'User invited successfully'
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
