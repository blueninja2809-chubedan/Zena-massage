-- Some environments never ran migration 024; app upsert_profile + REST upsert need this column.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text;
