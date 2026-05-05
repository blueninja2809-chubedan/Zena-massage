import { AppColors } from '@/constants/appColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { canUseAppFeatures } from '@/lib/session';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function RequireCustomerSession({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser();
  const { language } = useLanguage();
  const router = useRouter();
  const isEn = language === 'en';

  if (isLoading) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={AppColors.primaryDark} />
      </SafeAreaView>
    );
  }

  if (!canUseAppFeatures(user)) {
    const goHome = () => {
      router.replace('/');
    };
    const goSignIn = () => {
      router.replace('/(tabs)/account');
    };

    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <View style={styles.card}>
          <Text style={styles.title}>{isEn ? 'Sign in required' : 'Cần đăng nhập'}</Text>
          <Text style={styles.sub}>
            {isEn
              ? 'Create an account or sign in to book services, chat, view activity, and use the rest of the app.'
              : 'Vui lòng tạo tài khoản hoặc đăng nhập để đặt lịch, nhắn tin, xem hoạt động và dùng đầy đủ tính năng ứng dụng.'}
          </Text>
          <TouchableOpacity style={styles.btnPrimary} onPress={goSignIn} activeOpacity={0.85}>
            <Text style={styles.btnPrimaryText}>{isEn ? 'Sign in' : 'Đăng nhập'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={goHome} activeOpacity={0.85}>
            <Text style={styles.btnSecondaryText}>{isEn ? 'Back to home' : 'Về trang chủ'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: AppColors.bg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: AppColors.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: AppColors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  sub: {
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  btnPrimary: {
    backgroundColor: AppColors.primaryDark,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnSecondaryText: { color: AppColors.primaryDark, fontSize: 15, fontWeight: '600' },
});
