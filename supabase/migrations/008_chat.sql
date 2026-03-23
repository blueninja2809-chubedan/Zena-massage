-- ============================================================
-- 008_chat.sql  –  Realtime chat between customer & therapist
-- ============================================================

-- ── Chat Rooms (one per booking) ─────────────────────────────
CREATE TABLE IF NOT EXISTS chat_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  TEXT NOT NULL,                    -- references bookings.id
  customer_id TEXT NOT NULL,                    -- user_id of customer
  therapist_id TEXT NOT NULL,                   -- user_id of therapist
  customer_name   TEXT DEFAULT '',
  therapist_name  TEXT DEFAULT '',
  is_active   BOOLEAN DEFAULT true,            -- admin can deactivate
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (booking_id)                          -- one room per booking
);

-- ── Chat Messages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL,                   -- user_id who sent
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'therapist', 'system')),
  content     TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'location', 'system')),
  is_read     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX idx_chat_rooms_booking   ON chat_rooms(booking_id);
CREATE INDEX idx_chat_rooms_customer  ON chat_rooms(customer_id);
CREATE INDEX idx_chat_rooms_therapist ON chat_rooms(therapist_id);
CREATE INDEX idx_chat_messages_room   ON chat_messages(room_id, created_at);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);

-- ── RLS (matching app pattern: open for anon) ────────────────
ALTER TABLE chat_rooms    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_rooms_all"    ON chat_rooms    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "chat_messages_all" ON chat_messages  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON chat_rooms    TO anon, authenticated;
GRANT ALL ON chat_messages TO anon, authenticated;

-- ── Enable Supabase Realtime on chat_messages ────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- ── Helper RPCs ──────────────────────────────────────────────

-- Get or create a chat room for a booking
CREATE OR REPLACE FUNCTION get_or_create_chat_room(
  p_booking_id TEXT,
  p_customer_id TEXT,
  p_therapist_id TEXT,
  p_customer_name TEXT DEFAULT '',
  p_therapist_name TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id UUID;
BEGIN
  SELECT id INTO v_room_id FROM chat_rooms WHERE booking_id = p_booking_id LIMIT 1;
  IF v_room_id IS NULL THEN
    INSERT INTO chat_rooms (booking_id, customer_id, therapist_id, customer_name, therapist_name)
    VALUES (p_booking_id, p_customer_id, p_therapist_id, p_customer_name, p_therapist_name)
    RETURNING id INTO v_room_id;
  END IF;
  RETURN v_room_id;
END;
$$;

-- Send a chat message (returns the new message row)
CREATE OR REPLACE FUNCTION send_chat_message(
  p_room_id UUID,
  p_sender_id TEXT,
  p_sender_role TEXT,
  p_content TEXT,
  p_message_type TEXT DEFAULT 'text'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_msg_id UUID;
BEGIN
  INSERT INTO chat_messages (room_id, sender_id, sender_role, content, message_type)
  VALUES (p_room_id, p_sender_id, p_sender_role, p_content, p_message_type)
  RETURNING id INTO v_msg_id;

  -- Update room's updated_at for ordering
  UPDATE chat_rooms SET updated_at = now() WHERE id = p_room_id;

  RETURN v_msg_id;
END;
$$;

-- Mark all messages in a room as read for a specific user (the other party's messages)
CREATE OR REPLACE FUNCTION mark_messages_read(
  p_room_id UUID,
  p_reader_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE chat_messages
  SET is_read = true
  WHERE room_id = p_room_id
    AND sender_id != p_reader_id
    AND is_read = false;
END;
$$;

-- Admin: get all chat rooms with last message preview
CREATE OR REPLACE FUNCTION admin_get_chat_rooms(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  room_id UUID,
  booking_id TEXT,
  customer_id TEXT,
  therapist_id TEXT,
  customer_name TEXT,
  therapist_name TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count BIGINT,
  total_messages BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.id AS room_id,
    cr.booking_id,
    cr.customer_id,
    cr.therapist_id,
    cr.customer_name,
    cr.therapist_name,
    cr.is_active,
    cr.created_at,
    cr.updated_at,
    (SELECT cm.content FROM chat_messages cm WHERE cm.room_id = cr.id ORDER BY cm.created_at DESC LIMIT 1) AS last_message,
    (SELECT cm.created_at FROM chat_messages cm WHERE cm.room_id = cr.id ORDER BY cm.created_at DESC LIMIT 1) AS last_message_at,
    (SELECT COUNT(*) FROM chat_messages cm WHERE cm.room_id = cr.id AND cm.is_read = false) AS unread_count,
    (SELECT COUNT(*) FROM chat_messages cm WHERE cm.room_id = cr.id) AS total_messages
  FROM chat_rooms cr
  ORDER BY cr.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Admin: toggle room active status
CREATE OR REPLACE FUNCTION admin_toggle_chat_room(
  p_room_id UUID,
  p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE chat_rooms SET is_active = p_is_active, updated_at = now() WHERE id = p_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_chat_room     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION send_chat_message           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_messages_read          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_get_chat_rooms        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_toggle_chat_room      TO anon, authenticated;
