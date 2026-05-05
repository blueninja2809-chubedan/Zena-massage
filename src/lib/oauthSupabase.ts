import type { UserData } from '@/contexts/UserContext';
import { supabase } from '@/lib/supabase';
import { getUserProfileByUid, upsertUserProfile } from '@/lib/supabaseService';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

/** Phải khớp URL bạn thêm trong Supabase → Authentication → URL Configuration (Redirect URLs). */
export function getGoogleOAuthRedirectUri(): string {
  return Linking.createURL('', { scheme: 'massagenow' });
}

function parseOAuthCallbackParams(href: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const url = new URL(href);
    if (url.hash?.startsWith('#')) {
      new URLSearchParams(url.hash.slice(1)).forEach((value, key) => {
        result[key] = value;
      });
    }
    url.searchParams.forEach((value, key) => {
      result[key] = value;
    });
  } catch {
    /* invalid callback url */
  }
  return result;
}

/**
 * Google qua Supabase Hosted OAuth + in-app browser (không dùng expo-auth-session/Google → tránh ExpoCrypto).
 */
export async function signInWithGoogleOAuthBrowser(): Promise<{
  error: Error | null;
  cancelled: boolean;
}> {
  const redirectTo = getGoogleOAuthRedirectUri();
  const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (oauthErr) return { error: oauthErr, cancelled: false };
  if (!data?.url) return { error: new Error('No OAuth URL from Supabase'), cancelled: false };

  const browser = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (browser.type !== 'success' || !browser.url) {
    if (browser.type === 'cancel' || browser.type === 'dismiss') {
      return { error: null, cancelled: true };
    }
    return { error: new Error('OAuth browser closed without a callback URL'), cancelled: false };
  }

  const params = parseOAuthCallbackParams(browser.url);
  if (params.error) {
    return {
      error: new Error(params.error_description || params.error),
      cancelled: false,
    };
  }

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    return { error: error ?? null, cancelled: false };
  }

  const { access_token, refresh_token } = params;
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    return { error: error ?? null, cancelled: false };
  }

  return { error: new Error('No code or tokens in OAuth callback URL'), cancelled: false };
}

export async function signInWithAppleIdentityToken(identityToken: string) {
  return supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
  });
}

/** Sau khi Supabase Auth session có — tạo / đọc profile và trả UserData. */
export async function finalizeOAuthUserProfile(): Promise<UserData | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const u = session.user;
  let profile = await getUserProfileByUid(u.id);
  if (!profile) {
    const meta = u.user_metadata as Record<string, unknown> | undefined;
    const nameFromMeta =
      (typeof meta?.full_name === 'string' && meta.full_name) ||
      (typeof meta?.name === 'string' && meta.name) ||
      '';
    const displayName = nameFromMeta || (u.email?.split('@')[0] ?? 'User');
    try {
      await upsertUserProfile({
        authUid: u.id,
        email: u.email ?? undefined,
        phoneNumber: '',
        displayName,
        createdAt: new Date().toISOString(),
        role: 'customer',
        partnerApplicationStatus: 'none',
      });
    } catch (e) {
      console.warn('[finalizeOAuthUserProfile] upsertUserProfile failed:', e);
    }
    profile = await getUserProfileByUid(u.id);
  }
  if (!profile) return null;
  return profile as unknown as UserData;
}

export function hasGoogleOAuthConfig(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}
