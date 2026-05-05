-- Bảng riêng `cancelled_bookings` để Activity → tab "Đã huỷ" lấy lịch sử huỷ ổn định.
-- Lưu toàn bộ snapshot hoá đơn tại thời điểm huỷ + thời gian huỷ.

create extension if not exists pgcrypto;

create table if not exists public.cancelled_bookings (
  id uuid primary key default gen_random_uuid(),

  -- Tham chiếu đơn gốc (nếu có) để tránh ghi trùng.
  booking_id uuid,

  -- Khách: lưu cả authUid và phone để fallback khi đăng nhập bằng SĐT.
  customer_user_id text,
  customer_phone   text,
  customer_name    text,
  customer_email   text,

  -- KTV được nhắm đặt lúc huỷ.
  therapist_id     text,
  therapist_name   text,
  therapist_avatar text,

  -- Hoá đơn snapshot.
  service          text,
  date             text,
  time             text,
  address          text,
  price            numeric(14, 2) default 0,
  payment_method   text,

  -- Thông tin huỷ.
  cancel_reason    text,
  cancelled_by     text,         -- 'customer' | 'system' | 'therapist'
  cancelled_at     timestamptz   not null default now(),

  -- Toàn bộ payload để có thể "Đặt lại" y hệt + render chi tiết.
  payload          jsonb         not null default '{}'::jsonb,

  created_at       timestamptz   not null default now()
);

-- Tránh ghi trùng cùng 1 booking_id (idempotent khi RPC bị retry).
create unique index if not exists cancelled_bookings_booking_id_uniq
  on public.cancelled_bookings(booking_id)
  where booking_id is not null;

create index if not exists cancelled_bookings_customer_user_id_idx
  on public.cancelled_bookings(customer_user_id);
create index if not exists cancelled_bookings_customer_phone_idx
  on public.cancelled_bookings(customer_phone);
create index if not exists cancelled_bookings_cancelled_at_idx
  on public.cancelled_bookings(cancelled_at desc);

alter table public.cancelled_bookings enable row level security;

-- Cho phép server-side / RPC SECURITY DEFINER thao tác. Client không truy cập trực tiếp bảng,
-- chỉ qua RPC để đảm bảo verify customer.
drop policy if exists cancelled_bookings_service_role_all on public.cancelled_bookings;
create policy cancelled_bookings_service_role_all
  on public.cancelled_bookings
  for all
  to service_role
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: record_cancelled_booking
--   Ghi 1 đơn huỷ vào bảng. Idempotent theo booking_id (nếu đã có thì update).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_cancelled_booking(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_existing   uuid;
  v_new_id     uuid;
  v_price      numeric;
begin
  if p_payload is null then
    raise exception 'record_cancelled_booking: payload is null';
  end if;

  begin
    v_booking_id := nullif(p_payload->>'bookingId', '')::uuid;
  exception
    when others then
      v_booking_id := null;
  end;

  begin
    v_price := coalesce((p_payload->>'price')::numeric, 0);
  exception
    when others then
      v_price := 0;
  end;

  if v_booking_id is not null then
    select id into v_existing
    from public.cancelled_bookings
    where booking_id = v_booking_id
    limit 1;

    if v_existing is not null then
      update public.cancelled_bookings cb
      set
        customer_user_id = coalesce(nullif(p_payload->>'customerUserId', ''), cb.customer_user_id),
        customer_phone   = coalesce(nullif(p_payload->>'customerPhone',   ''), cb.customer_phone),
        customer_name    = coalesce(nullif(p_payload->>'customerName',    ''), cb.customer_name),
        customer_email   = coalesce(nullif(p_payload->>'customerEmail',   ''), cb.customer_email),
        therapist_id     = coalesce(nullif(p_payload->>'therapistId',     ''), cb.therapist_id),
        therapist_name   = coalesce(nullif(p_payload->>'therapistName',   ''), cb.therapist_name),
        therapist_avatar = coalesce(nullif(p_payload->>'therapistAvatar', ''), cb.therapist_avatar),
        service          = coalesce(nullif(p_payload->>'service',         ''), cb.service),
        date             = coalesce(nullif(p_payload->>'date',            ''), cb.date),
        time             = coalesce(nullif(p_payload->>'time',            ''), cb.time),
        address          = coalesce(nullif(p_payload->>'address',         ''), cb.address),
        price            = case when v_price > 0 then v_price else cb.price end,
        payment_method   = coalesce(nullif(p_payload->>'paymentMethod',   ''), cb.payment_method),
        cancel_reason    = coalesce(nullif(p_payload->>'cancelReason',    ''), cb.cancel_reason),
        cancelled_by     = coalesce(nullif(p_payload->>'cancelledBy',     ''), cb.cancelled_by),
        payload          = coalesce(cb.payload, '{}'::jsonb) || p_payload
      where cb.id = v_existing;
      return v_existing;
    end if;
  end if;

  insert into public.cancelled_bookings(
    booking_id,
    customer_user_id,
    customer_phone,
    customer_name,
    customer_email,
    therapist_id,
    therapist_name,
    therapist_avatar,
    service,
    date,
    time,
    address,
    price,
    payment_method,
    cancel_reason,
    cancelled_by,
    cancelled_at,
    payload
  )
  values (
    v_booking_id,
    nullif(p_payload->>'customerUserId', ''),
    nullif(p_payload->>'customerPhone',   ''),
    nullif(p_payload->>'customerName',    ''),
    nullif(p_payload->>'customerEmail',   ''),
    nullif(p_payload->>'therapistId',     ''),
    nullif(p_payload->>'therapistName',   ''),
    nullif(p_payload->>'therapistAvatar', ''),
    nullif(p_payload->>'service',         ''),
    nullif(p_payload->>'date',            ''),
    nullif(p_payload->>'time',            ''),
    nullif(p_payload->>'address',         ''),
    v_price,
    nullif(p_payload->>'paymentMethod',   ''),
    coalesce(nullif(p_payload->>'cancelReason', ''), 'customer_cancelled'),
    coalesce(nullif(p_payload->>'cancelledBy',  ''), 'customer'),
    coalesce(
      (p_payload->>'cancelledAt')::timestamptz,
      now()
    ),
    p_payload
  )
  returning id into v_new_id;

  return v_new_id;
exception
  when unique_violation then
    -- Race khi cùng 1 booking_id được insert song song — coi như đã ghi.
    select id into v_existing from public.cancelled_bookings where booking_id = v_booking_id limit 1;
    return v_existing;
end;
$$;

grant execute on function public.record_cancelled_booking(jsonb) to anon, authenticated, service_role;
alter function public.record_cancelled_booking(jsonb) set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: list_customer_cancelled_bookings
--   Trả về tối đa N đơn huỷ gần nhất của 1 khách (match user_id hoặc phone).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.list_customer_cancelled_bookings(
  p_customer_user_id text default null,
  p_customer_phone   text default null,
  p_limit            int  default 50
)
returns setof public.cancelled_bookings
language sql
security definer
stable
set search_path = public
as $$
  select *
  from public.cancelled_bookings
  where
    (
      (p_customer_user_id is not null and btrim(p_customer_user_id) <> ''
        and customer_user_id = btrim(p_customer_user_id))
      or
      (p_customer_phone is not null and btrim(p_customer_phone) <> ''
        and customer_phone = btrim(p_customer_phone))
    )
  order by cancelled_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.list_customer_cancelled_bookings(text, text, int)
  to anon, authenticated, service_role;
alter function public.list_customer_cancelled_bookings(text, text, int) set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- Cập nhật RPC customer_cancel_booking (045) để tự ghi vào cancelled_bookings.
-- Vẫn giữ idempotent + verify owner như bản trước.
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_snapshot jsonb;
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

  if p_customer_user_id is not null and btrim(p_customer_user_id) <> '' then
    if v_user_id <> btrim(p_customer_user_id) and v_customer_payload_id <> btrim(p_customer_user_id) then
      return false;
    end if;
  end if;

  if v_status = 'completed' then
    return false;
  end if;

  v_reason := coalesce(nullif(btrim(p_reason), ''), 'customer_cancelled');

  if v_status <> 'cancelled' then
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
  end if;

  -- Ghi snapshot vào cancelled_bookings (idempotent theo booking_id).
  v_snapshot := jsonb_build_object(
    'bookingId',       p_booking_id::text,
    'customerUserId',  coalesce(v_payload->>'customerUserId', v_user_id),
    'customerPhone',   v_payload->>'customerPhone',
    'customerName',    v_payload->>'customerName',
    'customerEmail',   v_payload->>'customerEmail',
    'therapistId',     v_payload->>'therapistId',
    'therapistName',   v_payload->>'therapistName',
    'therapistAvatar', v_payload->>'therapistAvatar',
    'service',         v_payload->>'service',
    'date',            v_payload->>'date',
    'time',            v_payload->>'time',
    'address',         v_payload->>'address',
    'price',           coalesce(v_payload->>'price', '0'),
    'paymentMethod',   v_payload->>'paymentMethod',
    'cancelReason',    v_reason,
    'cancelledBy',     'customer',
    'cancelledAt',     now(),
    'sourcePayload',   v_payload
  );

  perform public.record_cancelled_booking(v_snapshot);

  return true;
end;
$$;

grant execute on function public.customer_cancel_booking(uuid, text, text) to anon, authenticated, service_role;
alter function public.customer_cancel_booking(uuid, text, text) set search_path = public;
