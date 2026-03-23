-- =============================================
-- USER ROLES: ENUM dropdown + auto-sync therapists
-- Roles: 'customer' (default), 'therapist'
-- =============================================

-- 1) Create ENUM type for role (dropdown in Supabase Table Editor)
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('customer', 'therapist');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Fix invalid values, then convert column from TEXT to ENUM
UPDATE public.profiles SET role = 'customer' WHERE role IS NULL OR role NOT IN ('customer', 'therapist');
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ALTER COLUMN role DROP DEFAULT,
  ALTER COLUMN role TYPE public.user_role USING role::public.user_role,
  ALTER COLUMN role SET DEFAULT 'customer'::public.user_role,
  ALTER COLUMN role SET NOT NULL;

-- 3) Trigger: auto create/update therapists row when role → 'therapist'
CREATE OR REPLACE FUNCTION sync_therapist_on_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Role changed to therapist → upsert into therapists
  IF NEW.role = 'therapist' THEN
    INSERT INTO public.therapists (id, name, phone_number, email, gender, avatar, working_city, created_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.display_name, ''),
      COALESCE(NEW.phone_number, ''),
      COALESCE(NEW.email, ''),
      COALESCE(NEW.gender, 'female'),
      COALESCE(NEW.avatar_uri, ''),
      NEW.working_city,
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = COALESCE(NEW.display_name, therapists.name),
      phone_number = COALESCE(NEW.phone_number, therapists.phone_number),
      email = COALESCE(NEW.email, therapists.email),
      gender = COALESCE(NEW.gender, therapists.gender),
      avatar = COALESCE(NEW.avatar_uri, therapists.avatar),
      working_city = COALESCE(NEW.working_city, therapists.working_city);
  END IF;

  -- Role changed from therapist to customer → mark therapist unavailable
  IF OLD.role = 'therapist' AND NEW.role = 'customer' THEN
    UPDATE public.therapists SET is_available = false WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_therapist_on_role_change ON public.profiles;
CREATE TRIGGER trg_sync_therapist_on_role_change
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_therapist_on_role_change();

-- 4) RPC: Update a user's role (admin use from Supabase Dashboard / server)
CREATE OR REPLACE FUNCTION update_user_role(p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_role NOT IN ('customer', 'therapist') THEN
    RAISE EXCEPTION 'Invalid role: %. Must be customer or therapist', p_role;
  END IF;

  UPDATE public.profiles
  SET role = p_role::public.user_role,
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;
END;
$$;

-- 5) RPC: Get a user's current role
CREATE OR REPLACE FUNCTION get_user_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN v_role;
END;
$$;

-- 6) RPC: List all users with their roles (admin overview)
CREATE OR REPLACE FUNCTION list_users_with_roles()
RETURNS TABLE(
  user_id UUID,
  phone_number TEXT,
  display_name TEXT,
  role TEXT,
  partner_application_status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.phone_number, p.display_name, p.role::TEXT,
         p.partner_application_status, p.created_at
  FROM public.profiles p
  ORDER BY p.created_at DESC;
END;
$$;

-- 7) Patch upsert_profile to cast role TEXT → ENUM
CREATE OR REPLACE FUNCTION upsert_profile(p_data JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, phone_number, display_name, gender, nationality,
    avatar_uri, role, working_city, service_images, services,
    is_vip_member, vip_plan_id, vip_expires_at,
    partner_application_id, partner_application_status,
    partner_role_approved_at, partner_role_notice_seen_at,
    selected_city, created_at, updated_at
  ) VALUES (
    (p_data->>'id')::uuid,
    NULLIF(p_data->>'email', ''),
    NULLIF(p_data->>'phone_number', ''),
    COALESCE(p_data->>'display_name', ''),
    p_data->>'gender',
    p_data->>'nationality',
    p_data->>'avatar_uri',
    COALESCE(p_data->>'role', 'customer')::public.user_role,
    p_data->>'working_city',
    COALESCE((SELECT array_agg(x)::text[] FROM jsonb_array_elements_text(p_data->'service_images') x), '{}'),
    COALESCE((SELECT array_agg(x)::text[] FROM jsonb_array_elements_text(p_data->'services') x), '{}'),
    COALESCE((p_data->>'is_vip_member')::boolean, false),
    p_data->>'vip_plan_id',
    CASE WHEN p_data->>'vip_expires_at' IS NOT NULL THEN (p_data->>'vip_expires_at')::timestamptz END,
    CASE WHEN p_data->>'partner_application_id' IS NOT NULL THEN (p_data->>'partner_application_id')::uuid END,
    COALESCE(p_data->>'partner_application_status', 'none'),
    CASE WHEN p_data->>'partner_role_approved_at' IS NOT NULL THEN (p_data->>'partner_role_approved_at')::timestamptz END,
    CASE WHEN p_data->>'partner_role_notice_seen_at' IS NOT NULL THEN (p_data->>'partner_role_notice_seen_at')::timestamptz END,
    p_data->>'selected_city',
    COALESCE((p_data->>'created_at')::timestamptz, now()),
    COALESCE((p_data->>'updated_at')::timestamptz, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(EXCLUDED.email, ''), profiles.email),
    phone_number = COALESCE(NULLIF(EXCLUDED.phone_number, ''), profiles.phone_number),
    display_name = EXCLUDED.display_name,
    gender = EXCLUDED.gender,
    nationality = EXCLUDED.nationality,
    avatar_uri = EXCLUDED.avatar_uri,
    role = EXCLUDED.role,
    working_city = EXCLUDED.working_city,
    service_images = EXCLUDED.service_images,
    services = EXCLUDED.services,
    is_vip_member = EXCLUDED.is_vip_member,
    vip_plan_id = EXCLUDED.vip_plan_id,
    vip_expires_at = EXCLUDED.vip_expires_at,
    partner_application_id = EXCLUDED.partner_application_id,
    partner_application_status = EXCLUDED.partner_application_status,
    partner_role_approved_at = EXCLUDED.partner_role_approved_at,
    partner_role_notice_seen_at = EXCLUDED.partner_role_notice_seen_at,
    selected_city = EXCLUDED.selected_city,
    updated_at = now();
END;
$$;
