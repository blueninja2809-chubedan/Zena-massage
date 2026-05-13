-- ============================================================
-- Fix: Grant anon/authenticated SELECT on profiles
-- (RLS policy "Allow anon all on profiles" exists but table-level
--  GRANT was missing → "permission denied for table profiles")
-- ============================================================

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.profiles TO authenticated;

-- Also grant UPDATE so save_push_token RPC can write the token back
-- (RPC is SECURITY DEFINER so it runs as owner, but explicit grant is good practice)
GRANT UPDATE (push_token, updated_at) ON public.profiles TO anon;
GRANT UPDATE (push_token, updated_at) ON public.profiles TO authenticated;

-- ============================================================
-- SECURITY DEFINER RPC: get push tokens for a list of user IDs
-- Called from client to avoid direct table access requirement.
-- ============================================================
CREATE OR REPLACE FUNCTION get_push_tokens_for_users(p_user_ids UUID[])
RETURNS TABLE(user_id UUID, push_token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT p.id, p.push_token
    FROM public.profiles p
    WHERE p.id = ANY(p_user_ids)
      AND p.push_token IS NOT NULL
      AND p.push_token <> '';
END;
$$;

GRANT EXECUTE ON FUNCTION get_push_tokens_for_users(UUID[]) TO anon;
GRANT EXECUTE ON FUNCTION get_push_tokens_for_users(UUID[]) TO authenticated;

-- ============================================================
-- SECURITY DEFINER RPC: get therapist profile IDs + cities
-- (for city-based push broadcasting)
-- ============================================================
CREATE OR REPLACE FUNCTION get_therapists_with_push_tokens()
RETURNS TABLE(id UUID, working_city TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT p.id, p.working_city
    FROM public.profiles p
    WHERE p.role = 'therapist'
      AND p.push_token IS NOT NULL
      AND p.push_token <> '';
END;
$$;

GRANT EXECUTE ON FUNCTION get_therapists_with_push_tokens() TO anon;
GRANT EXECUTE ON FUNCTION get_therapists_with_push_tokens() TO authenticated;
