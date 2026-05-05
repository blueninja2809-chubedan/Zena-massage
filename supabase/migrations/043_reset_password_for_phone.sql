-- Đặt lại mật khẩu theo SĐT — chỉ gọi từ sms-backend (service_role), sau khi đã xác thực OTP VietGuys.
CREATE OR REPLACE FUNCTION public.reset_password_for_phone(p_phone text, p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text;
  n int;
  pw text := nullif(trim(p_new_password), '');
BEGIN
  v_digits := regexp_replace(coalesce(trim(p_phone), ''), '\D', '', 'g');
  IF v_digits IS NULL OR length(v_digits) < 9 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;
  IF pw IS NULL OR length(pw) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'weak_password');
  END IF;

  UPDATE public.profiles p
  SET
    password_hash = extensions.crypt(pw, extensions.gen_salt('bf')),
    updated_at = now()
  WHERE regexp_replace(coalesce(p.phone_number, ''), '\D', '', 'g') = v_digits;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_password_for_phone(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_password_for_phone(text, text) TO service_role;
ALTER FUNCTION public.reset_password_for_phone(text, text) SET search_path = public;
