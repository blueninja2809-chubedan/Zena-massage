import { useLanguage } from '@/contexts/LanguageContext';
import { UserData, useUser } from '@/contexts/UserContext';
import { getLatestPartnerApplicationByUserId, signInUserAccountWithPhone } from '@/lib/supabaseService';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  primary: '#2196F3',
  primaryDark: '#1565C0',
  primaryLight: '#E3F2FD',
  bg: '#F0F6FF',
  card: '#FFFFFF',
  text: '#1A2B4A',
  muted: '#6B7D99',
  border: '#D4E4F7',
  inputBg: '#F5F9FF',
};

export type SignInScreenProps = {
  onBack: () => void;
  onNavigateSignUp: () => void;
};

export function SignInScreen({ onBack, onNavigateSignUp }: SignInScreenProps) {
  const { setUser } = useUser();
  const { language } = useLanguage();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const isEn = language === 'en';

  const handleSignIn = async () => {
    const trimmedPhone = phone.replace(/\s/g, '');
    if (!trimmedPhone) {
      Alert.alert(isEn ? 'Error' : 'Lỗi', isEn ? 'Please enter phone number' : 'Vui lòng nhập số điện thoại');
      return;
    }

    if (!password || password.length < 6) {
      Alert.alert(
        isEn ? 'Error' : 'Lỗi',
        isEn ? 'Password must be at least 6 characters' : 'Mật khẩu phải có ít nhất 6 ký tự',
      );
      return;
    }

    setLoading(true);
    try {
      const signedIn = await signInUserAccountWithPhone(trimmedPhone, password);
      if (!signedIn) {
        Alert.alert(
          isEn ? 'Sign in failed' : 'Đăng nhập thất bại',
          isEn
            ? 'Phone number or password is incorrect.'
            : 'Số điện thoại hoặc mật khẩu không chính xác.',
        );
        return;
      }

      const userData = signedIn as unknown as UserData;
      if (!userData.role) {
        userData.role = 'customer';
      }

      const uid = String((signedIn as Record<string, unknown>).authUid ?? '');
      let latestApplication: Awaited<ReturnType<typeof getLatestPartnerApplicationByUserId>> = null;
      try {
        latestApplication = uid ? await getLatestPartnerApplicationByUserId(uid) : null;
      } catch (appErr) {
        console.warn('[handleSignIn] getLatestPartnerApplication failed:', appErr);
      }
      if (latestApplication) {
        userData.partnerApplicationId = latestApplication.id;
        userData.partnerApplicationStatus = latestApplication.status;
      }

      const canUpgradeRole =
        latestApplication?.status === 'approved' &&
        latestApplication.imageModerationStatus === 'approved';
      if (canUpgradeRole && userData.role !== 'therapist') {
        userData.role = 'therapist';
        userData.partnerRoleApprovedAt = latestApplication?.approvedAt || new Date().toISOString();
        userData.partnerRoleNoticeSeenAt = new Date().toISOString();
        Alert.alert(
          isEn ? 'Partner approved' : 'Đã duyệt đối tác',
          isEn
            ? 'Your partner profile has been approved. Your account is now Technician.'
            : 'Hồ sơ đối tác của bạn đã được duyệt. Tài khoản hiện là vai trò Kỹ thuật viên.',
        );
      } else if (latestApplication?.status === 'pending') {
        Alert.alert(
          isEn ? 'Application pending' : 'Hồ sơ đang chờ duyệt',
          isEn
            ? 'Your partner registration is pending admin review.'
            : 'Hồ sơ đăng ký đối tác của bạn đang chờ quản trị viên duyệt.',
        );
      }

      delete (userData as unknown as Record<string, unknown>).password;
      await setUser(userData);
      onBack();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[handleSignIn] Error:', msg, err);
      Alert.alert(
        isEn ? 'Error' : 'Lỗi',
        isEn
          ? `Sign in failed: ${msg}`
          : `Đăng nhập thất bại: ${msg}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero / Branding */}
          <View style={styles.heroSection}>
            <Text style={styles.heroAppName}>ZENA</Text>
            <Text style={styles.heroTagline}>
              {isEn ? 'Book massage at home, easily' : 'Đặt massage tại nhà, dễ dàng'}
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <Text style={styles.title}>{isEn ? 'Welcome back' : 'Chào mừng trở lại'}</Text>
            <Text style={styles.subtitle}>
              {isEn ? 'Sign in to continue' : 'Đăng nhập để tiếp tục'}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{isEn ? 'Phone number' : 'Số điện thoại'}</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.inputIcon}>📱</Text>
                <TextInput
                  style={styles.input}
                  placeholder={isEn ? 'Enter phone number' : 'Nhập số điện thoại'}
                  placeholderTextColor="#9BB0CC"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={phone}
                  onChangeText={setPhone}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{isEn ? 'Password' : 'Mật khẩu'}</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.inputIcon}>🔒</Text>
                <TextInput
                  style={styles.input}
                  placeholder={isEn ? 'Enter password' : 'Nhập mật khẩu'}
                  placeholderTextColor="#9BB0CC"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>{isEn ? 'Sign In' : 'Đăng nhập'}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{isEn ? 'or' : 'hoặc'}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Sign Up CTA */}
          <TouchableOpacity
            style={styles.signUpBtn}
            onPress={onNavigateSignUp}
            activeOpacity={0.85}
          >
            <Text style={styles.signUpBtnText}>
              {isEn ? 'Create new account' : 'Tạo tài khoản mới'}
            </Text>
          </TouchableOpacity>


        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  // ── Hero ──
  heroSection: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 20,
  },
  heroAppName: {
    fontSize: 48,
    fontWeight: '900',
    color: '#5BA3E6',
    letterSpacing: 1,
    fontStyle: 'italic',
  },
  heroTagline: {
    fontSize: 13,
    color: COLORS.muted,
    letterSpacing: 0.3,
    marginTop: 6,
  },
  // ── Card ──
  card: {
    marginHorizontal: 20,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 22,
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.text,
  },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // ── Divider ──
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 40,
    marginTop: 24,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: 14,
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '600',
  },
  // ── Sign Up Button ──
  signUpBtn: {
    marginHorizontal: 20,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.card,
  },
  signUpBtnText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

});
