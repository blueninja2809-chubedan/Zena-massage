-- Track live therapist coordinates and allow secure updates from mobile app.

ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS current_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS current_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.update_therapist_live_location(
  p_user_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_location_updated_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'latitude/longitude are required';
  END IF;
  IF p_latitude < -90 OR p_latitude > 90 THEN
    RAISE EXCEPTION 'latitude must be in [-90, 90]';
  END IF;
  IF p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'longitude must be in [-180, 180]';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role = 'therapist'
  ) THEN
    RAISE EXCEPTION 'user % is not therapist', p_user_id;
  END IF;

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
    is_available,
    current_latitude,
    current_longitude,
    location_updated_at
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
    COALESCE((SELECT t.is_available FROM public.therapists t WHERE t.id = p.id), true),
    p_latitude,
    p_longitude,
    COALESCE(p_location_updated_at, now())
  FROM public.profiles p
  WHERE p.id = p_user_id
  ON CONFLICT (id) DO UPDATE
  SET
    current_latitude = EXCLUDED.current_latitude,
    current_longitude = EXCLUDED.current_longitude,
    location_updated_at = EXCLUDED.location_updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_therapist_live_location(
  UUID,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TIMESTAMPTZ
) TO anon, authenticated, service_role;
