-- Cho app khách đọc toàn bộ ca trong một ngày (khớp user_id với therapists.id / profiles.id).
-- SECURITY DEFINER: tránh trường hợp client không thấy dòng ca dù RLS/policy khác biệt giữa môi trường.

create or replace function public.list_therapist_shifts_for_date(p_shift_date date)
returns table(user_id uuid, slots text[])
language sql
security definer
set search_path = public
stable
as $$
  select ts.user_id, ts.slots
  from public.therapist_shifts ts
  where ts.shift_date = p_shift_date;
$$;

grant execute on function public.list_therapist_shifts_for_date(date) to anon, authenticated, service_role;

alter function public.list_therapist_shifts_for_date(date) set search_path = public;
