-- App chỉ hiển thị mã do admin tạo; xóa toàn bộ seed/demo (nếu còn).
DELETE FROM public.promotions;

-- Trừ một lượt dùng mã (atomic), tránh race khi nhiều đơn cùng lúc.
CREATE OR REPLACE FUNCTION public.consume_promotion_if_available(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.promotions
  SET current_uses = current_uses + 1
  WHERE id = p_id
    AND is_active = true
    AND max_uses > 0
    AND current_uses < max_uses
    AND (expiry_date IS NULL OR expiry_date >= now());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_promotion_if_available(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_promotion_if_available(uuid) TO anon, authenticated;
