-- Keep therapist virtual data synced between therapists and profiles.
-- Uses the same IDs seeded in 013_seed_virtual_therapists.sql.

insert into public.profiles (
  id,
  email,
  phone_number,
  display_name,
  gender,
  avatar_uri,
  role,
  working_city,
  services,
  partner_application_status,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'linh.nguyen@zena.local',
    '0901000001',
    'Linh Nguyen',
    'female',
    'https://ui-avatars.com/api/?name=Linh+Nguyen&background=F2E8FF&color=6B21A8&size=256',
    'therapist',
    'Ho Chi Minh',
    '{"Massage Thu Gian","Massage Co Vai Gay"}',
    'approved',
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'mai.tran@zena.local',
    '0901000002',
    'Mai Tran',
    'female',
    'https://ui-avatars.com/api/?name=Mai+Tran&background=FFE7D6&color=9A3412&size=256',
    'therapist',
    'Ho Chi Minh',
    '{"Hot Stone","Deep Tissue","Spa Thu Gian"}',
    'approved',
    now(),
    now()
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'bao.le@zena.local',
    '0901000003',
    'Bao Le',
    'male',
    'https://ui-avatars.com/api/?name=Bao+Le&background=DBEAFE&color=1D4ED8&size=256',
    'therapist',
    'Ho Chi Minh',
    '{"Sports Massage","Body Recovery"}',
    'approved',
    now(),
    now()
  )
on conflict (id) do update
set
  email = excluded.email,
  phone_number = excluded.phone_number,
  display_name = excluded.display_name,
  gender = excluded.gender,
  avatar_uri = excluded.avatar_uri,
  role = excluded.role,
  working_city = excluded.working_city,
  services = excluded.services,
  partner_application_status = excluded.partner_application_status,
  updated_at = now();
