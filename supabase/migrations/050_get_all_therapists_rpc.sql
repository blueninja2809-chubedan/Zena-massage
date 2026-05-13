-- RPC: Get all available therapists (no wallet balance filter)
-- SECURITY DEFINER bypasses RLS so anon clients can read the therapists catalog.
CREATE OR REPLACE FUNCTION get_all_therapists_public()
RETURNS SETOF public.therapists
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT t.*
    FROM public.therapists t
    WHERE t.is_available = true;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_therapists_public() TO anon;
GRANT EXECUTE ON FUNCTION get_all_therapists_public() TO authenticated;

-- RPC: Get all active services
-- SECURITY DEFINER bypasses RLS so anon clients can read the services catalog.
CREATE OR REPLACE FUNCTION get_all_services_public()
RETURNS SETOF public.services
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT s.*
    FROM public.services s
    WHERE s.is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_services_public() TO anon;
GRANT EXECUTE ON FUNCTION get_all_services_public() TO authenticated;

-- Ensure SELECT grants + policies exist (idempotent)
GRANT SELECT ON TABLE public.therapists TO anon, authenticated;
GRANT SELECT ON TABLE public.services TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'therapists' AND policyname = 'therapists_public_read'
  ) THEN
    CREATE POLICY therapists_public_read ON public.therapists
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'services' AND policyname = 'services_public_read'
  ) THEN
    CREATE POLICY services_public_read ON public.services
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END;
$$;
