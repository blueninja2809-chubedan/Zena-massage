-- Ensure profile bio from app is persisted when using RPC upsert_profile.
CREATE OR REPLACE FUNCTION upsert_profile(p_data JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, phone_number, display_name, bio, gender, nationality,
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
    COALESCE(p_data->>'bio', ''),
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
    bio = EXCLUDED.bio,
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
