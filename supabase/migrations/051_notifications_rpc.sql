-- RPC: Insert a notification record (SECURITY DEFINER bypasses RLS for anon clients).
CREATE OR REPLACE FUNCTION insert_notification(
  p_user_id   TEXT,
  p_payload   JSONB,
  p_is_read   BOOLEAN DEFAULT FALSE,
  p_created_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, is_read, payload, created_at)
  VALUES (p_user_id, p_is_read, p_payload, p_created_at);
END;
$$;

GRANT EXECUTE ON FUNCTION insert_notification(TEXT, JSONB, BOOLEAN, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION insert_notification(TEXT, JSONB, BOOLEAN, TIMESTAMPTZ) TO authenticated;
