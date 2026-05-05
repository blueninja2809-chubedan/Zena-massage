-- KTV đã từng có đơn (gắn therapist, không tính hủy): tổng số dư = ví thu nhập (wallets) + ví phí (therapist_cost_wallets) phải >= 200.000.
-- KTV chưa từng có đơn: chỉ cần ví phí >= 0 (tránh nợ phí kết nối). Phí vẫn phải >= 0 ở mọi trường hợp.

CREATE OR REPLACE FUNCTION public.check_therapist_can_receive_jobs(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b_cost BIGINT := 0;
  w_main BIGINT := 0;
  total_sum BIGINT;
  has_order_except_cancelled BOOLEAN;
  min_total CONSTANT BIGINT := 200000;
BEGIN
  SELECT COALESCE(tcw.balance, 0) INTO b_cost
  FROM public.therapist_cost_wallets tcw
  WHERE tcw.user_id = p_user_id;

  IF NOT FOUND THEN
    b_cost := 0;
  END IF;

  IF b_cost < 0 THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(w.balance, 0) INTO w_main
  FROM public.wallets w
  WHERE w.user_id = p_user_id;

  IF NOT FOUND THEN
    w_main := 0;
  END IF;

  total_sum := w_main + b_cost;

  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.therapist_id IS NOT NULL
      AND trim(b.therapist_id) <> ''
      AND b.therapist_id = p_user_id::text
      AND COALESCE(b.status, '') NOT IN ('cancelled')
  ) INTO has_order_except_cancelled;

  IF has_order_except_cancelled THEN
    RETURN total_sum >= min_total;
  END IF;

  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.check_therapist_can_receive_jobs(UUID) SET search_path = public;

-- Giữ tương thích: p_min_balance vẫn bị bỏ qua, logic ở check_therapist_can_receive_jobs
CREATE OR REPLACE FUNCTION public.check_therapist_min_balance(p_user_id UUID, p_min_balance BIGINT DEFAULT 500000)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.check_therapist_can_receive_jobs(p_user_id);
END;
$$;
