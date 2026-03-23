-- Email auth: add email to profiles, make phone_number nullable.
-- For email signup: email required, phone optional (filled in profile step).

alter table public.profiles
  add column if not exists email text unique;

alter table public.profiles
  alter column phone_number drop not null;

-- Allow existing rows: phone_number unique stays; email unique for new signups.
-- Backfill email from auth.users for existing phone-based users (optional).
-- create or replace function public.handle_new_user()
-- returns trigger as $$
-- begin
--   insert into public.profiles (id, email, phone_number, role, partner_application_status, created_at, updated_at)
--   values (
--     new.id,
--     coalesce(new.email, ''),
--     coalesce(new.phone, ''),
--     'customer',
--     'none',
--     now(),
--     now()
--   )
--   on conflict (id) do nothing;
--   return new;
-- end;
-- $$ language plpgsql security definer;

-- Trigger: create profile when user signs up with email
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, phone_number, role, partner_application_status, created_at, updated_at)
  values (
    new.id,
    nullif(trim(new.email), ''),
    nullif(trim(new.phone), ''),
    'customer',
    'none',
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: bookings, reviews, addresses, notifications use user_id (text).
-- For email auth, user_id should store auth.uid()::text.
-- Update policies to allow auth.uid()::text = user_id (for authenticated users).
drop policy if exists bookings_read_own on public.bookings;
create policy bookings_read_own on public.bookings
for select using (
  coalesce(user_id, '') = coalesce(auth.uid()::text, '')
  or coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', '')
);

drop policy if exists bookings_write_own on public.bookings;
create policy bookings_write_own on public.bookings
for all using (
  coalesce(user_id, '') = coalesce(auth.uid()::text, '')
  or coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', '')
) with check (
  coalesce(user_id, '') = coalesce(auth.uid()::text, '')
  or coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', '')
);

drop policy if exists reviews_write_own on public.reviews;
create policy reviews_write_own on public.reviews
for all using (
  coalesce(user_id, '') = coalesce(auth.uid()::text, '')
  or coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', '')
) with check (
  coalesce(user_id, '') = coalesce(auth.uid()::text, '')
  or coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', '')
);

drop policy if exists addresses_read_own on public.addresses;
create policy addresses_read_own on public.addresses
for select using (
  coalesce(user_id, '') = coalesce(auth.uid()::text, '')
  or coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', '')
);

drop policy if exists addresses_write_own on public.addresses;
create policy addresses_write_own on public.addresses
for all using (
  coalesce(user_id, '') = coalesce(auth.uid()::text, '')
  or coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', '')
) with check (
  coalesce(user_id, '') = coalesce(auth.uid()::text, '')
  or coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', '')
);

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications
for select using (
  coalesce(user_id, '') = coalesce(auth.uid()::text, '')
  or coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', '')
);

drop policy if exists notifications_write_own on public.notifications;
create policy notifications_write_own on public.notifications
for all using (
  coalesce(user_id, '') = coalesce(auth.uid()::text, '')
  or coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', '')
) with check (
  coalesce(user_id, '') = coalesce(auth.uid()::text, '')
  or coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', '')
);
