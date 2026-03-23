-- =============================================
-- CUSTOM AUTH: Phone + Password (no Supabase Auth)
-- Chạy file SQL này trong Supabase Dashboard → SQL Editor
-- =============================================

-- 1) Bật pgcrypto để hash password bằng bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Tạo bảng app_users
CREATE TABLE IF NOT EXISTS app_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3) Cho phép anon đọc/ghi (vì không dùng Supabase Auth)
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on app_users" ON app_users;
CREATE POLICY "Allow anon all on app_users" ON app_users
  FOR ALL USING (true) WITH CHECK (true);

-- 4) Cho phép anon đọc/ghi profiles (vì không dùng auth.uid() nữa)
DROP POLICY IF EXISTS "Allow anon all on profiles" ON profiles;
CREATE POLICY "Allow anon all on profiles" ON profiles
  FOR ALL USING (true) WITH CHECK (true);

-- 5) RPC: Đăng ký bằng SĐT
CREATE OR REPLACE FUNCTION signup_with_phone(p_phone TEXT, p_password TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO app_users (phone_number, password_hash)
  VALUES (p_phone, crypt(p_password, gen_salt('bf')))
  RETURNING id INTO new_id;
  RETURN new_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'phone_already_registered';
END;
$$;

-- 6) RPC: Đăng nhập bằng SĐT
CREATE OR REPLACE FUNCTION signin_with_phone(p_phone TEXT, p_password TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  found_id UUID;
BEGIN
  SELECT id INTO found_id
  FROM app_users
  WHERE phone_number = p_phone
    AND password_hash = crypt(p_password, password_hash);
  RETURN found_id;  -- NULL nếu sai phone/password
END;
$$;
