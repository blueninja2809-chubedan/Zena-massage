-- Ensure custom phone/password auth exists on every environment.
-- This migration replaces manual execution of supabase/migrations/custom_auth.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all on app_users" ON public.app_users;
CREATE POLICY "Allow anon all on app_users" ON public.app_users
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.signup_with_phone(p_phone TEXT, p_password TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.app_users (phone_number, password_hash)
  VALUES (p_phone, extensions.crypt(p_password, extensions.gen_salt('bf')))
  RETURNING id INTO new_id;

  RETURN new_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'phone_already_registered';
END;
$$;

CREATE OR REPLACE FUNCTION public.signin_with_phone(p_phone TEXT, p_password TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_id UUID;
BEGIN
  SELECT id
  INTO found_id
  FROM public.app_users
  WHERE phone_number = p_phone
    AND password_hash = extensions.crypt(p_password, password_hash);

  RETURN found_id;
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_users TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_with_phone(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signin_with_phone(TEXT, TEXT) TO anon, authenticated, service_role;
