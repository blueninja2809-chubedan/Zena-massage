-- Expo push token for remote notifications (client writes on login).
alter table public.profiles add column if not exists push_token text;

comment on column public.profiles.push_token is 'ExponentPushToken[...] for expo-notifications';
