-- =============================================
-- WALLETS: Bảng lưu số dư ví cho khách hàng & kỹ thuật viên
-- =============================================

-- 1) Bảng wallets: mỗi user 1 ví duy nhất
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,          -- profiles.id / app_users.id
  balance BIGINT NOT NULL DEFAULT 0,     -- số dư (VND), dùng BIGINT tránh lỗi số thập phân
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Bảng wallet_transactions: lịch sử giao dịch
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,                 -- để query nhanh theo user
  type TEXT NOT NULL CHECK (type IN ('topup', 'payment', 'earning', 'fee', 'refund', 'withdrawal')),
  amount BIGINT NOT NULL,                -- số tiền (dương = cộng, âm = trừ)
  balance_after BIGINT NOT NULL,         -- số dư sau giao dịch
  description TEXT,                      -- mô tả giao dịch
  reference_id TEXT,                     -- booking_id, order_id, etc.
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Index cho query nhanh
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON public.wallet_transactions(created_at DESC);

-- 4) RLS + cho phép anon access (custom auth, không dùng Supabase Auth)
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on wallets" ON public.wallets;
CREATE POLICY "Allow anon all on wallets" ON public.wallets
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.wallets TO anon;
GRANT ALL ON public.wallets TO authenticated;

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "Allow anon all on wallet_transactions" ON public.wallet_transactions
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.wallet_transactions TO anon;
GRANT ALL ON public.wallet_transactions TO authenticated;

-- 5) RPC: Lấy hoặc tạo ví cho user
CREATE OR REPLACE FUNCTION get_or_create_wallet(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Thử lấy ví có sẵn
  SELECT to_jsonb(w.*) INTO result
  FROM public.wallets w
  WHERE w.user_id = p_user_id;

  -- Nếu chưa có thì tạo mới
  IF result IS NULL THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING to_jsonb(wallets.*) INTO result;

    -- Nếu bị race condition (ON CONFLICT DO NOTHING), đọc lại
    IF result IS NULL THEN
      SELECT to_jsonb(w.*) INTO result
      FROM public.wallets w
      WHERE w.user_id = p_user_id;
    END IF;
  END IF;

  RETURN result;
END;
$$;

-- 6) RPC: Nạp tiền (top-up) - an toàn, dùng transaction
CREATE OR REPLACE FUNCTION wallet_topup(p_user_id UUID, p_amount BIGINT, p_method TEXT DEFAULT 'bank')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  w_id UUID;
  new_balance BIGINT;
  txn_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: Amount must be positive';
  END IF;

  -- Lấy hoặc tạo ví, lock row để tránh race condition
  SELECT id INTO w_id FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF w_id IS NULL THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT id INTO w_id FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- Cộng tiền
  UPDATE public.wallets
  SET balance = balance + p_amount, updated_at = now()
  WHERE id = w_id
  RETURNING balance INTO new_balance;

  -- Ghi lịch sử
  INSERT INTO public.wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, status)
  VALUES (w_id, p_user_id, 'topup', p_amount, new_balance, 'Nạp tiền qua ' || p_method, 'completed')
  RETURNING id INTO txn_id;

  RETURN jsonb_build_object(
    'transaction_id', txn_id,
    'balance', new_balance,
    'amount', p_amount
  );
END;
$$;

-- 7) RPC: Trừ tiền (thanh toán / phí) - an toàn
CREATE OR REPLACE FUNCTION wallet_deduct(p_user_id UUID, p_amount BIGINT, p_type TEXT, p_description TEXT DEFAULT '', p_reference_id TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  w_id UUID;
  current_balance BIGINT;
  new_balance BIGINT;
  txn_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: Amount must be positive';
  END IF;

  -- Lock ví
  SELECT id, balance INTO w_id, current_balance
  FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;

  IF w_id IS NULL THEN
    RAISE EXCEPTION 'wallet_not_found: User does not have a wallet';
  END IF;

  IF current_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_balance: Not enough balance. Current: %, Required: %', current_balance, p_amount;
  END IF;

  -- Trừ tiền
  UPDATE public.wallets
  SET balance = balance - p_amount, updated_at = now()
  WHERE id = w_id
  RETURNING balance INTO new_balance;

  -- Ghi lịch sử (amount âm)
  INSERT INTO public.wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, reference_id, status)
  VALUES (w_id, p_user_id, p_type, -p_amount, new_balance, p_description, p_reference_id, 'completed')
  RETURNING id INTO txn_id;

  RETURN jsonb_build_object(
    'transaction_id', txn_id,
    'balance', new_balance,
    'amount', -p_amount
  );
END;
$$;

-- 8) RPC: Lấy lịch sử giao dịch
CREATE OR REPLACE FUNCTION get_wallet_transactions(p_user_id UUID, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(t.*) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT * FROM public.wallet_transactions
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;
  RETURN result;
END;
$$;
