-- Admin / client RPC: functions in 006 were SECURITY DEFINER but never granted EXECUTE
-- to anon/authenticated. Supabase JS then returns:
--   "permission denied for function update_user_role"
-- when the admin panel calls rpc('update_user_role', ...).

GRANT EXECUTE ON FUNCTION public.update_user_role(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_users_with_roles() TO anon, authenticated, service_role;

ALTER FUNCTION public.update_user_role(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.get_user_role(UUID) SET search_path = public;
ALTER FUNCTION public.list_users_with_roles() SET search_path = public;

-- 018_sync_therapists_from_profiles.sql adds trg_sync_therapist_from_profile (full sync).
-- 006_user_roles.sql also had trg_sync_therapist_on_role_change — redundant on role changes.
DROP TRIGGER IF EXISTS trg_sync_therapist_on_role_change ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_therapist_on_role_change();
