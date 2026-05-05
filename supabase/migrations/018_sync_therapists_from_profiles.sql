-- Keep public.therapists in sync with public.profiles where role = 'therapist'.
-- Goal: admin panel only sees real therapist accounts, no mixed customer rows.

-- 1) Remove mixed rows in therapists:
--    - rows whose id is not in profiles
--    - rows whose profile exists but role is not therapist
DELETE FROM public.therapists t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.profiles p
  WHERE p.id = t.id
    AND p.role = 'therapist'
);

-- 2) Backfill / upsert all therapist profiles into therapists
INSERT INTO public.therapists (
  id,
  name,
  phone_number,
  email,
  gender,
  avatar,
  photos,
  specialties,
  working_city,
  is_available
)
SELECT
  p.id,
  COALESCE(NULLIF(TRIM(p.display_name), ''), NULLIF(TRIM(p.phone_number), ''), 'KTV'),
  p.phone_number,
  p.email,
  COALESCE(NULLIF(TRIM(p.gender), ''), 'female'),
  COALESCE(p.avatar_uri, ''),
  COALESCE(p.service_images, '{}'::text[]),
  COALESCE(p.services, '{}'::text[]),
  p.working_city,
  true
FROM public.profiles p
WHERE p.role = 'therapist'
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  phone_number = EXCLUDED.phone_number,
  email = EXCLUDED.email,
  gender = EXCLUDED.gender,
  avatar = EXCLUDED.avatar,
  photos = EXCLUDED.photos,
  specialties = EXCLUDED.specialties,
  working_city = EXCLUDED.working_city;

-- 3) Add FK so therapists rows must map to profiles
ALTER TABLE public.therapists
  DROP CONSTRAINT IF EXISTS therapists_id_fkey;

ALTER TABLE public.therapists
  ADD CONSTRAINT therapists_id_fkey
  FOREIGN KEY (id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 4) Trigger function to sync therapists when profiles changes
CREATE OR REPLACE FUNCTION public.sync_therapist_from_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- DELETE event
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.therapists WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  -- INSERT / UPDATE events
  IF NEW.role = 'therapist' THEN
    INSERT INTO public.therapists (
      id,
      name,
      phone_number,
      email,
      gender,
      avatar,
      photos,
      specialties,
      working_city,
      is_available
    )
    VALUES (
      NEW.id,
      COALESCE(NULLIF(TRIM(NEW.display_name), ''), NULLIF(TRIM(NEW.phone_number), ''), 'KTV'),
      NEW.phone_number,
      NEW.email,
      COALESCE(NULLIF(TRIM(NEW.gender), ''), 'female'),
      COALESCE(NEW.avatar_uri, ''),
      COALESCE(NEW.service_images, '{}'::text[]),
      COALESCE(NEW.services, '{}'::text[]),
      NEW.working_city,
      COALESCE((SELECT t.is_available FROM public.therapists t WHERE t.id = NEW.id), true)
    )
    ON CONFLICT (id) DO UPDATE
    SET
      name = EXCLUDED.name,
      phone_number = EXCLUDED.phone_number,
      email = EXCLUDED.email,
      gender = EXCLUDED.gender,
      avatar = EXCLUDED.avatar,
      photos = EXCLUDED.photos,
      specialties = EXCLUDED.specialties,
      working_city = EXCLUDED.working_city;
  ELSE
    -- If role is not therapist anymore, remove from therapists
    DELETE FROM public.therapists WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_therapist_from_profile ON public.profiles;

CREATE TRIGGER trg_sync_therapist_from_profile
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_therapist_from_profile();
