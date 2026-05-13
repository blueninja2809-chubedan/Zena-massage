CREATE OR REPLACE FUNCTION get_chat_messages_rpc(p_room_id TEXT, p_limit INT DEFAULT 100, p_offset INT DEFAULT 0)
RETURNS SETOF public.chat_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT * FROM public.chat_messages
    WHERE room_id = p_room_id::uuid
    ORDER BY created_at ASC
    LIMIT p_limit OFFSET p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION get_chat_messages_rpc(TEXT, INT, INT) TO anon, authenticated;

GRANT SELECT ON public.chat_messages TO anon, authenticated;
GRANT SELECT ON public.chat_rooms TO anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_messages' AND policyname='chat_messages_anon_read') THEN
    CREATE POLICY chat_messages_anon_read ON public.chat_messages FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_rooms' AND policyname='chat_rooms_anon_read') THEN
    CREATE POLICY chat_rooms_anon_read ON public.chat_rooms FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
