-- Ví Chi phí (KTV): số dư có thể âm; phí kết nối 20% sau mỗi đơn hoàn thành.
-- Điều kiện nhận đơn tiếp: cost_wallet.balance >= 0.

CREATE TABLE IF NOT EXISTS public.therapist_cost_wallets (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.therapist_cost_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  description TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_therapist_cost_wallet_tx_user
  ON public.therapist_cost_wallet_transactions (user_id, created_at DESC);

ALTER TABLE public.therapist_cost_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on therapist_cost_wallets" ON public.therapist_cost_wallets;
CREATE POLICY "Allow anon all on therapist_cost_wallets" ON public.therapist_cost_wallets
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.therapist_cost_wallets TO anon, authenticated;

ALTER TABLE public.therapist_cost_wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on therapist_cost_wallet_transactions" ON public.therapist_cost_wallet_transactions;
CREATE POLICY "Allow anon all on therapist_cost_wallet_transactions" ON public.therapist_cost_wallet_transactions
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.therapist_cost_wallet_transactions TO anon, authenticated;

-- Đơn hoàn thành: cộng 100% vào ví chính, trừ 20% phí kết nối vào Ví Chi phí (có thể âm). Idempotent theo booking.
CREATE OR REPLACE FUNCTION public.complete_therapist_booking_financials(
  p_therapist_user_id UUID,
  p_booking_id TEXT,
  p_total_amount BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w_id UUID;
  earning_amount BIGINT;
  fee_amount BIGINT;
  new_main_balance BIGINT;
  txn_main UUID;
  cw_new BIGINT;
  existing_earning BOOLEAN;
BEGIN
  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: total must be positive';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    INNER JOIN public.wallets w ON w.id = wt.wallet_id
    WHERE w.user_id = p_therapist_user_id
      AND wt.type = 'earning'
      AND wt.reference_id = p_booking_id
  ) INTO existing_earning;

  IF existing_earning THEN
    SELECT balance INTO new_main_balance FROM public.wallets WHERE user_id = p_therapist_user_id;
    SELECT balance INTO cw_new FROM public.therapist_cost_wallets WHERE user_id = p_therapist_user_id;
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'already_credited',
      'balance', COALESCE(new_main_balance, 0),
      'cost_wallet_balance', COALESCE(cw_new, 0)
    );
  END IF;

  earning_amount := p_total_amount;
  fee_amount := GREATEST(0, FLOOR(p_total_amount::NUMERIC * 0.2)::BIGINT);

  SELECT id INTO w_id FROM public.wallets WHERE user_id = p_therapist_user_id FOR UPDATE;
  IF w_id IS NULL THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (p_therapist_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT id INTO w_id FROM public.wallets WHERE user_id = p_therapist_user_id FOR UPDATE;
  END IF;

  UPDATE public.wallets
  SET balance = balance + earning_amount, updated_at = now()
  WHERE id = w_id
  RETURNING balance INTO new_main_balance;

  INSERT INTO public.wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, reference_id, status)
  VALUES (
    w_id,
    p_therapist_user_id,
    'earning',
    earning_amount,
    new_main_balance,
    'Thu nhập đơn hoàn thành (100% thanh toán từ khách)',
    p_booking_id,
    'completed'
  )
  RETURNING id INTO txn_main;

  INSERT INTO public.therapist_cost_wallets (user_id, balance)
  VALUES (p_therapist_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.therapist_cost_wallets
  SET balance = balance - fee_amount, updated_at = now()
  WHERE user_id = p_therapist_user_id
  RETURNING balance INTO cw_new;

  INSERT INTO public.therapist_cost_wallet_transactions (user_id, amount, balance_after, description, reference_id)
  VALUES (
    p_therapist_user_id,
    -fee_amount,
    cw_new,
    'Phí kết nối 20% (Ví Chi phí)',
    p_booking_id
  );

  RETURN jsonb_build_object(
    'transaction_id', txn_main,
    'earning_amount', earning_amount,
    'balance', new_main_balance,
    'connection_fee', fee_amount,
    'cost_wallet_balance', cw_new
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_therapist_cost_wallet_balance(p_user_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT balance FROM public.therapist_cost_wallets WHERE user_id = p_user_id), 0::BIGINT);
$$;

-- Nạp tiền vào Ví Chi phí (giảm nợ / đưa số dư về >= 0).
CREATE OR REPLACE FUNCTION public.therapist_cost_wallet_topup(
  p_user_id UUID,
  p_amount BIGINT,
  p_method TEXT DEFAULT 'bank'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_bal BIGINT;
  tid UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  INSERT INTO public.therapist_cost_wallets (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.therapist_cost_wallets
  SET balance = balance + p_amount, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO new_bal;

  INSERT INTO public.therapist_cost_wallet_transactions (user_id, amount, balance_after, description, reference_id)
  VALUES (
    p_user_id,
    p_amount,
    new_bal,
    'Nạp Ví Chi phí qua ' || COALESCE(p_method, 'bank'),
    'cost-topup-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 8)
  )
  RETURNING id INTO tid;

  RETURN jsonb_build_object('transaction_id', tid, 'balance', new_bal, 'amount', p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_therapist_can_receive_jobs(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b BIGINT;
BEGIN
  SELECT COALESCE(balance, 0) INTO b
  FROM public.therapist_cost_wallets
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;

  RETURN b >= 0;
END;
$$;

-- Giữ tên RPC cũ cho app: không còn yêu cầu 500k ví chính — chỉ kiểm tra Ví Chi phí >= 0.
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

GRANT EXECUTE ON FUNCTION public.complete_therapist_booking_financials(UUID, TEXT, BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_therapist_cost_wallet_balance(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.therapist_cost_wallet_topup(UUID, BIGINT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_therapist_can_receive_jobs(UUID) TO anon, authenticated, service_role;

ALTER FUNCTION public.complete_therapist_booking_financials(UUID, TEXT, BIGINT) SET search_path = public;
ALTER FUNCTION public.get_therapist_cost_wallet_balance(UUID) SET search_path = public;
ALTER FUNCTION public.therapist_cost_wallet_topup(UUID, BIGINT, TEXT) SET search_path = public;
ALTER FUNCTION public.check_therapist_can_receive_jobs(UUID) SET search_path = public;
ALTER FUNCTION public.check_therapist_min_balance(UUID, BIGINT) SET search_path = public;
