import { supabase } from '@/lib/supabase';

function expoChannelForData(data?: Record<string, unknown>): string {
  const t = data?.type;
  if (t === 'booking' || t === 'job' || t === 'review') {
    return 'booking';
  }
  if (t === 'promotion') {
    return 'promotion';
  }
  return 'default';
}

/**
 * Send one push via Expo Push API (works from app or Edge Function payload shape).
 */
export async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const channelId = expoChannelForData(data);
  const message: Record<string, unknown> = {
    to: expoPushToken,
    sound: 'default',
    title,
    body,
    data: data ?? {},
    priority: 'high',
    channelId,
  };
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.push_token && typeof profile.push_token === 'string') {
    await sendPushNotification(profile.push_token, title, body, data);
  }
}

export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (userIds.length === 0) {
    return;
  }
  const { data: profiles } = await supabase
    .from('profiles')
    .select('push_token')
    .in('id', userIds)
    .not('push_token', 'is', null);

  if (!profiles || profiles.length === 0) {
    return;
  }

  const channelId = expoChannelForData(data);
  const tokens = profiles
    .map((p) => p.push_token)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);

  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default' as const,
    title,
    body,
    data: data ?? {},
    priority: 'high' as const,
    channelId,
  }));

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });
  }
}
