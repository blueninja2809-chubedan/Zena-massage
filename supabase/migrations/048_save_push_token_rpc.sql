-- RPC: Save push token to profiles (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION save_push_token(p_uid UUID, p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET push_token = p_token, updated_at = now()
  WHERE id = p_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION save_push_token(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION save_push_token(UUID, TEXT) TO authenticated;

-- Also ensure anon policy exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Allow anon all on profiles'
  ) THEN
    CREATE POLICY "Allow anon all on profiles" ON public.profiles
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END;
$$;
