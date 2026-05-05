-- Backend RPC: khách huỷ đơn để Activity luôn nhận đúng trạng thái.
-- Idempotent: đơn đã cancelled trả true; completed thì không cho huỷ.
-- Ghi metadata vào payload: cancelledBy / cancelReason / cancelledAt.

create or replace function public.customer_cancel_booking(
  p_booking_id uuid,
  p_customer_user_id text default null,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_user_id text;
  v_payload jsonb;
  v_customer_payload_id text;
  v_reason text;
begin
  select
    b.status::text,
    coalesce(b.user_id::text, ''),
    coalesce(b.payload, '{}'::jsonb)
  into v_status, v_user_id, v_payload
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return false;
  end if;

  v_customer_payload_id := coalesce(v_payload->>'customerUserId', '');

  -- Nếu client truyền customer id, chỉ cho phép huỷ đúng đơn của customer đó.
  if p_customer_user_id is not null and btrim(p_customer_user_id) <> '' then
    if v_user_id <> btrim(p_customer_user_id) and v_customer_payload_id <> btrim(p_customer_user_id) then
      return false;
    end if;
  end if;

  -- Không cho huỷ đơn đã hoàn thành.
  if v_status = 'completed' then
    return false;
  end if;

  -- Đơn đã huỷ rồi vẫn coi là thành công (idempotent).
  if v_status = 'cancelled' then
    return true;
  end if;

  v_reason := coalesce(nullif(btrim(p_reason), ''), 'customer_cancelled');

  update public.bookings b
  set
    status = 'cancelled',
    updated_at = now(),
    payload = coalesce(b.payload, '{}'::jsonb) || jsonb_build_object(
      'status', 'cancelled',
      'cancelledBy', 'customer',
      'cancelReason', v_reason,
      'cancelledAt', now()
    )
  where b.id = p_booking_id;

  return true;
end;
$$;

grant execute on function public.customer_cancel_booking(uuid, text, text) to anon, authenticated, service_role;

alter function public.customer_cancel_booking(uuid, text, text) set search_path = public;
