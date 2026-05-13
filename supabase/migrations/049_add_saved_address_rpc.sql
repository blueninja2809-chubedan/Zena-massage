-- RPC: Add saved address (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION add_saved_address(p_user_id TEXT, p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.addresses (user_id, payload)
  VALUES (p_user_id, p_payload)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION add_saved_address(TEXT, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION add_saved_address(TEXT, JSONB) TO authenticated;

-- Ensure anon policy exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'addresses' AND policyname = 'Allow anon all on addresses'
  ) THEN
    CREATE POLICY "Allow anon all on addresses" ON public.addresses
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END;
$$;
