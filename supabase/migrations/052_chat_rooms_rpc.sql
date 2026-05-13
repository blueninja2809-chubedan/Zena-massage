CREATE OR REPLACE FUNCTION get_chat_room_by_booking(p_booking_id TEXT)
RETURNS SETOF public.chat_rooms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.chat_rooms WHERE booking_id = p_booking_id::uuid LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION get_chat_rooms_for_user(p_user_id TEXT)
RETURNS SETOF public.chat_rooms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.chat_rooms
    WHERE customer_id = p_user_id OR therapist_id = p_user_id
    ORDER BY updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_chat_room_by_booking(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_chat_rooms_for_user(TEXT) TO anon, authenticated;
