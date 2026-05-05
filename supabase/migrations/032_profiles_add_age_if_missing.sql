-- Align with 028; some projects never ran it — app sends `age` on profile upsert.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age integer;
