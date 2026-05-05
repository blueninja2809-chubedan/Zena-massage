-- Chạy trong Supabase → SQL Editor để xác nhận chat KTV ↔ admin đã cài.
-- 025 hoặc 037 đều tạo cùng hàm: kết quả 1 dòng = OK.

SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'admin_get_or_create_therapist_chat_room';

-- sender_role phải cho phép 'admin' (migration 025 hoặc 038 / script fix_chat_messages_allow_admin_sender_role.sql)
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.chat_messages'::regclass
  AND conname = 'chat_messages_sender_role_check';
