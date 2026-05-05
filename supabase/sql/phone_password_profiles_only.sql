-- Chạy toàn bộ file này trong Supabase → SQL Editor (chuẩn: chỉ dùng bảng profiles).

-- Phone + password auth lives ONLY on public.profiles (no longer app_users for new auth).
-- Adds password_hash, backfills from app_users where possible, replaces RPCs.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_hash text;

-- One non-null phone per profile (app sends normalized 84... numbers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'profiles_phone_number_not_null_key'
  ) THEN
    CREATE UNIQUE INDEX profiles_phone_number_not_null_key
    ON public.profiles (phone_number)
    WHERE phone_number IS NOT NULL AND trim(phone_number) <> '';
  END IF;
END $$;

-- Backfill từ app_users (nếu bảng còn tồn tại) để tài khoản cũ vẫn đăng nhập được
DO $backfill$
BEGIN
  IF to_regclass('public.app_users') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles p
  SET
    password_hash = u.password_hash,
    updated_at = now()
  FROM public.app_users u
  WHERE p.id = u.id
    AND (p.password_hash IS NULL OR p.password_hash = '');

  INSERT INTO public.profiles (
    id,
    phone_number,
    password_hash,
    role,
    service_images,
    services,
    partner_application_status,
    is_vip_member,
    created_at,
    updated_at
  )
  SELECT
    u.id,
    u.phone_number,
    u.password_hash,
    'customer'::public.user_role,
    '{}'::text[],
    '{}'::text[],
    'none',
    false,
    u.created_at,
    now()
  FROM public.app_users u
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
    AND NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.phone_number = u.phone_number);

  UPDATE public.profiles p
  SET password_hash = u.password_hash, updated_at = now()
  FROM public.app_users u
  WHERE p.phone_number = u.phone_number
    AND (p.password_hash IS NULL OR p.password_hash = '')
    AND u.password_hash IS NOT NULL;
END
$backfill$;

-- ========== signup / signin (profiles only) ==========
CREATE OR REPLACE FUNCTION public.signup_with_phone(p_phone text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.profiles (
    id,
    phone_number,
    password_hash,
    role,
    service_images,
    services,
    partner_application_status,
    is_vip_member,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_phone,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    'customer'::public.user_role,
    '{}'::text[],
    '{}'::text[],
    'none',
    false,
    now(),
    now()
  )
  RETURNING id INTO new_id;

  RETURN new_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'phone_already_registered' USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.signin_with_phone(p_phone text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_id uuid;
BEGIN
  SELECT p.id
  INTO found_id
  FROM public.profiles p
  WHERE p.phone_number = p_phone
    AND p.password_hash IS NOT NULL
    AND p.password_hash = extensions.crypt(p_password, p.password_hash);

  RETURN found_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.signup_with_phone(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signin_with_phone(text, text) TO anon, authenticated, service_role;
ALTER FUNCTION public.signup_with_phone(text, text) SET search_path = public;
ALTER FUNCTION public.signin_with_phone(text, text) SET search_path = public;

-- Xóa tài khoản SĐT: xác thực theo profiles.password_hash, purge không còn cần xóa app_users
CREATE OR REPLACE FUNCTION public.delete_my_phone_account(p_phone text, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_phone text := regexp_replace(trim(coalesce(p_phone, '')), '\s', '', 'g');
BEGIN
  IF v_phone = '' OR p_password IS NULL OR length(trim(p_password)) = 0 THEN
    RAISE EXCEPTION 'invalid_credentials' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.id
  INTO v_id
  FROM public.profiles p
  WHERE p.phone_number = v_phone
    AND p.password_hash IS NOT NULL
    AND p.password_hash = extensions.crypt(p_password, p.password_hash);

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'invalid_credentials' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.purge_user_data(v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_phone_account(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_phone_account(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_my_phone_account(text, text) TO authenticated;
