-- RPC: check_therapist_has_active_booking
-- Trả về TRUE nếu KTV đang có đơn confirmed/in-progress chưa hoàn thành.
-- Kiểm tra cả 3 nguồn lưu ID của KTV trong bảng bookings:
--   1. therapist_id (top-level column) — direct booking
--   2. payload->>'requestedTherapistId' — nominated_city_broadcast booking
--   3. payload->>'therapistId' — payload field (backup)

CREATE OR REPLACE FUNCTION public.check_therapist_has_active_booking(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid_text TEXT := p_user_id::text;
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE status IN ('confirmed', 'in-progress')
      -- Chỉ xét booking trong 48 giờ gần nhất để tránh stale data từ test cũ
      AND updated_at >= now() - interval '48 hours'
      AND (
        therapist_id = uid_text
        OR payload->>'requestedTherapistId' = uid_text
        OR payload->>'therapistId' = uid_text
      )
  );
END;
$$;

ALTER FUNCTION public.check_therapist_has_active_booking(UUID) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.check_therapist_has_active_booking(UUID) TO anon, authenticated, service_role;
