-- Đảm bảo tin nhắn chat có thể dùng sender_role 'admin' (admin panel ↔ KTV).
-- Idempotent: có thể chạy lại an toàn nếu 025 đã áp trước đó.

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_sender_role_check;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_sender_role_check
  CHECK (sender_role IN ('customer', 'therapist', 'system', 'admin'));
