-- =============================================
-- FIX: profiles table for custom auth (no Supabase Auth)
-- Since we use app_users for auth (not auth.users),
-- we need to:
-- 1) Remove FK constraint to auth.users
-- 2) Allow anon role full access to profiles
-- 3) Create RPC functions as SECURITY DEFINER fallback
-- =============================================

-- 1) Ensure email column exists (from migration 003)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
-- Make phone_number nullable (custom auth may not always have phone)
ALTER TABLE public.profiles ALTER COLUMN phone_number DROP NOT NULL;

-- 1b) Drop UNIQUE constraint on phone_number (allows multiple NULL values
--     and avoids conflicts when upserting profiles by id)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_number_key;
DROP INDEX IF EXISTS profiles_phone_number_key;
-- Also drop the email unique constraint from migration 003 (same reason)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;
DROP INDEX IF EXISTS profiles_email_key;

-- 2) Remove foreign key constraint to auth.users
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey CASCADE;
ALTER TABLE public.profiles ADD PRIMARY KEY (id);

-- 2) Drop restrictive policies that require auth.uid()
DROP POLICY IF EXISTS profiles_read_own ON public.profiles;
DROP POLICY IF EXISTS profiles_write_own ON public.profiles;
DROP POLICY IF EXISTS "Allow anon all on profiles" ON public.profiles;

-- 3) Enable RLS and allow anon full access (since we use custom auth)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on profiles" ON public.profiles
  FOR ALL USING (true) WITH CHECK (true);

-- Also GRANT explicit table permissions to anon and authenticated roles
GRANT ALL ON public.profiles TO anon;
GRANT ALL ON public.profiles TO authenticated;

-- 4) Also fix partner_applications for anon access
DROP POLICY IF EXISTS partner_app_read_own ON public.partner_applications;
DROP POLICY IF EXISTS partner_app_insert_auth ON public.partner_applications;
DROP POLICY IF EXISTS "Allow anon all on partner_applications" ON public.partner_applications;
CREATE POLICY "Allow anon all on partner_applications" ON public.partner_applications
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.partner_applications TO anon;
GRANT ALL ON public.partner_applications TO authenticated;

-- 5) Fix bookings for anon access
DROP POLICY IF EXISTS bookings_read_own ON public.bookings;
DROP POLICY IF EXISTS bookings_write_own ON public.bookings;
DROP POLICY IF EXISTS "Allow anon all on bookings" ON public.bookings;
CREATE POLICY "Allow anon all on bookings" ON public.bookings
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.bookings TO anon;
GRANT ALL ON public.bookings TO authenticated;

-- 6) Fix reviews for anon access
DROP POLICY IF EXISTS reviews_write_own ON public.reviews;
DROP POLICY IF EXISTS "Allow anon all on reviews" ON public.reviews;
CREATE POLICY "Allow anon all on reviews" ON public.reviews
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.reviews TO anon;
GRANT ALL ON public.reviews TO authenticated;

-- 7) Fix addresses for anon access
DROP POLICY IF EXISTS addresses_read_own ON public.addresses;
DROP POLICY IF EXISTS addresses_write_own ON public.addresses;
DROP POLICY IF EXISTS "Allow anon all on addresses" ON public.addresses;
CREATE POLICY "Allow anon all on addresses" ON public.addresses
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.addresses TO anon;
GRANT ALL ON public.addresses TO authenticated;

-- 8) Fix notifications for anon access
DROP POLICY IF EXISTS notifications_read_own ON public.notifications;
DROP POLICY IF EXISTS "Allow anon all on notifications" ON public.notifications;
CREATE POLICY "Allow anon all on notifications" ON public.notifications
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.notifications TO anon;
GRANT ALL ON public.notifications TO authenticated;

-- 9) RPC: Upsert profile (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION upsert_profile(p_data JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, phone_number, display_name, gender, nationality,
    avatar_uri, role, working_city, service_images, services,
    is_vip_member, vip_plan_id, vip_expires_at,
    partner_application_id, partner_application_status,
    partner_role_approved_at, partner_role_notice_seen_at,
    selected_city, created_at, updated_at
  ) VALUES (
    (p_data->>'id')::uuid,
    NULLIF(p_data->>'email', ''),
    NULLIF(p_data->>'phone_number', ''),
    COALESCE(p_data->>'display_name', ''),
    p_data->>'gender',
    p_data->>'nationality',
    p_data->>'avatar_uri',
    COALESCE(p_data->>'role', 'customer'),
    p_data->>'working_city',
    COALESCE((SELECT array_agg(x)::text[] FROM jsonb_array_elements_text(p_data->'service_images') x), '{}'),
    COALESCE((SELECT array_agg(x)::text[] FROM jsonb_array_elements_text(p_data->'services') x), '{}'),
    COALESCE((p_data->>'is_vip_member')::boolean, false),
    p_data->>'vip_plan_id',
    CASE WHEN p_data->>'vip_expires_at' IS NOT NULL THEN (p_data->>'vip_expires_at')::timestamptz END,
    CASE WHEN p_data->>'partner_application_id' IS NOT NULL THEN (p_data->>'partner_application_id')::uuid END,
    COALESCE(p_data->>'partner_application_status', 'none'),
    CASE WHEN p_data->>'partner_role_approved_at' IS NOT NULL THEN (p_data->>'partner_role_approved_at')::timestamptz END,
    CASE WHEN p_data->>'partner_role_notice_seen_at' IS NOT NULL THEN (p_data->>'partner_role_notice_seen_at')::timestamptz END,
    p_data->>'selected_city',
    COALESCE((p_data->>'created_at')::timestamptz, now()),
    COALESCE((p_data->>'updated_at')::timestamptz, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(EXCLUDED.email, ''), profiles.email),
    phone_number = COALESCE(NULLIF(EXCLUDED.phone_number, ''), profiles.phone_number),
    display_name = EXCLUDED.display_name,
    gender = EXCLUDED.gender,
    nationality = EXCLUDED.nationality,
    avatar_uri = EXCLUDED.avatar_uri,
    role = EXCLUDED.role,
    working_city = EXCLUDED.working_city,
    service_images = EXCLUDED.service_images,
    services = EXCLUDED.services,
    is_vip_member = EXCLUDED.is_vip_member,
    vip_plan_id = EXCLUDED.vip_plan_id,
    vip_expires_at = EXCLUDED.vip_expires_at,
    partner_application_id = EXCLUDED.partner_application_id,
    partner_application_status = EXCLUDED.partner_application_status,
    partner_role_approved_at = EXCLUDED.partner_role_approved_at,
    partner_role_notice_seen_at = EXCLUDED.partner_role_notice_seen_at,
    selected_city = EXCLUDED.selected_city,
    updated_at = now();
END;
$$;

-- 10) RPC: Get profile by UID (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION get_profile_by_uid(p_uid UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT to_jsonb(p.*) INTO result
  FROM public.profiles p
  WHERE p.id = p_uid;
  RETURN result;
END;
$$;
