-- Account deletion must not fail just because an optional feature table was not
-- created in the target database yet.

CREATE OR REPLACE FUNCTION public.purge_user_data(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text TEXT := p_user_id::text;
BEGIN
  IF to_regclass('public.payos_booking_orders') IS NOT NULL
    AND to_regclass('public.bookings') IS NOT NULL THEN
    DELETE FROM public.payos_booking_orders
    WHERE user_id = p_user_id
       OR booking_id IN (SELECT id FROM public.bookings WHERE user_id = v_text);
  END IF;

  IF to_regclass('public.chat_messages') IS NOT NULL
    AND to_regclass('public.chat_rooms') IS NOT NULL THEN
    DELETE FROM public.chat_messages
    WHERE room_id IN (
      SELECT id FROM public.chat_rooms
      WHERE customer_id = v_text OR therapist_id = v_text
    );
  END IF;

  IF to_regclass('public.chat_rooms') IS NOT NULL THEN
    DELETE FROM public.chat_rooms
    WHERE customer_id = v_text OR therapist_id = v_text;
  END IF;

  IF to_regclass('public.bookings') IS NOT NULL THEN
    DELETE FROM public.bookings WHERE user_id = v_text;
  END IF;

  IF to_regclass('public.reviews') IS NOT NULL THEN
    DELETE FROM public.reviews WHERE user_id = v_text;
  END IF;

  IF to_regclass('public.addresses') IS NOT NULL THEN
    DELETE FROM public.addresses WHERE user_id = v_text;
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications WHERE user_id = v_text;
  END IF;

  IF to_regclass('public.therapist_shifts') IS NOT NULL THEN
    DELETE FROM public.therapist_shifts WHERE user_id = p_user_id;
  END IF;

  IF to_regclass('public.withdrawal_requests') IS NOT NULL THEN
    DELETE FROM public.withdrawal_requests WHERE user_id = p_user_id;
  END IF;

  IF to_regclass('public.wallets') IS NOT NULL THEN
    DELETE FROM public.wallets WHERE user_id = p_user_id;
  END IF;

  IF to_regclass('public.partner_applications') IS NOT NULL THEN
    DELETE FROM public.partner_applications WHERE user_id = p_user_id;
  END IF;

  IF to_regclass('public.therapist_cost_wallet_transactions') IS NOT NULL THEN
    DELETE FROM public.therapist_cost_wallet_transactions WHERE user_id = p_user_id;
  END IF;

  IF to_regclass('public.therapist_cost_wallets') IS NOT NULL THEN
    DELETE FROM public.therapist_cost_wallets WHERE user_id = p_user_id;
  END IF;

  IF to_regclass('public.therapists') IS NOT NULL THEN
    DELETE FROM public.therapists WHERE id = p_user_id;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    DELETE FROM public.profiles WHERE id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_data(UUID) FROM PUBLIC;
