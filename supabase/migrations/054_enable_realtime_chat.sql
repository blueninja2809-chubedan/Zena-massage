-- Enable Supabase Realtime for chat_messages and chat_rooms.
-- Without this, postgres_changes subscriptions connect but never fire.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.chat_rooms    REPLICA IDENTITY FULL;
