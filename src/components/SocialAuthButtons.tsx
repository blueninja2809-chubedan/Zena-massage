import { AppColors } from '@/constants/appColors';
import type { UserData } from '@/contexts/UserContext';
import {
    finalizeOAuthUserProfile,
    hasGoogleOAuthConfig,
    signInWithAppleIdentityToken,
    signInWithGoogleOAuthBrowser,
} from '@/lib/oauthSupabase';
import { FontAwesome5 } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

function getAuthErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    if (typeof o.message === 'string') return o.message;
    if (typeof o.msg === 'string') return o.msg;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

/** Supabase: Apple chưa bật / chưa lưu xong, hoặc gọi sai provider. */
function formatAppleSupabaseError(message: string, isEn: boolean): string {
  const m = message.trim();
  const appleOff =
    /not enabled/i.test(m) ||
    /unsupported provider/i.test(m) ||
    /provider is not enabled/i.test(m) ||
    /validation_failed/i.test(m) ||
    /appleid\.apple\.com/i.test(m);
  if (appleOff) {
    return isEn
      ? 'Apple Sign-In is not active on Supabase yet.\n\nIn Dashboard: Authentication → Providers → Apple — turn ON and Save with Client IDs + Secret Key (JWT). If you just edited settings, wait a few seconds and try again.\n\nDocs: https://supabase.com/docs/guides/auth/social-login/auth-apple'
      : '🍎 Apple Sign-In chưa được Supabase chấp nhận.\n\nVào Supabase: Authentication → Providers → Apple — bật Enable, điền Client IDs + Secret Key (JWT), bấm Save. Nếu vừa lưu, đợi vài giây rồi thử lại.\n\nHướng dẫn: https://supabase.com/docs/guides/auth/social-login/auth-apple';
  }
  return m;
}

const COLORS = {
  primaryDark: AppColors.primaryDark,
  border: AppColors.border,
  text: AppColors.text,
};

type Props = {
  isEn: boolean;
  onUserReady: (user: UserData) => Promise<void>;
};

export function SocialAuthButtons({ isEn, onUserReady }: Props) {
  const [busy, setBusy] = useState(false);

  const runAfterProfile = useCallback(async () => {
    const raw = await finalizeOAuthUserProfile();
    if (!raw) {
      Alert.alert(isEn ? 'Error' : 'Lỗi', isEn ? 'Could not load profile.' : 'Không tải được hồ sơ.');
      return;
    }
    await onUserReady(raw);
  }, [isEn, onUserReady]);

  /** Google: Supabase OAuth + in-app browser (không dùng expo-auth-session — tránh native ExpoCrypto / cần rebuild binary). */
  const onPressGoogle = async () => {
    if (!hasGoogleOAuthConfig()) {
      Alert.alert(
        isEn ? 'Configuration' : 'Cấu hình',
        isEn
          ? 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env'
          : 'Thêm EXPO_PUBLIC_SUPABASE_URL và EXPO_PUBLIC_SUPABASE_ANON_KEY vào .env',
      );
      return;
    }
    setBusy(true);
    try {
      const { error, cancelled } = await signInWithGoogleOAuthBrowser();
      if (cancelled) return;
      if (error) throw error;
      await runAfterProfile();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(
        isEn ? 'Google sign-in failed' : 'Đăng nhập Google thất bại',
        isEn
          ? `${msg}\n\nEnable Google on Supabase, add Callback URL in Google Cloud (Web client), and add app redirect URLs in Supabase.`
          : `${msg}\n\nBật Google trên Supabase, thêm Callback URL trong Google Cloud (Web client), và thêm redirect URL app trên Supabase.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const onPressApple = async () => {
    if (Platform.OS !== 'ios') return;
    if (!hasGoogleOAuthConfig()) {
      Alert.alert(
        isEn ? 'Configuration' : 'Cấu hình',
        isEn
          ? 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env'
          : 'Thêm EXPO_PUBLIC_SUPABASE_URL và EXPO_PUBLIC_SUPABASE_ANON_KEY vào .env',
      );
      return;
    }
    try {
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        Alert.alert(isEn ? 'Unavailable' : 'Không khả dụng', '');
        return;
      }
      setBusy(true);
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) throw new Error('No Apple identity token');
      const { error } = await signInWithAppleIdentityToken(cred.identityToken);
      if (error) throw error;
      await runAfterProfile();
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      const raw = getAuthErrorMessage(e);
      const msg = formatAppleSupabaseError(raw, isEn);
      Alert.alert(isEn ? 'Apple sign-in failed' : 'Đăng nhập Apple thất bại', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <TouchableOpacity
        style={[styles.btnGoogle, busy && styles.disabled]}
        onPress={() => void onPressGoogle()}
        disabled={busy}
        activeOpacity={0.9}
      >
        <FontAwesome5 name="google" size={18} color="#4285F4" />
        <Text style={styles.btnGoogleText}>{isEn ? 'Continue with Google' : 'Tiếp tục với Google'}</Text>
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <TouchableOpacity
          style={[styles.btnApple, busy && styles.disabled]}
          onPress={() => void onPressApple()}
          disabled={busy}
          activeOpacity={0.9}
        >
          <FontAwesome5 name="apple" size={20} color="#FFFFFF" />
          <Text style={styles.btnAppleText}>{isEn ? 'Continue with Apple' : 'Tiếp tục với Apple'}</Text>
        </TouchableOpacity>
      ) : null}

      {busy ? <ActivityIndicator style={{ marginTop: 10 }} color={COLORS.primaryDark} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btnGoogle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.95)',
    borderRadius: 16,
    paddingVertical: 15,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  btnGoogleText: { fontSize: 15, fontWeight: '700', color: COLORS.text, letterSpacing: 0.2 },
  btnApple: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingVertical: 15,
    marginBottom: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  btnAppleText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 },
  disabled: { opacity: 0.55 },
});
