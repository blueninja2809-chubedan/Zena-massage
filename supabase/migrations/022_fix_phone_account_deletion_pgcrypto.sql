-- Fix phone account deletion password check on Supabase.
-- pgcrypto is installed in the `extensions` schema, while the deletion RPC
-- pins search_path to `public`, so crypt() must be schema-qualified.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.delete_my_phone_account(p_phone TEXT, p_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id UUID;
  v_phone TEXT := regexp_replace(trim(COALESCE(p_phone, '')), '\s', '', 'g');
BEGIN
  IF v_phone = '' OR p_password IS NULL OR length(trim(p_password)) = 0 THEN
    RAISE EXCEPTION 'invalid_credentials' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.id INTO v_id
  FROM public.app_users u
  WHERE u.phone_number = v_phone
    AND u.password_hash = extensions.crypt(p_password, u.password_hash);

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'invalid_credentials' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.purge_user_data(v_id);
  DELETE FROM public.app_users WHERE id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_phone_account(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_phone_account(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_my_phone_account(TEXT, TEXT) TO authenticated;
