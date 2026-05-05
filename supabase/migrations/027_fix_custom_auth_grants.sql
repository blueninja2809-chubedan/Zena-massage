-- Fix missing grants for custom phone/password auth.
-- RLS policy alone is not enough; anon/authenticated also need table/function grants.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.app_users') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_users TO anon, authenticated, service_role;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'signup_with_phone'
      AND p.pronargs = 2
  ) THEN
    GRANT EXECUTE ON FUNCTION public.signup_with_phone(TEXT, TEXT) TO anon, authenticated, service_role;
    ALTER FUNCTION public.signup_with_phone(TEXT, TEXT) SET search_path = public;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'signin_with_phone'
      AND p.pronargs = 2
  ) THEN
    GRANT EXECUTE ON FUNCTION public.signin_with_phone(TEXT, TEXT) TO anon, authenticated, service_role;
    ALTER FUNCTION public.signin_with_phone(TEXT, TEXT) SET search_path = public;
  END IF;
END $$;
