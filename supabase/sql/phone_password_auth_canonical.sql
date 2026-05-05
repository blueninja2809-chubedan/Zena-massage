-- =============================================================================
-- [CŨ / KHÔNG DÙNG] Auth qua bảng app_users — dự án đã chuyển sang profiles.
-- Dùng file: supabase/sql/phone_password_profiles_only.sql (hoặc migration 033).
-- =============================================================================
-- AUTH SỐ ĐIỆN THOẠI + MẬT KHẨU (custom, không dùng Supabase Auth)
-- Chạy TOÀN BỘ file này trong: Supabase Dashboard → SQL Editor → Run
--
-- Mục đích:
--   - Gỡ mọi phiên bản cũ / trùng của signup_with_phone & signin_with_phone
--   - Tạo lại luồng tối giản: bảng app_users + 2 RPC + RLS + quyền gọi từ anon
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Gỡ hết overload/schema trùng của 2 RPC (PostgREST chỉ cần public + (text,text))
DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN
    SELECT format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_catalog.oidvectortypes(p.proargtypes)
    )
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('signup_with_phone', 'signin_with_phone')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || fn || ' CASCADE';
  END LOOP;
END $$;

-- Bảng tài khoản tối thiểu
CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all on app_users" ON public.app_users;
CREATE POLICY "Allow anon all on app_users" ON public.app_users
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Đăng ký: trả về UUID user mới; trùng SĐT → phone_already_registered
CREATE OR REPLACE FUNCTION public.signup_with_phone(p_phone text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.app_users (phone_number, password_hash)
  VALUES (p_phone, extensions.crypt(p_password, extensions.gen_salt('bf')))
  RETURNING id INTO new_id;

  RETURN new_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'phone_already_registered' USING ERRCODE = '23505';
END;
$$;

-- Đăng nhập: đúng SĐT+mật khẩu → id; sai → NULL
CREATE OR REPLACE FUNCTION public.signin_with_phone(p_phone text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_id uuid;
BEGIN
  SELECT u.id
  INTO found_id
  FROM public.app_users u
  WHERE u.phone_number = p_phone
    AND u.password_hash = extensions.crypt(p_password, u.password_hash);

  RETURN found_id;
END;
$$;

-- Quyền: anon (mobile app với anon key) phải EXECUTE + đọc/ghi bảng
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_users TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.signup_with_phone(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signin_with_phone(text, text) TO anon, authenticated, service_role;

ALTER FUNCTION public.signup_with_phone(text, text) SET search_path = public;
ALTER FUNCTION public.signin_with_phone(text, text) SET search_path = public;

-- Gợi ý: sau khi chạy xong, trong Dashboard → Settings → API → Reload schema
-- (hoặc đợi vài phút) để PostgREST nhận RPC mới nếu trước đó báo "schema cache".

-- Cột bio, age (app gửi khi đăng ký / sửa hồ sơ) — bỏ qua nếu đã có
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age integer;
