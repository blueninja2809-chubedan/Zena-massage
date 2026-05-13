-- RPC: Get saved addresses (SECURITY DEFINER bypasses RLS for custom-auth users)
CREATE OR REPLACE FUNCTION get_saved_addresses(p_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'payload', payload,
      'created_at', created_at,
      'updated_at', updated_at
    ) ORDER BY created_at ASC
  ), '[]'::jsonb)
  INTO result
  FROM public.addresses
  WHERE user_id = p_user_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_saved_addresses(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_saved_addresses(TEXT) TO authenticated;
