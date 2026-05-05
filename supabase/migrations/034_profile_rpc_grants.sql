-- Quyền gọi RPC hồ sơ từ app (anon) — cần cho upsert sau đăng ký, đọc profile theo id.
-- Yêu cầu: đã có function upsert_profile (028) và get_profile_by_uid (004+).

GRANT EXECUTE ON FUNCTION public.upsert_profile(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_profile_by_uid(uuid) TO anon, authenticated, service_role;
