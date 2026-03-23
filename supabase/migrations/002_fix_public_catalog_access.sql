-- Fix catalog read access for anon/authenticated roles.
-- Run this in Supabase SQL Editor if app logs show:
-- "permission denied for table therapists/services/promotions"

grant usage on schema public to anon, authenticated;

grant select on table public.services to anon, authenticated;
grant select on table public.therapists to anon, authenticated;
grant select on table public.promotions to anon, authenticated;

alter table public.services enable row level security;
alter table public.therapists enable row level security;
alter table public.promotions enable row level security;

drop policy if exists services_public_read on public.services;
create policy services_public_read
on public.services
for select
to anon, authenticated
using (true);

drop policy if exists therapists_public_read on public.therapists;
create policy therapists_public_read
on public.therapists
for select
to anon, authenticated
using (true);

drop policy if exists promotions_public_read on public.promotions;
create policy promotions_public_read
on public.promotions
for select
to anon, authenticated
using (true);

-- Optional seed for empty catalogs (safe to run multiple times)
insert into public.services (
  name, name_en, description, description_en, category, icon, base_price, duration, rating, review_count, is_active
)
select
  'Massage Thu Gian', 'Relaxation Massage', 'Xoa diu cang thang, tai tao nang luong',
  'Relax and restore your energy', 'massage', '💆', 300000, 60, 4.8, 120, true
where not exists (select 1 from public.services);

insert into public.therapists (
  name, email, phone_number, gender, experience, specialties, hourly_rate, rating, review_count, is_available, languages, working_city
)
select
  'Nguyen Thi Huong', 'huong@gmail.com', '0912345678', 'female', 5, array['massage','spa'],
  250000, 4.8, 150, true, array['Vietnamese','English'], 'TP Ho Chi Minh'
where not exists (select 1 from public.therapists);

insert into public.promotions (
  code, description, discount_percent, max_discount_amount, min_order_amount, expiry_date, max_uses, current_uses, conditions, is_active
)
select
  'WELCOME50', 'Discount cho khach hang moi', 50, 150000, 0, '2027-12-31T23:59:59.000Z'::timestamptz,
  100, 0, array[]::text[], true
where not exists (select 1 from public.promotions where code = 'WELCOME50');
