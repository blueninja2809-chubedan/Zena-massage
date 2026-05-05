-- Hoàn tiền ví (ví dụ: huỷ đơn chờ KTV). Idempotent theo reference_id.
CREATE OR REPLACE FUNCTION public.wallet_refund(
  p_user_id UUID,
  p_amount BIGINT,
  p_description TEXT DEFAULT '',
  p_reference_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w_id UUID;
  new_balance BIGINT;
  txn_id UUID;
  existing UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: Amount must be positive';
  END IF;

  IF p_reference_id IS NOT NULL AND length(trim(p_reference_id)) > 0 THEN
    SELECT wt.id INTO existing
    FROM public.wallet_transactions wt
    WHERE wt.user_id = p_user_id
      AND wt.type = 'refund'
      AND wt.reference_id = p_reference_id
      AND wt.status = 'completed'
    LIMIT 1;
    IF existing IS NOT NULL THEN
      SELECT w.balance INTO new_balance FROM public.wallets w WHERE w.user_id = p_user_id;
      RETURN jsonb_build_object(
        'transaction_id', existing,
        'balance', COALESCE(new_balance, 0),
        'duplicate', true
      );
    END IF;
  END IF;

  SELECT id INTO w_id FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF w_id IS NULL THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT id INTO w_id FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  UPDATE public.wallets
  SET balance = balance + p_amount, updated_at = now()
  WHERE id = w_id
  RETURNING balance INTO new_balance;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_after, description, reference_id, status
  )
  VALUES (
    w_id,
    p_user_id,
    'refund',
    p_amount,
    new_balance,
    COALESCE(NULLIF(trim(p_description), ''), 'Hoàn tiền'),
    NULLIF(trim(p_reference_id), ''),
    'completed'
  )
  RETURNING id INTO txn_id;

  RETURN jsonb_build_object(
    'transaction_id', txn_id,
    'balance', new_balance,
    'duplicate', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wallet_refund(UUID, BIGINT, TEXT, TEXT) TO anon, authenticated, service_role;
