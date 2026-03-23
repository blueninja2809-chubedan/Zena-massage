-- =============================================
-- 009: Withdrawal Requests + Earnings Logic + Min Balance Visibility
-- =============================================

-- 1) Bảng withdrawal_requests: lưu yêu cầu rút tiền của kỹ thuật viên
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,                          -- therapist user id
  amount BIGINT NOT NULL CHECK (amount > 0),      -- số tiền rút (VND)
  bank_name TEXT NOT NULL,                         -- tên ngân hàng
  account_number TEXT NOT NULL,                    -- số tài khoản
  account_holder TEXT NOT NULL,                    -- tên chủ tài khoản
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  admin_note TEXT,                                 -- ghi chú từ admin
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON public.withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON public.withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at ON public.withdrawal_requests(created_at DESC);

-- RLS
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon all on withdrawal_requests" ON public.withdrawal_requests;
CREATE POLICY "Allow anon all on withdrawal_requests" ON public.withdrawal_requests
  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.withdrawal_requests TO anon;
GRANT ALL ON public.withdrawal_requests TO authenticated;

-- 2) RPC: Tạo yêu cầu rút tiền (trừ tiền ví ngay, ghi transaction pending)
CREATE OR REPLACE FUNCTION create_withdrawal_request(
  p_user_id UUID,
  p_amount BIGINT,
  p_bank_name TEXT,
  p_account_number TEXT,
  p_account_holder TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  w_id UUID;
  current_balance BIGINT;
  new_balance BIGINT;
  txn_id UUID;
  req_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: Số tiền rút phải lớn hơn 0';
  END IF;

  -- Lock ví
  SELECT id, balance INTO w_id, current_balance
  FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;

  IF w_id IS NULL THEN
    RAISE EXCEPTION 'wallet_not_found: Người dùng chưa có ví';
  END IF;

  IF current_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_balance: Số dư không đủ. Hiện tại: %, Cần: %', current_balance, p_amount;
  END IF;

  -- Trừ tiền ví
  UPDATE public.wallets
  SET balance = balance - p_amount, updated_at = now()
  WHERE id = w_id
  RETURNING balance INTO new_balance;

  -- Tạo yêu cầu rút tiền
  INSERT INTO public.withdrawal_requests (user_id, amount, bank_name, account_number, account_holder, status)
  VALUES (p_user_id, p_amount, p_bank_name, p_account_number, p_account_holder, 'pending')
  RETURNING id INTO req_id;

  -- Ghi lịch sử giao dịch (pending)
  INSERT INTO public.wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, reference_id, status)
  VALUES (w_id, p_user_id, 'withdrawal', -p_amount, new_balance,
          'Rút tiền về ' || p_bank_name || ' - ' || p_account_number,
          req_id::TEXT, 'pending')
  RETURNING id INTO txn_id;

  RETURN jsonb_build_object(
    'request_id', req_id,
    'transaction_id', txn_id,
    'balance', new_balance,
    'amount', p_amount
  );
END;
$$;

-- 3) RPC: Admin xử lý yêu cầu rút tiền (hoàn thành hoặc từ chối)
CREATE OR REPLACE FUNCTION process_withdrawal_request(
  p_request_id UUID,
  p_status TEXT,           -- 'completed' hoặc 'rejected'
  p_admin_note TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  req RECORD;
  w_id UUID;
  new_balance BIGINT;
BEGIN
  -- Lấy yêu cầu rút tiền
  SELECT * INTO req FROM public.withdrawal_requests WHERE id = p_request_id;
  IF req IS NULL THEN
    RAISE EXCEPTION 'request_not_found: Không tìm thấy yêu cầu rút tiền';
  END IF;

  IF req.status != 'pending' THEN
    RAISE EXCEPTION 'already_processed: Yêu cầu này đã được xử lý';
  END IF;

  -- Cập nhật trạng thái yêu cầu
  UPDATE public.withdrawal_requests
  SET status = p_status, admin_note = p_admin_note, updated_at = now()
  WHERE id = p_request_id;

  -- Cập nhật trạng thái giao dịch
  UPDATE public.wallet_transactions
  SET status = p_status
  WHERE reference_id = p_request_id::TEXT AND type = 'withdrawal';

  -- Nếu từ chối, hoàn tiền lại ví
  IF p_status = 'rejected' THEN
    SELECT id INTO w_id FROM public.wallets WHERE user_id = req.user_id FOR UPDATE;
    UPDATE public.wallets
    SET balance = balance + req.amount, updated_at = now()
    WHERE id = w_id
    RETURNING balance INTO new_balance;
  END IF;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', p_status,
    'refunded', p_status = 'rejected'
  );
END;
$$;

-- 4) RPC: Cộng thu nhập cho kỹ thuật viên (70% giá trị đơn)
CREATE OR REPLACE FUNCTION credit_therapist_earning(
  p_therapist_user_id UUID,
  p_booking_id TEXT,
  p_total_amount BIGINT,
  p_commission_rate NUMERIC DEFAULT 0.7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  w_id UUID;
  earning_amount BIGINT;
  new_balance BIGINT;
  txn_id UUID;
BEGIN
  -- Tính thu nhập = tổng giá trị * tỉ lệ hoa hồng
  earning_amount := FLOOR(p_total_amount * p_commission_rate);

  IF earning_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_earning: Thu nhập không hợp lệ';
  END IF;

  -- Lấy hoặc tạo ví
  SELECT id INTO w_id FROM public.wallets WHERE user_id = p_therapist_user_id FOR UPDATE;
  IF w_id IS NULL THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (p_therapist_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT id INTO w_id FROM public.wallets WHERE user_id = p_therapist_user_id FOR UPDATE;
  END IF;

  -- Cộng tiền vào ví
  UPDATE public.wallets
  SET balance = balance + earning_amount, updated_at = now()
  WHERE id = w_id
  RETURNING balance INTO new_balance;

  -- Ghi lịch sử giao dịch
  INSERT INTO public.wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, reference_id, status)
  VALUES (w_id, p_therapist_user_id, 'earning', earning_amount, new_balance,
          'Thu nhập từ đơn hàng (70%)', p_booking_id, 'completed')
  RETURNING id INTO txn_id;

  RETURN jsonb_build_object(
    'transaction_id', txn_id,
    'earning_amount', earning_amount,
    'balance', new_balance
  );
END;
$$;

-- 5) RPC: Kiểm tra số dư tối thiểu của kỹ thuật viên
CREATE OR REPLACE FUNCTION check_therapist_min_balance(p_user_id UUID, p_min_balance BIGINT DEFAULT 500000)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance BIGINT;
BEGIN
  SELECT balance INTO current_balance FROM public.wallets WHERE user_id = p_user_id;
  IF current_balance IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN current_balance >= p_min_balance;
END;
$$;

-- 6) RPC: Lấy danh sách kỹ thuật viên đang hoạt động VÀ có số dư >= min_balance
CREATE OR REPLACE FUNCTION get_available_therapists_with_min_balance(p_min_balance BIGINT DEFAULT 500000)
RETURNS SETOF public.therapists
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT t.*
    FROM public.therapists t
    INNER JOIN public.wallets w ON w.user_id = t.id
    WHERE t.is_available = true
      AND w.balance >= p_min_balance;
END;
$$;
