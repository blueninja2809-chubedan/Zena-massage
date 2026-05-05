-- Fix phone auth RPCs on Supabase projects where pgcrypto lives in schema "extensions".
-- Root cause: search_path=public makes unqualified gen_salt/crypt not resolvable.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

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

GRANT EXECUTE ON FUNCTION public.signup_with_phone(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signin_with_phone(TEXT, TEXT) TO anon, authenticated, service_role;
