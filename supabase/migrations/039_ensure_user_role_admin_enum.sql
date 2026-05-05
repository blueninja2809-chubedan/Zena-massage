-- Enum có đủ 'admin' (đồng bộ migration 025) — Postgres 15+ / Supabase Cloud.
-- App đã map admin→customer khi upsert nếu DB cũ; sau migration có thể cập nhật row sang admin nếu cần.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'admin';
