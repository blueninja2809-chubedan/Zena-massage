-- Therapist work shifts: stores which 2-hour slots a therapist registers for each date.
create table if not exists public.therapist_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  display_name text not null default '',
  shift_date date not null,
  slots text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, shift_date)
);

-- Add user_name column if table already exists
do $$ begin
  alter table public.therapist_shifts add column if not exists display_name text not null default '';
exception when others then null;
end $$;

-- RLS: allow anon all (custom auth, no auth.uid())
alter table public.therapist_shifts enable row level security;

drop policy if exists "Users can read own shifts" on public.therapist_shifts;
drop policy if exists "Users can insert own shifts" on public.therapist_shifts;
drop policy if exists "Users can update own shifts" on public.therapist_shifts;
drop policy if exists "Users can delete own shifts" on public.therapist_shifts;
drop policy if exists "Allow anon all on therapist_shifts" on public.therapist_shifts;
create policy "Allow anon all on therapist_shifts"
  on public.therapist_shifts for all
  using (true) with check (true);

-- Upsert function: save shifts for a specific date
drop function if exists public.upsert_therapist_shifts(uuid, date, text[], text);
drop function if exists public.upsert_therapist_shifts(uuid, date, text[]);
create or replace function public.upsert_therapist_shifts(
  p_user_id uuid,
  p_shift_date date,
  p_slots text[],
  p_display_name text default ''
) returns void as $$
declare
  v_name text;
begin
  -- Auto-lookup display_name from profiles if not provided
  select coalesce(nullif(p_display_name, ''), p.display_name, p.phone_number, '')
    into v_name
    from public.profiles p
    where p.id = p_user_id;
  if v_name is null then
    v_name := coalesce(nullif(p_display_name, ''), '');
  end if;

  insert into public.therapist_shifts (user_id, display_name, shift_date, slots, updated_at)
  values (p_user_id, v_name, p_shift_date, p_slots, now())
  on conflict (user_id, shift_date)
  do update set slots = p_slots, display_name = v_name, updated_at = now();
end;
$$ language plpgsql security definer;

-- Backfill display_name for existing rows
update public.therapist_shifts ts
  set display_name = coalesce(p.display_name, p.phone_number, '')
  from public.profiles p
  where ts.user_id = p.id
    and (ts.display_name is null or ts.display_name = '');

-- Get shifts for a user within a date range
create or replace function public.get_therapist_shifts(
  p_user_id uuid,
  p_from_date date,
  p_to_date date
) returns table(shift_date date, slots text[]) as $$
begin
  return query
    select ts.shift_date, ts.slots
    from public.therapist_shifts ts
    where ts.user_id = p_user_id
      and ts.shift_date between p_from_date and p_to_date
    order by ts.shift_date;
end;
$$ language plpgsql security definer;
