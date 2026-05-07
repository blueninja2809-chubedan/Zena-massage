-- Enable Supabase Realtime cho `notifications` (KTV nhận đơn mới popup ngay) và `bookings`
-- (khách + KTV cùng theo dõi trạng thái đơn realtime: applications, primaryAction, status…).
--
-- App client đã subscribe `postgres_changes INSERT` trên `public.notifications` và `public.bookings`
-- (xem src/contexts/NotificationContext.tsx, BookingsContext.tsx). Nếu publication chưa thêm 2 bảng này,
-- subscription sẽ kết nối thành công nhưng KHÔNG bao giờ phát event → KTV không thấy popup, không có
-- âm thanh, không thấy đơn mới khi app đang ở foreground.
--
-- Tham khảo: https://supabase.com/docs/guides/realtime/postgres-changes#configuration

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN duplicate_object THEN
      -- already in publication
      NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END
$$;

-- Realtime cần REPLICA IDENTITY FULL để truyền đầy đủ payload row mới (đặc biệt UPDATE).
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.bookings      REPLICA IDENTITY FULL;
