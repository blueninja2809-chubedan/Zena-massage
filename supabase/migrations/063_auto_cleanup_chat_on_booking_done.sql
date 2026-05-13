-- ============================================================
-- 063_auto_cleanup_chat_on_booking_done.sql
--   Tự động xóa chat_rooms (và chat_messages qua ON DELETE CASCADE)
--   ngay khi booking chuyển sang trạng thái 'completed' hoặc 'cancelled'.
--
--   Đồng thời:
--   - Lọc danh sách inbox: chỉ trả room có booking đang active
--     (confirmed/in-progress) → ẩn ngay room mồ côi nếu trigger lỡ miss.
--   - Cấp 1 RPC SECURITY DEFINER để client gọi cleanup chắc chắn
--     (không phụ thuộc RLS của bảng chat_rooms).
--   - Backfill 1 lần: dọn data test cũ đã completed/cancelled.
--
--   chat_rooms.booking_id là TEXT, bookings.id là UUID — luôn cast
--   bookings.id sang TEXT khi so sánh để tránh lỗi với synthetic IDs.
-- ============================================================

-- ── RPC: cleanup theo booking_id (gọi từ client) ─────────────
CREATE OR REPLACE FUNCTION public.delete_chat_room_by_booking(
  p_booking_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.chat_rooms WHERE booking_id = p_booking_id;
END;
$$;

ALTER FUNCTION public.delete_chat_room_by_booking(TEXT) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.delete_chat_room_by_booking(TEXT)
  TO anon, authenticated;

-- ── Trigger function: xóa chat khi booking đóng (done/cancelled) ──
CREATE OR REPLACE FUNCTION public.cleanup_chat_room_on_booking_done()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed', 'cancelled')
     AND COALESCE(OLD.status, '') <> NEW.status THEN
    DELETE FROM public.chat_rooms WHERE booking_id = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_chat_on_booking_done ON public.bookings;
CREATE TRIGGER trg_cleanup_chat_on_booking_done
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_chat_room_on_booking_done();

-- ── Filter inbox: chỉ trả room có booking đang active ────────
--   Giữ nguyên chữ ký RPC để client không phải sửa.
CREATE OR REPLACE FUNCTION public.get_chat_rooms_for_user(p_user_id TEXT)
RETURNS SETOF public.chat_rooms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT cr.*
  FROM public.chat_rooms cr
  INNER JOIN public.bookings b
    ON b.id::text = cr.booking_id
   AND b.status IN ('confirmed', 'in-progress')
  WHERE cr.customer_id = p_user_id OR cr.therapist_id = p_user_id
  ORDER BY cr.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_chat_rooms_for_user(TEXT)
  TO anon, authenticated;

-- ── Backfill: dọn chat_rooms thuộc booking đã đóng ───────────
DELETE FROM public.chat_rooms cr
WHERE EXISTS (
  SELECT 1
  FROM public.bookings b
  WHERE b.id::text = cr.booking_id
    AND b.status IN ('completed', 'cancelled')
);
