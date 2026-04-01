-- PayOS orders tied to location-service bookings (webhook must not credit wallet for these)

CREATE TABLE IF NOT EXISTS public.payos_booking_orders (
  order_code BIGINT PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payos_booking_orders_booking_id ON public.payos_booking_orders(booking_id);

ALTER TABLE public.payos_booking_orders ENABLE ROW LEVEL SECURITY;

-- No policies: anon cannot access; service role bypasses RLS for backend inserts.

-- Called from sms-backend webhook (no user context)
CREATE OR REPLACE FUNCTION public.complete_payos_booking_from_webhook(p_order_code BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.payos_booking_orders%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM public.payos_booking_orders WHERE order_code = p_order_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_booking_order');
  END IF;

  UPDATE public.bookings
  SET
    status = 'confirmed',
    updated_at = now(),
    payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
      'paymentStatus', 'paid',
      'paymentMethod', 'payos',
      'paidAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  WHERE id = rec.booking_id;

  DELETE FROM public.payos_booking_orders WHERE order_code = p_order_code;

  RETURN jsonb_build_object('ok', true, 'booking_id', rec.booking_id);
END;
$$;

-- Called from app after PayOS confirms payment (verifies user)
CREATE OR REPLACE FUNCTION public.confirm_payos_for_booking_user(p_order_code BIGINT, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.payos_booking_orders%ROWTYPE;
BEGIN
  SELECT * INTO rec
  FROM public.payos_booking_orders
  WHERE order_code = p_order_code AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  UPDATE public.bookings
  SET
    status = 'confirmed',
    updated_at = now(),
    payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
      'paymentStatus', 'paid',
      'paymentMethod', 'payos',
      'paidAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  WHERE id = rec.booking_id;

  DELETE FROM public.payos_booking_orders WHERE order_code = p_order_code;

  RETURN jsonb_build_object('ok', true, 'booking_id', rec.booking_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_payos_booking_from_webhook(BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_payos_for_booking_user(BIGINT, UUID) TO anon, authenticated, service_role;
