import { DEFAULT_CITY, VIETNAM_PROVINCES } from '@/constants/bookingFilters';
import type { OnboardingLanguage } from '@/components/Onboarding';
import { useLanguage } from '@/contexts/LanguageContext';
import { UserData, useUser } from '@/contexts/UserContext';
import { PhoneCountryField } from '@/components/PhoneCountryField';
import type { CountryDial } from '@/constants/countryDialData';
import { SocialAuthButtons } from '@/components/SocialAuthButtons';
import { isLikelyValidAppPhone, nationalDigitsToAppPhone } from '@/lib/phoneCountry';
import { getLatestPartnerApplicationByUserId, signUpWithPhone } from '@/lib/supabaseService';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
  primary: '#E53935',
  primaryDark: '#C62828',
  primarySoft: '#FFCDD2',
  bg: '#FFFFFF',
  card: '#FFFFFF',
  text: '#111827',
  muted: '#64748B',
  border: '#E2E8F0',
};

const NATIONALITIES_VI = ['Việt Nam', 'Thái Lan', 'Hàn Quốc', 'Nhật Bản', 'Singapore', 'Khác'];
const NATIONALITIES_EN = ['Vietnam', 'Thailand', 'Korea', 'Japan', 'Singapore', 'Other'];

export type SignUpScreenProps = {
  onBack: () => void;
  onNavigateSignIn: () => void;
};

async function applyPartnerAlerts(userData: UserData, uid: string, isEn: boolean): Promise<UserData> {
  let latestApplication: Awaited<ReturnType<typeof getLatestPartnerApplicationByUserId>> = null;
  try {
    latestApplication = uid ? await getLatestPartnerApplicationByUserId(uid) : null;
  } catch {
    /* ignore */
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
        ? 'Your partner profile has been approved.'
        : 'Hồ sơ đối tác của bạn đã được duyệt.',
    );
  } else if (latestApplication?.status === 'pending') {
    Alert.alert(
      isEn ? 'Application pending' : 'Hồ sơ đang chờ duyệt',
      isEn ? 'Your partner registration is pending review.' : 'Hồ sơ đăng ký đối tác đang chờ duyệt.',
    );
  }
  return userData;
}

export function SignUpScreen({ onBack, onNavigateSignIn }: SignUpScreenProps) {
  const { setUser } = useUser();
  const { language, setLanguage } = useLanguage();
  const isEn = language === 'en';

  const [step, setStep] = useState<'landing' | 'phone' | 'profile'>('landing');
  const [countryCode, setCountryCode] = useState('VN');
  const [callingCode, setCallingCode] = useState('84');
  const [national, setNational] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registeredPhone, setRegisteredPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('female');
  const [nationality, setNationality] = useState('Việt Nam');
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY);
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [authUid, setAuthUid] = useState('');
  const [loading, setLoading] = useState(false);

  const filteredCities = useMemo(
    () => VIETNAM_PROVINCES.filter((c) => c.toLowerCase().includes(citySearch.trim().toLowerCase())),
    [citySearch],
  );

  const genders = [
    { key: 'female', label: isEn ? 'Female' : 'Nữ' },
    { key: 'male', label: isEn ? 'Male' : 'Nam' },
    { key: 'other', label: isEn ? 'Other' : 'Khác' },
  ] as const;
  const nationalities = isEn ? NATIONALITIES_EN : NATIONALITIES_VI;

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
      Alert.alert(
        isEn ? 'Welcome' : 'Chào mừng',
        isEn
          ? 'You are signed in with Google or Apple. Complete your profile in Account anytime.'
          : 'Bạn đã đăng nhập bằng Google hoặc Apple. Có thể bổ sung hồ sơ trong mục Tài khoản.',
      );
      onBack();
    },
    [isEn, onBack, setUser],
  );

  const handleCreateAccount = async () => {
    const trimmedPhone = nationalDigitsToAppPhone(callingCode, national);
    if (!trimmedPhone) {
      Alert.alert(isEn ? 'Error' : 'Lỗi', isEn ? 'Please enter phone number' : 'Vui lòng nhập số điện thoại');
      return;
    }
    if (!isLikelyValidAppPhone(callingCode, national)) {
      Alert.alert(isEn ? 'Error' : 'Lỗi', isEn ? 'Invalid phone number' : 'Số điện thoại không hợp lệ');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert(
        isEn ? 'Error' : 'Lỗi',
        isEn ? 'Password must be at least 6 characters' : 'Mật khẩu phải có ít nhất 6 ký tự',
      );
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(isEn ? 'Error' : 'Lỗi', isEn ? 'Confirm password does not match' : 'Mật khẩu xác nhận không khớp');
      return;
    }

    setLoading(true);
    try {
      const uid = await signUpWithPhone(trimmedPhone, password);
      setAuthUid(uid);
      setRegisteredPhone(trimmedPhone);
      setStep('profile');
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string; details?: string; hint?: string };
      console.warn('SignUp error:', err?.message, err?.code, err?.details, err?.hint);
      const msg = (err?.message ?? '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already registered')) {
        Alert.alert(
          isEn ? 'Phone already used' : 'Số điện thoại đã được sử dụng',
          isEn ? 'This phone is already registered. Please sign in.' : 'Số điện thoại này đã được đăng ký. Vui lòng đăng nhập.',
        );
      } else {
        const detail = err?.message || err?.details || err?.hint || String(error);
        Alert.alert(
          isEn ? 'Sign up failed' : 'Đăng ký thất bại',
          `${isEn ? 'Could not create account' : 'Không thể tạo tài khoản'}.\n\n${detail}`,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFinishSignUp = async () => {
    if (!displayName.trim()) {
      Alert.alert(isEn ? 'Error' : 'Lỗi', isEn ? 'Please enter display name' : 'Vui lòng nhập tên hiển thị');
      return;
    }

    setLoading(true);
    try {
      const newUser: UserData = {
        authUid,
        phoneNumber: registeredPhone,
        displayName: displayName.trim(),
        gender,
        nationality,
        selectedCity,
        role: 'customer',
        partnerApplicationStatus: 'none',
        createdAt: new Date().toISOString(),
      };
      await setUser(newUser);
      Alert.alert(
        isEn ? 'Account created' : 'Tạo tài khoản thành công',
        isEn
          ? 'Your account is created as Customer. You can apply to become a partner in Account.'
          : 'Tài khoản của bạn đã được tạo với vai trò Khách hàng. Bạn có thể đăng ký đối tác trong phần Tài khoản.',
      );
      onBack();
    } catch {
      Alert.alert(
        isEn ? 'Error' : 'Lỗi',
        isEn ? 'Could not complete registration. Please try again.' : 'Không thể hoàn tất đăng ký. Vui lòng thử lại.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBackPress = () => {
    if (step === 'landing') {
      onBack();
      return;
    }
    if (step === 'phone') {
      setStep('landing');
      return;
    }
    setStep('phone');
  };

  const stepIndex = step === 'landing' ? -1 : step === 'phone' ? 0 : 1;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBackPress}>
          <Text style={styles.backIcon}>{step === 'landing' ? '✕' : '←'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEn ? 'Create account' : 'Đăng ký tài khoản'}</Text>
        <TouchableOpacity style={styles.langPill} onPress={toggleLang}>
          <Text style={styles.langFlag}>{language === 'vi' ? '🇻🇳' : '🇬🇧'}</Text>
          <Text style={styles.langText}>{language === 'vi' ? 'VI' : 'EN'}</Text>
        </TouchableOpacity>
      </View>

      {step !== 'landing' ? (
        <View style={styles.stepRow}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.stepDot, i <= stepIndex && styles.stepDotActive]} />
          ))}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {step === 'landing' && (
          <LinearGradient colors={['#DCF5F2', '#FFFFFF']} style={styles.landingPad}>
            <Text style={styles.brand}>zena</Text>
            <Text style={styles.landingTitle}>{isEn ? 'Create account' : 'Đăng ký tài khoản'}</Text>

            <SocialAuthButtons isEn={isEn} onUserReady={handleOAuthUser} />

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>{isEn ? 'Or' : 'Hoặc'}</Text>
              <View style={styles.orLine} />
            </View>

            <TouchableOpacity
              style={styles.btnPhonePrimary}
              onPress={() => setStep('phone')}
              activeOpacity={0.9}
            >
              <Text style={styles.btnPhoneIcon}>📱</Text>
              <Text style={styles.btnPhoneText}>
                {isEn ? 'Sign up with phone number' : 'Đăng ký bằng số điện thoại'}
              </Text>
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerMuted}>{isEn ? 'Already have an account? ' : 'Bạn đã có tài khoản? '}</Text>
              <TouchableOpacity onPress={onNavigateSignIn}>
                <Text style={styles.footerLink}>{isEn ? 'Sign in' : 'Đăng nhập'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.legal}>
              {isEn ? 'By continuing, you agree to our ' : 'Bằng cách tiếp tục, bạn đồng ý với '}
              <Text style={styles.legalLink}>{isEn ? 'Terms & Policy' : 'Điều khoản & Chính sách'}</Text>.
            </Text>
          </LinearGradient>
        )}

        {step === 'phone' && (
          <View style={styles.card}>
            <Text style={styles.title}>{isEn ? 'Phone sign up' : 'Đăng ký bằng số điện thoại'}</Text>
            <Text style={styles.subtitle}>
              {isEn ? 'Enter phone and password' : 'Nhập số điện thoại và mật khẩu'}
            </Text>
            <Text style={styles.label}>{isEn ? 'Phone number' : 'Số điện thoại'}</Text>
            <PhoneCountryField
              countryCode={countryCode}
              callingCode={callingCode}
              nationalNumber={national}
              onCountrySelect={onCountrySelect}
              onChangeNational={setNational}
              placeholder={isEn ? 'Enter phone number' : 'Nhập số điện thoại'}
              editable={!loading}
            />
            <Text style={styles.label}>{isEn ? 'Password' : 'Mật khẩu'}</Text>
            <TextInput
              style={styles.input}
              placeholder={isEn ? 'At least 6 characters' : 'Tối thiểu 6 ký tự'}
              placeholderTextColor="#94A3B8"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />
            <Text style={styles.label}>{isEn ? 'Confirm password' : 'Xác nhận mật khẩu'}</Text>
            <TextInput
              style={styles.input}
              placeholder={isEn ? 'Re-enter password' : 'Nhập lại mật khẩu'}
              placeholderTextColor="#94A3B8"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!loading}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void handleCreateAccount()} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{isEn ? 'Next' : 'Tiếp theo'}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {step === 'profile' && (
          <View style={styles.card}>
            <Text style={styles.title}>{isEn ? 'Personal information' : 'Thông tin cá nhân'}</Text>
            <Text style={styles.subtitle}>{isEn ? 'Complete your profile' : 'Hoàn tất thông tin để hoàn thành đăng ký'}</Text>
            <Text style={styles.label}>{isEn ? 'Display name' : 'Tên hiển thị'}</Text>
            <TextInput
              style={styles.input}
              placeholder={isEn ? 'Example: Anna Lee' : 'Ví dụ: Minh Anh'}
              placeholderTextColor="#94A3B8"
              value={displayName}
              onChangeText={setDisplayName}
            />

            <Text style={styles.label}>{isEn ? 'Gender' : 'Giới tính'}</Text>
            <View style={styles.chipsRow}>
              {genders.map((g) => (
                <TouchableOpacity
                  key={g.key}
                  style={[styles.chip, gender === g.key && styles.chipActive]}
                  onPress={() => setGender(g.key)}
                >
                  <Text style={[styles.chipText, gender === g.key && styles.chipTextActive]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>{isEn ? 'Nationality' : 'Quốc tịch'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {nationalities.map((n, idx) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.chip, { marginRight: 8 }, nationality === (isEn ? NATIONALITIES_VI[idx] : n) && styles.chipActive]}
                  onPress={() => setNationality(isEn ? NATIONALITIES_VI[idx] : n)}
                >
                  <Text style={[styles.chipText, nationality === (isEn ? NATIONALITIES_VI[idx] : n) && styles.chipTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.label}>{isEn ? 'Area / City' : 'Khu vực / Thành phố'}</Text>
            <TouchableOpacity style={styles.citySelector} onPress={() => setCityModalVisible(true)}>
              <Text style={styles.citySelectorText}>{selectedCity}</Text>
              <Text style={styles.citySelectorArrow}>▼</Text>
            </TouchableOpacity>

            <Modal visible={cityModalVisible} animationType="slide" transparent>
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{isEn ? 'Select city' : 'Chọn thành phố'}</Text>
                    <TouchableOpacity onPress={() => { setCityModalVisible(false); setCitySearch(''); }}>
                      <Text style={styles.modalClose}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.citySearchInput}
                    placeholder={isEn ? 'Search city...' : 'Tìm thành phố...'}
                    placeholderTextColor="#94A3B8"
                    value={citySearch}
                    onChangeText={setCitySearch}
                    autoCorrect={false}
                  />
                  <FlatList
                    data={filteredCities}
                    keyExtractor={(item) => item}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.cityItem, selectedCity === item && styles.cityItemActive]}
                        onPress={() => { setSelectedCity(item); setCityModalVisible(false); setCitySearch(''); }}
                      >
                        <Text style={[styles.cityItemText, selectedCity === item && styles.cityItemTextActive]}>{item}</Text>
                        {selectedCity === item && <Text style={styles.cityItemCheck}>✓</Text>}
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </View>
            </Modal>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void handleFinishSignUp()} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{isEn ? 'Complete sign up' : 'Hoàn tất đăng ký'}</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 18, color: COLORS.primaryDark, fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  langFlag: { fontSize: 14 },
  langText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  stepRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 10 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  stepDotActive: { width: 24, backgroundColor: COLORS.primary },
  content: { paddingHorizontal: 16, paddingBottom: 36 },
  landingPad: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 20,
    paddingBottom: 32,
  },
  brand: {
    textAlign: 'center',
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -1,
    textTransform: 'lowercase',
  },
  landingTitle: {
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 12,
    marginBottom: 24,
  },
  orRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  orText: { marginHorizontal: 12, fontSize: 13, color: COLORS.muted, fontWeight: '600' },
  btnPhonePrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    paddingVertical: 16,
  },
  btnPhoneIcon: { fontSize: 18 },
  btnPhoneText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    flexWrap: 'wrap',
  },
  footerMuted: { fontSize: 14, color: COLORS.muted },
  footerLink: { fontSize: 14, fontWeight: '800', color: COLORS.primaryDark },
  legal: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 18,
  },
  legalLink: { fontWeight: '700', color: COLORS.primaryDark },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
  },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  subtitle: { marginTop: 6, fontSize: 14, color: COLORS.muted, lineHeight: 20, marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8, marginTop: 10 },
  input: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: COLORS.text,
  },
  primaryBtn: { marginTop: 16, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.primaryDark, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  citySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  citySelectorText: { fontSize: 15, color: COLORS.text, fontWeight: '600' },
  citySelectorArrow: { fontSize: 12, color: COLORS.muted },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalClose: { fontSize: 20, color: COLORS.muted, padding: 4 },
  citySearchInput: {
    marginHorizontal: 18,
    marginBottom: 8,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
  },
  cityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  cityItemActive: { backgroundColor: COLORS.primarySoft },
  cityItemText: { fontSize: 15, color: COLORS.text },
  cityItemTextActive: { color: COLORS.primary, fontWeight: '700' },
  cityItemCheck: { fontSize: 16, color: COLORS.primary, fontWeight: '700' },
});
