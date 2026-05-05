-- Đảm bảo RPC chat KTV ↔ admin tồn tại (nếu 025 chưa chạy trên project hoặc cần tạo lại).
-- Phụ thuộc: public.get_or_create_chat_room (008_chat.sql).

CREATE OR REPLACE FUNCTION public.admin_get_or_create_therapist_chat_room(
  p_admin_id TEXT,
  p_admin_name TEXT,
  p_therapist_id TEXT,
  p_therapist_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id TEXT;
  v_room_id UUID;
BEGIN
  v_booking_id := format('admin_chat_%s_%s', p_admin_id, p_therapist_id);
  v_room_id := get_or_create_chat_room(
    v_booking_id,
    p_admin_id,
    p_therapist_id,
    COALESCE(p_admin_name, 'Admin'),
    COALESCE(p_therapist_name, '')
  );
  RETURN v_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_or_create_therapist_chat_room(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
