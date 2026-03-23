import { DEFAULT_CITY, VIETNAM_PROVINCES } from '@/constants/bookingFilters';
import { useLanguage } from '@/contexts/LanguageContext';
import { UserData, useUser } from '@/contexts/UserContext';
import { signUpWithPhone } from '@/lib/supabaseService';
import React, { useMemo, useState } from 'react';
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
  primary: '#2196F3',
  primaryDark: '#1565C0',
  primarySoft: '#F8E9EC',
  bg: '#FFF8F9',
  card: '#FFFFFF',
  text: '#3D0D16',
  muted: '#8E5C66',
  border: '#B3D4F0',
};

const NATIONALITIES_VI = ['Việt Nam', 'Thái Lan', 'Hàn Quốc', 'Nhật Bản', 'Singapore', 'Khác'];
const NATIONALITIES_EN = ['Vietnam', 'Thailand', 'Korea', 'Japan', 'Singapore', 'Other'];

export type SignUpScreenProps = {
  onBack: () => void;
  onNavigateSignIn: () => void;
};

export function SignUpScreen({ onBack, onNavigateSignIn }: SignUpScreenProps) {
  const { setUser } = useUser();
  const { language } = useLanguage();
  const isEn = language === 'en';

  const [step, setStep] = useState<'phone' | 'profile'>('phone');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  const handleCreateAccount = async () => {
    const trimmedPhone = phone.replace(/\s/g, '');
    if (!trimmedPhone) {
      Alert.alert(isEn ? 'Error' : 'Lỗi', isEn ? 'Please enter phone number' : 'Vui lòng nhập số điện thoại');
      return;
    }
    const phoneRegex = /^(0|\+84)[0-9]{9,10}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      Alert.alert(isEn ? 'Error' : 'Lỗi', isEn ? 'Invalid phone number format' : 'Số điện thoại không hợp lệ');
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
      setStep('profile');
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string; details?: string; hint?: string };
      console.warn('SignUp error:', err?.message, err?.code, err?.details, err?.hint);
      const msg = (err?.message ?? '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already registered')) {
        Alert.alert(
          isEn ? 'Phone already used' : 'Số điện thoại đã được sử dụng',
          isEn ? 'This phone number is already registered. Please sign in.' : 'Số điện thoại này đã được đăng ký. Vui lòng đăng nhập.',
        );
      } else {
        const detail = err?.message || err?.details || err?.hint || String(error);
        Alert.alert(
          isEn ? 'Sign up failed' : 'Đăng ký thất bại',
          `${isEn ? 'Could not create account' : 'Không thể tạo tài khoản'}.\n\nError: ${detail}`,
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
        phoneNumber: phone.replace(/\s/g, ''),
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
          ? 'Your account is created as Customer by default. You can apply to become a partner in Account.'
          : 'Tài khoản của bạn đã được tạo với vai trò Khách hàng mặc định. Bạn có thể đăng ký đối tác trong phần Tài khoản.',
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
    if (step === 'phone') {
      onBack();
      return;
    }
    setStep('phone');
  };

  const stepIndex = step === 'phone' ? 0 : 1;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBackPress}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEn ? 'Create account' : 'Đăng ký tài khoản'}</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.stepRow}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.stepDot, i <= stepIndex && styles.stepDotActive]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 'phone' && (
          <View style={styles.card}>
            <Text style={styles.title}>{isEn ? 'Create account' : 'Tạo tài khoản'}</Text>
            <Text style={styles.subtitle}>
              {isEn ? 'Use your phone number and password to register' : 'Dùng số điện thoại và mật khẩu để đăng ký'}
            </Text>
            <Text style={styles.label}>{isEn ? 'Phone number' : 'Số điện thoại'}</Text>
            <TextInput
              style={styles.input}
              placeholder={isEn ? '0912345678' : '0912345678'}
              placeholderTextColor="#B58C95"
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              value={phone}
              onChangeText={setPhone}
              editable={!loading}
            />
            <Text style={styles.label}>{isEn ? 'Password' : 'Mật khẩu'}</Text>
            <TextInput
              style={styles.input}
              placeholder={isEn ? 'At least 6 characters' : 'Tối thiểu 6 ký tự'}
              placeholderTextColor="#B58C95"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />
            <Text style={styles.label}>{isEn ? 'Confirm password' : 'Xác nhận mật khẩu'}</Text>
            <TextInput
              style={styles.input}
              placeholder={isEn ? 'Re-enter password' : 'Nhập lại mật khẩu'}
              placeholderTextColor="#B58C95"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!loading}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateAccount} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{isEn ? 'Next' : 'Tiếp theo'}</Text>}
            </TouchableOpacity>
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>{isEn ? 'Already have an account? ' : 'Đã có tài khoản? '}</Text>
              <TouchableOpacity onPress={onNavigateSignIn}>
                <Text style={styles.footerLink}>{isEn ? 'Sign in' : 'Đăng nhập'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'profile' && (
          <View style={styles.card}>
            <Text style={styles.title}>{isEn ? 'Personal information' : 'Thông tin cá nhân'}</Text>
            <Text style={styles.subtitle}>{isEn ? 'Complete your profile to finish registration' : 'Hoàn tất thông tin để hoàn thành đăng ký'}</Text>
            <Text style={styles.label}>{isEn ? 'Display name' : 'Tên hiển thị'}</Text>
            <TextInput
              style={styles.input}
              placeholder={isEn ? 'Example: Anna Lee' : 'Ví dụ: Minh Anh'}
              placeholderTextColor="#B58C95"
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
                    placeholderTextColor="#B58C95"
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
            <TouchableOpacity style={styles.primaryBtn} onPress={handleFinishSignUp} disabled={loading}>
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
    paddingTop: 14,
    paddingBottom: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 18, color: COLORS.primaryDark, fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  stepRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 10 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  stepDotActive: { width: 24, backgroundColor: COLORS.primary },
  content: { paddingHorizontal: 16, paddingBottom: 36 },
  card: { backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: 18 },
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
  footerRow: { marginTop: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { fontSize: 14, color: COLORS.muted },
  footerLink: { fontSize: 14, color: COLORS.primaryDark, fontWeight: '700' },
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
