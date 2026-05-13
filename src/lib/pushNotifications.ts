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
  const resp = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
  if (__DEV__) {
    const result = await resp.json().catch(() => null);
    console.log('[Push] Expo API response:', JSON.stringify(result));
  }
}

/** Fetch push token for a single user — uses SECURITY DEFINER RPC to bypass RLS. */
async function fetchPushToken(userId: string): Promise<string | null> {
  // Try SECURITY DEFINER RPC first (bypasses table-level permission issues)
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_push_tokens_for_users', {
    p_user_ids: [userId],
  });
  if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
    const token = rpcData[0]?.push_token;
    return typeof token === 'string' && token.length > 0 ? token : null;
  }

  // Fallback: direct table query (works when GRANT SELECT on profiles is in place)
  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', userId)
    .maybeSingle();
  return typeof profile?.push_token === 'string' && profile.push_token.length > 0
    ? profile.push_token
    : null;
}

/** Fetch push tokens for multiple users — uses SECURITY DEFINER RPC. */
async function fetchPushTokens(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];

  // Try SECURITY DEFINER RPC first
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_push_tokens_for_users', {
    p_user_ids: userIds,
  });
  if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
    return rpcData
      .map((r: { push_token?: unknown }) => r.push_token)
      .filter((t): t is string => typeof t === 'string' && t.length > 0);
  }

  // Fallback: direct table query
  const { data: profiles } = await supabase
    .from('profiles')
    .select('push_token')
    .in('id', userIds)
    .not('push_token', 'is', null);
  if (!profiles) return [];
  return profiles
    .map((p) => p.push_token)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const token = await fetchPushToken(userId);
  if (token) {
    if (__DEV__) console.log('[Push] Sending to userId:', userId, 'token:', token.slice(0, 30));
    await sendPushNotification(token, title, body, data);
  } else {
    if (__DEV__) console.warn('[Push] No push_token for userId:', userId);
  }
}

export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (userIds.length === 0) return;

  const tokens = await fetchPushTokens(userIds);
  if (tokens.length === 0) {
    if (__DEV__) console.warn('[Push] No push tokens found for', userIds.length, 'users');
    return;
  }

  const channelId = expoChannelForData(data);
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
