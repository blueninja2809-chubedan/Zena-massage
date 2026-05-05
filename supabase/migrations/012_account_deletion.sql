-- Account deletion: purge app data then remove auth identity (OAuth) or app_users (phone).

CREATE OR REPLACE FUNCTION public.purge_user_data(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text TEXT := p_user_id::text;
BEGIN
  DELETE FROM public.payos_booking_orders
  WHERE user_id = p_user_id
     OR booking_id IN (SELECT id FROM public.bookings WHERE user_id = v_text);

  DELETE FROM public.chat_messages
  WHERE room_id IN (
    SELECT id FROM public.chat_rooms
    WHERE customer_id = v_text OR therapist_id = v_text
  );

  DELETE FROM public.chat_rooms
  WHERE customer_id = v_text OR therapist_id = v_text;

  DELETE FROM public.bookings WHERE user_id = v_text;
  DELETE FROM public.reviews WHERE user_id = v_text;
  DELETE FROM public.addresses WHERE user_id = v_text;
  DELETE FROM public.notifications WHERE user_id = v_text;
  DELETE FROM public.therapist_shifts WHERE user_id = p_user_id;
  DELETE FROM public.withdrawal_requests WHERE user_id = p_user_id;
  DELETE FROM public.wallets WHERE user_id = p_user_id;
  DELETE FROM public.partner_applications WHERE user_id = p_user_id;
  DELETE FROM public.therapists WHERE id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
END;
$$;

-- Google / Apple: session must match; removes public data then auth user.
CREATE OR REPLACE FUNCTION public.delete_my_oauth_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID := auth.uid();
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.purge_user_data(v_id);
  DELETE FROM auth.users WHERE id = v_id;
END;
$$;

-- Phone + password: verifies against app_users, then purge + remove app_users row.
CREATE OR REPLACE FUNCTION public.delete_my_phone_account(p_phone TEXT, p_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_phone TEXT := regexp_replace(trim(COALESCE(p_phone, '')), '\s', '', 'g');
BEGIN
  IF v_phone = '' OR p_password IS NULL OR length(trim(p_password)) = 0 THEN
    RAISE EXCEPTION 'invalid_credentials' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.id INTO v_id
  FROM public.app_users u
  WHERE u.phone_number = v_phone
    AND u.password_hash = crypt(p_password, u.password_hash);

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'invalid_credentials' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.purge_user_data(v_id);
  DELETE FROM public.app_users WHERE id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_data(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_oauth_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_phone_account(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_my_oauth_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_phone_account(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_my_phone_account(TEXT, TEXT) TO authenticated;
