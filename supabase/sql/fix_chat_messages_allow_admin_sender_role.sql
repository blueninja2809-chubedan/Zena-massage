-- Chạy một lần trên Supabase (SQL Editor) nếu gửi tin từ admin panel bị lỗi:
--   new row for relation "chat_messages" violates check constraint "chat_messages_sender_role_check"
-- Tương đương mục (5) trong migration 025_admin_therapist_chat_and_role.sql.

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_sender_role_check;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_sender_role_check
  CHECK (sender_role IN ('customer', 'therapist', 'system', 'admin'));
