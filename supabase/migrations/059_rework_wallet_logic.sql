-- Migration 059: Rework wallet logic
--
-- OLD model:
--   - wallets:                 thu nhập (credit 100% on complete)
--   - therapist_cost_wallets:  phí kết nối (debit 20% on complete)
--
-- NEW model:
--   - wallets:  ví tiền nạp của KTV (deposit wallet only)
--               - debit 20% fee on each completed booking
--               - must be >= 500.000 VND to accept new jobs
--   - Dự kiến thu nhập: statistics only (read from bookings), NOT stored in wallets
--
-- complete_therapist_booking_financials:
--   - Remove:  credit 100% earning to wallets
--   - Add:     debit 20% fee from wallets
--   - Idempotent via wallet_transactions reference 'fee-<booking_id>'
--
-- check_therapist_can_receive_jobs:
--   - New:     wallets.balance >= 500.000

-- ─── complete_therapist_booking_financials ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_therapist_booking_financials(
  p_therapist_user_id UUID,
  p_booking_id        TEXT,
  p_total_amount      BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w_id          UUID;
  fee_amount    BIGINT;
  new_balance   BIGINT;
  txn_id        UUID;
  already_done  BOOLEAN;
  fee_ref       TEXT;
BEGIN
  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: total must be positive';
  END IF;

  fee_ref := 'fee-' || p_booking_id;

  -- Idempotent: skip if fee was already deducted for this booking
  SELECT EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    INNER JOIN public.wallets w ON w.id = wt.wallet_id
    WHERE w.user_id  = p_therapist_user_id
      AND wt.type        = 'fee'
      AND wt.reference_id = fee_ref
  ) INTO already_done;

  IF already_done THEN
    SELECT balance INTO new_balance
    FROM public.wallets
    WHERE user_id = p_therapist_user_id;

    RETURN jsonb_build_object(
      'skipped',         true,
      'reason',          'already_deducted',
      'balance',         COALESCE(new_balance, 0),
      'earning_amount',  0
    );
  END IF;

  fee_amount := GREATEST(0, FLOOR(p_total_amount::NUMERIC * 0.2)::BIGINT);

  -- Ensure wallet exists
  INSERT INTO public.wallets (user_id, balance)
  VALUES (p_therapist_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO w_id
  FROM public.wallets
  WHERE user_id = p_therapist_user_id
  FOR UPDATE;

  -- Deduct fee from deposit wallet
  UPDATE public.wallets
  SET    balance    = balance - fee_amount,
         updated_at = now()
  WHERE  id = w_id
  RETURNING balance INTO new_balance;

  -- Log fee transaction
  INSERT INTO public.wallet_transactions
    (wallet_id, user_id, type, amount, balance_after, description, reference_id, status)
  VALUES (
    w_id,
    p_therapist_user_id,
    'fee',
    -fee_amount,
    new_balance,
    'Phí kết nối 20% khi hoàn thành đơn',
    fee_ref,
    'completed'
  )
  RETURNING id INTO txn_id;

  RETURN jsonb_build_object(
    'transaction_id', txn_id,
    'earning_amount',  0,
    'fee_amount',      fee_amount,
    'balance',         new_balance
  );
END;
$$;

ALTER FUNCTION public.complete_therapist_booking_financials(UUID, TEXT, BIGINT) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.complete_therapist_booking_financials(UUID, TEXT, BIGINT) TO anon, authenticated, service_role;

-- ─── check_therapist_can_receive_jobs ─────────────────────────────────────────
-- Simple rule: deposit wallet must be >= 500.000 VND.
-- The "one active booking" guard is enforced app-side, not here.

CREATE OR REPLACE FUNCTION public.check_therapist_can_receive_jobs(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w_balance  BIGINT := 0;
  min_bal    CONSTANT BIGINT := 500000;
BEGIN
  SELECT COALESCE(balance, 0) INTO w_balance
  FROM public.wallets
  WHERE user_id = p_user_id;

  RETURN w_balance >= min_bal;
END;
$$;

ALTER FUNCTION public.check_therapist_can_receive_jobs(UUID) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.check_therapist_can_receive_jobs(UUID) TO anon, authenticated, service_role;

-- check_therapist_min_balance: kept for backwards compat — delegates to above.
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

ALTER FUNCTION public.check_therapist_min_balance(UUID, BIGINT) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.check_therapist_min_balance(UUID, BIGINT) TO anon, authenticated, service_role;
