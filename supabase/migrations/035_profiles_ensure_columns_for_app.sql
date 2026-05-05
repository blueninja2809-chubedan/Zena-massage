-- Một số project chưa chạy 024/028/031/032/033 đủ — app upsert/RPC cần các cột này.
-- Chạy an toàn nhiều lần (IF NOT EXISTS).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age integer;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_hash text;
