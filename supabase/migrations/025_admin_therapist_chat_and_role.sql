-- Add admin role support and persistent admin<->therapist chat rooms.

-- 1) Extend role enum with admin.
DO $$
BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Keep therapist sync trigger correct when role is changed away from therapist.
CREATE OR REPLACE FUNCTION sync_therapist_on_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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

  IF OLD.role = 'therapist' AND NEW.role <> 'therapist' THEN
    UPDATE public.therapists SET is_available = false WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Allow role update RPC to use admin.
CREATE OR REPLACE FUNCTION update_user_role(p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_role NOT IN ('customer', 'therapist', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %. Must be customer, therapist, or admin', p_role;
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

-- 4) Assign admin role for requested phone.
UPDATE public.profiles
SET role = 'admin'::public.user_role,
    updated_at = now()
WHERE regexp_replace(COALESCE(phone_number, ''), '\s+', '', 'g') = '0347121391';

-- 5) Add admin as valid sender_role in chat messages.
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_sender_role_check;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_sender_role_check
  CHECK (sender_role IN ('customer', 'therapist', 'system', 'admin'));

-- 6) Helper RPC: get/create persistent admin room with a therapist.
CREATE OR REPLACE FUNCTION admin_get_or_create_therapist_chat_room(
  p_admin_id TEXT,
  p_admin_name TEXT,
  p_therapist_id TEXT,
  p_therapist_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking_id TEXT;
  v_room_id UUID;
BEGIN
  v_booking_id := format('admin_chat_%s_%s', p_admin_id, p_therapist_id);
  v_room_id := get_or_create_chat_room(
    v_booking_id,
    p_admin_id,
    p_therapist_id,
    COALESCE(p_admin_name, 'Admin'),
    COALESCE(p_therapist_name, '')
  );
  RETURN v_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_or_create_therapist_chat_room TO anon, authenticated;
