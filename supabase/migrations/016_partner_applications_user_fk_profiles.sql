-- Custom auth uses app_users.id = profiles.id; those rows are NOT in auth.users.
-- partner_applications.user_id must reference profiles, not auth.users.
ALTER TABLE public.partner_applications DROP CONSTRAINT IF EXISTS partner_applications_user_id_fkey;

-- Orphan rows would block adding the new FK; clear invalid references.
UPDATE public.partner_applications pa
SET user_id = NULL
WHERE user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = pa.user_id);

ALTER TABLE public.partner_applications
  ADD CONSTRAINT partner_applications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE SET NULL;
