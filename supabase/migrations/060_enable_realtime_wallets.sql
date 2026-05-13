-- Enable Supabase Realtime cho bảng `wallets` để app KTV cập nhật số dư ngay
-- khi phí kết nối bị trừ sau khi hoàn thành đơn.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END
$$;

-- REPLICA IDENTITY FULL để payload UPDATE chứa đầy đủ dữ liệu row mới (bao gồm balance).
ALTER TABLE public.wallets REPLICA IDENTITY FULL;
