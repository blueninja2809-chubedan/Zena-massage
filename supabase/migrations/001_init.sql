-- Enable helper extension for UUID generation.
create extension if not exists pgcrypto;

-- Profiles: 1-1 with auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone_number text not null unique,
  display_name text,
  gender text,
  nationality text,
  avatar_uri text,
  role text not null default 'customer',
  working_city text,
  service_images text[] not null default '{}',
  services text[] not null default '{}',
  is_vip_member boolean not null default false,
  vip_plan_id text,
  vip_expires_at timestamptz,
  partner_application_id uuid,
  partner_application_status text not null default 'none',
  partner_role_approved_at timestamptz,
  partner_role_notice_seen_at timestamptz,
  selected_city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  description text,
  description_en text,
  category text not null default 'massage',
  icon text default '💆',
  base_price numeric not null default 0,
  duration integer not null default 60,
  image text default '',
  rating numeric not null default 5,
  review_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.therapists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone_number text,
  email text,
  gender text default 'female',
  avatar text default '',
  photos text[] not null default '{}',
  bio text default '',
  bio_en text default '',
  specialties text[] not null default '{}',
  experience integer not null default 0,
  rating numeric not null default 5,
  review_count integer not null default 0,
  hourly_rate numeric not null default 0,
  distance_from_center numeric not null default 0,
  working_city text,
  is_available boolean not null default true,
  availability jsonb not null default '{}'::jsonb,
  languages text[] not null default '{}',
  certifications text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  discount_percent numeric not null default 0,
  max_discount_amount numeric not null default 0,
  min_order_amount numeric not null default 0,
  expiry_date timestamptz not null,
  max_uses integer not null default 0,
  current_uses integer not null default 0,
  conditions text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  phone_number text not null,
  status text not null default 'pending',
  image_moderation_status text not null default 'pending',
  reviewed_by_admin boolean not null default false,
  approved_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  therapist_id text,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  therapist_id text,
  service_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  is_read boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.therapists enable row level security;
alter table public.promotions enable row level security;
alter table public.partner_applications enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.addresses enable row level security;
alter table public.notifications enable row level security;

-- Read policies (public catalogs)
drop policy if exists services_public_read on public.services;
create policy services_public_read on public.services for select using (true);

drop policy if exists therapists_public_read on public.therapists;
create policy therapists_public_read on public.therapists for select using (true);

drop policy if exists promotions_public_read on public.promotions;
create policy promotions_public_read on public.promotions for select using (true);

-- Profiles policies
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles
for select using (auth.uid() = id);

drop policy if exists profiles_write_own on public.profiles;
create policy profiles_write_own on public.profiles
for all using (auth.uid() = id) with check (auth.uid() = id);

-- Partner applications
drop policy if exists partner_app_read_own on public.partner_applications;
create policy partner_app_read_own on public.partner_applications
for select using (auth.uid() = user_id);

drop policy if exists partner_app_insert_auth on public.partner_applications;
create policy partner_app_insert_auth on public.partner_applications
for insert with check (auth.uid() = user_id);

-- Bookings / reviews / addresses / notifications (owner-scoped by user_id text)
drop policy if exists bookings_read_own on public.bookings;
create policy bookings_read_own on public.bookings
for select using (coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', ''));

drop policy if exists bookings_write_own on public.bookings;
create policy bookings_write_own on public.bookings
for all using (coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', ''))
with check (coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', ''));

drop policy if exists reviews_read_all on public.reviews;
create policy reviews_read_all on public.reviews for select using (true);

drop policy if exists reviews_write_own on public.reviews;
create policy reviews_write_own on public.reviews
for all using (coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', ''))
with check (coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', ''));

drop policy if exists addresses_read_own on public.addresses;
create policy addresses_read_own on public.addresses
for select using (coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', ''));

drop policy if exists addresses_write_own on public.addresses;
create policy addresses_write_own on public.addresses
for all using (coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', ''))
with check (coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', ''));

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications
for select using (coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', ''));

drop policy if exists notifications_write_own on public.notifications;
create policy notifications_write_own on public.notifications
for all using (coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', ''))
with check (coalesce(user_id, '') = coalesce(auth.jwt()->>'phone', ''));
