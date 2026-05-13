-- RPC: update_booking_status_rpc
-- Called by the app (KTV / admin) to persist a booking status change.
-- SECURITY DEFINER so custom-auth anon clients can update any booking row.

CREATE OR REPLACE FUNCTION public.update_booking_status_rpc(
  p_booking_id UUID,
  p_status     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings
  SET    status     = p_status,
         updated_at = now()
  WHERE  id = p_booking_id;
END;
$$;

ALTER FUNCTION public.update_booking_status_rpc(UUID, TEXT) SET search_path = public;

GRANT EXECUTE ON FUNCTION public.update_booking_status_rpc(UUID, TEXT) TO anon, authenticated;
