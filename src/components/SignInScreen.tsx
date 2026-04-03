import type { OnboardingLanguage } from '@/components/Onboarding';
import { PhoneCountryField } from '@/components/PhoneCountryField';
import { SocialAuthButtons } from '@/components/SocialAuthButtons';
import { AppColors } from '@/constants/appColors';
import type { CountryDial } from '@/constants/countryDialData';
import { useLanguage } from '@/contexts/LanguageContext';
import { UserData, useUser } from '@/contexts/UserContext';
import { nationalDigitsToAppPhone } from '@/lib/phoneCountry';
import { getLatestPartnerApplicationByUserId, signInUserAccountWithPhone } from '@/lib/supabaseService';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const COLORS = {
  primary: AppColors.primaryDark,
  primaryDeep: AppColors.primaryDark,
  primaryMuted: AppColors.primaryMuted,
  bg: AppColors.bg,
  text: AppColors.text,
  textSecondary: AppColors.textMuted,
  muted: '#94A3B8',
  border: AppColors.border,
  card: 'rgba(255,255,255,0.92)',
  inputBg: '#F8FAFC',
};

export type SignInScreenProps = {
  onBack: () => void;
  onNavigateSignUp: () => void;
};

async function applyPartnerAlerts(
  userData: UserData,
  uid: string,
  isEn: boolean,
): Promise<UserData> {
  let latestApplication: Awaited<ReturnType<typeof getLatestPartnerApplicationByUserId>> = null;
  try {
    latestApplication = uid ? await getLatestPartnerApplicationByUserId(uid) : null;
  } catch (appErr) {
    console.warn('[SignIn] getLatestPartnerApplication failed:', appErr);
  }
  if (latestApplication) {
    userData.partnerApplicationId = latestApplication.id;
    userData.partnerApplicationStatus = latestApplication.status;
  }
  const canUpgradeRole =
    latestApplication?.status === 'approved' && latestApplication.imageModerationStatus === 'approved';
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
  return userData;
}

export function SignInScreen({ onBack, onNavigateSignUp }: SignInScreenProps) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { setUser } = useUser();
  const { language, setLanguage } = useLanguage();
  const isEn = language === 'en';
  const isCompact = screenHeight <= 740;
  const isLarge = screenHeight >= 900;
  const topPull = insets.top >= 44 ? 6 : insets.top >= 20 ? 4 : 2;

  const [countryCode, setCountryCode] = useState('VN');
  const [callingCode, setCallingCode] = useState('84');
  const [national, setNational] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onCountrySelect = (c: CountryDial) => {
    setCountryCode(c.cca2);
    setCallingCode(c.callingCode);
  };

  const toggleLang = () => {
    const next: OnboardingLanguage = language === 'vi' ? 'en' : 'vi';
    void setLanguage(next);
  };

  const handleOAuthUser = useCallback(
    async (userData: UserData) => {
      let next = userData;
      if (!next.role) next.role = 'customer';
      const uid = String(next.authUid ?? '');
      delete (next as unknown as Record<string, unknown>).password;
      next = await applyPartnerAlerts(next, uid, isEn);
      await setUser(next);
      onBack();
    },
    [isEn, onBack, setUser],
  );

  const handleSignIn = async () => {
    const trimmedPhone = nationalDigitsToAppPhone(callingCode, national);
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

      let userData = signedIn as unknown as UserData;
      if (!userData.role) userData.role = 'customer';
      const uid = String((signedIn as Record<string, unknown>).authUid ?? '');
      userData = await applyPartnerAlerts(userData, uid, isEn);
      delete (userData as unknown as Record<string, unknown>).password;
      await setUser(userData);
      onBack();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[handleSignIn]', msg, err);
      Alert.alert(isEn ? 'Error' : 'Lỗi', isEn ? `Sign in failed: ${msg}` : `Đăng nhập thất bại: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const busy = loading;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.topTint, { height: insets.top + 2 }]} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.scroll}>
          <LinearGradient
            colors={[AppColors.accentSoft, AppColors.primarySoft2, AppColors.bg, AppColors.white]}
            locations={[0, 0.35, 0.72, 1]}
            style={[styles.gradient, isCompact && styles.gradientCompact, isLarge && styles.gradientLarge]}
          >
            <View style={styles.orbWrap} pointerEvents="none">
              <View style={[styles.orb, styles.orbA]} />
              <View style={[styles.orb, styles.orbB]} />
            </View>

            <View style={[styles.topBar, { marginTop: topPull }]}>
              <TouchableOpacity style={styles.langPill} onPress={toggleLang} activeOpacity={0.85}>
                <Text style={styles.langFlag}>{language === 'vi' ? '🇻🇳' : '🇬🇧'}</Text>
                <Text style={styles.langText}>{language === 'vi' ? 'VI' : 'EN'}</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.hero, isCompact && styles.heroCompact]}>
              <Text style={styles.heroGreeting}>
                {isEn ? 'Welcome back to ' : 'Chào mừng trở lại với '}
                <Text style={styles.heroBrand}>Zena</Text>
              </Text>
            </View>

            <View style={[styles.card, isCompact && styles.cardCompact, isLarge && styles.cardLarge]}>
              <SocialAuthButtons isEn={isEn} onUserReady={handleOAuthUser} />

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>{isEn ? 'Or' : 'Hoặc'}</Text>
                <View style={styles.orLine} />
              </View>

              <Text style={styles.label}>{isEn ? 'Phone number' : 'Số điện thoại'}</Text>
              <PhoneCountryField
                countryCode={countryCode}
                callingCode={callingCode}
                nationalNumber={national}
                onCountrySelect={onCountrySelect}
                onChangeNational={setNational}
                placeholder={isEn ? 'Enter phone number' : 'Nhập số điện thoại'}
                editable={!busy}
              />

              <View style={styles.pwRow}>
                <Text style={styles.label}>{isEn ? 'Password' : 'Mật khẩu'}</Text>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert(
                      isEn ? 'Forgot password' : 'Quên mật khẩu',
                      isEn ? 'Please contact support in the app.' : 'Vui lòng liên hệ hỗ trợ trong ứng dụng.',
                    )
                  }
                >
                  <Text style={styles.forgot}>{isEn ? 'Forgot?' : 'Quên mật khẩu?'}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.pwWrap}>
                <Ionicons name="lock-closed-outline" size={20} color={COLORS.muted} style={styles.pwIcon} />
                <TextInput
                  style={styles.pwInput}
                  placeholder={isEn ? 'Enter password' : 'Nhập mật khẩu'}
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  editable={!busy}
                />
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, busy && styles.btnDisabled]}
                onPress={() => void handleSignIn()}
                disabled={busy}
                activeOpacity={0.92}
              >
                <LinearGradient
                  colors={[COLORS.primaryMuted, COLORS.primaryDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.btnPrimaryFill}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnPrimaryText}>{isEn ? 'Sign in' : 'Đăng nhập'}</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={[styles.footerRow, isCompact && styles.footerRowCompact]}>
              <Text style={styles.footerMuted}>{isEn ? "Don't have an account? " : 'Bạn chưa có tài khoản? '}</Text>
              <TouchableOpacity onPress={onNavigateSignUp} disabled={busy}>
                <Text style={styles.footerLink}>{isEn ? 'Sign up' : 'Đăng ký'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.legal, isCompact && styles.legalCompact]}>
              {isEn ? 'By continuing, you agree to our ' : 'Tiếp tục là đồng ý '}
              <Text style={styles.legalLink}>{isEn ? 'Terms & Policy' : 'Điều khoản & Chính sách'}</Text>
              .
            </Text>
          </LinearGradient>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  topTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: AppColors.primarySoft,
    zIndex: 0,
  },
  scroll: { flex: 1 },
  gradient: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 0,
    marginTop: 0,
    overflow: 'hidden',
  },
  gradientCompact: {
    paddingHorizontal: 16,
  },
  gradientLarge: {
    paddingHorizontal: 22,
  },
  orbWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbA: {
    width: 280,
    height: 280,
    top: -90,
    right: -100,
    backgroundColor: 'rgba(62, 191, 180, 0.32)',
  },
  orbB: {
    width: 220,
    height: 220,
    bottom: 120,
    left: -80,
    backgroundColor: 'rgba(120, 190, 185, 0.22)',
  },
  /** Thanh trên: chỉ nút ngôn ngữ (bên phải). */
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    height: 44,
    marginBottom: 4,
    zIndex: 1,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    paddingVertical: 0,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  langFlag: { fontSize: 17 },
  langText: { fontSize: 13, fontWeight: '800', color: COLORS.text, letterSpacing: 0.3 },
  hero: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    marginBottom: 8,
    zIndex: 1,
  },
  heroCompact: {
    marginBottom: 4,
  },
  heroGreeting: {
    alignSelf: 'stretch',
    textAlign: 'left',
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
    lineHeight: 32,
  },
  heroBrand: {
    fontWeight: '800',
    color: COLORS.primaryDeep,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.09,
    shadowRadius: 28,
    elevation: 6,
    zIndex: 1,
  },
  cardCompact: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 18,
  },
  cardLarge: {
    paddingTop: 34,
    paddingBottom: 28,
  },
  btnDisabled: { opacity: 0.55 },
  orRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18, marginTop: 8 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(148, 163, 184, 0.45)' },
  orText: {
    marginHorizontal: 14,
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  pwRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 8,
  },
  forgot: { fontSize: 13, fontWeight: '700', color: COLORS.primaryDeep },
  pwWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  pwIcon: { marginRight: 10 },
  pwInput: {
    flex: 1,
    paddingVertical: 15,
    fontSize: 16,
    color: COLORS.text,
  },
  btnPrimary: {
    marginTop: 18,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.primaryDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 5,
  },
  btnPrimaryFill: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
    flexWrap: 'wrap',
    zIndex: 1,
  },
  footerRowCompact: {
    marginTop: 18,
  },
  footerMuted: { fontSize: 14, color: COLORS.textSecondary },
  footerLink: { fontSize: 14, fontWeight: '800', color: COLORS.primaryDeep },
  legal: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 18,
    paddingHorizontal: 12,
    zIndex: 1,
  },
  legalCompact: {
    marginTop: 14,
  },
  legalLink: { fontWeight: '700', color: COLORS.primaryDeep },
});
