import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppColors } from '@/constants/appColors';
import { VIETNAM_PROVINCES } from '@/constants/bookingFilters';
import { SMS_OTP_SIGNUP_ENABLED } from '@/constants/smsOtpSignUp';
import { normalizeVietnamPhone } from '@/lib/phoneNormalize';
import { sendOtp, verifyOtp } from '@/lib/smsService';

const PROVINCE_SET = new Set(VIETNAM_PROVINCES as readonly string[]);

type PhoneSignUpPayload = {
  displayName: string;
  phone: string;
  password: string;
  area: string;
  age: number;
};

type PhoneSignUpScreenProps = {
  onBack: () => void;
  onNavigateSignIn: () => void;
  onSubmit: (payload: PhoneSignUpPayload) => Promise<void>;
};

const THEME = {
  bg: AppColors.bg,
  card: AppColors.white,
  primary: AppColors.primary,
  primaryDark: AppColors.primaryDark,
  primarySoft: AppColors.primarySoft,
  primarySoft2: AppColors.primarySoft2,
  text: AppColors.text,
  textMuted: AppColors.textMuted,
  border: AppColors.border,
  inputBg: AppColors.primarySoft2,
  hero: AppColors.primaryDark,
  white: AppColors.white,
  error: AppColors.danger,
  errorBg: AppColors.dangerBg,
};

export function PhoneSignUpScreen({
  onBack,
  onNavigateSignIn,
  onSubmit,
}: PhoneSignUpScreenProps) {
  const [displayName, setDisplayName] = useState('');
  const [area, setArea] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showProvinceModal, setShowProvinceModal] = useState(false);
  const [provinceQuery, setProvinceQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [phoneAtOtpSend, setPhoneAtOtpSend] = useState('');
  const parsedAge = Number(age);
  const hasValidAge = Number.isFinite(parsedAge) && parsedAge >= 16 && parsedAge <= 90;
  const hasProvince = area.trim().length > 0 && PROVINCE_SET.has(area.trim());
  const normalizedPhone = normalizeVietnamPhone(phone);
  const hasValidVnMobile = /^84[35789]\d{8}$/.test(normalizedPhone);
  const filteredProvinces = useMemo(
    () =>
      VIETNAM_PROVINCES.filter((p) => p.toLowerCase().includes(provinceQuery.trim().toLowerCase())),
    [provinceQuery],
  );
  const passwordsMatch =
    password.length >= 6 && confirmPassword.length >= 6 && password === confirmPassword;
  const baseFormValid =
    displayName.trim().length >= 2 &&
    hasProvince &&
    hasValidAge &&
    hasValidVnMobile &&
    passwordsMatch;

  const otpDigits = otpCode.replace(/\D/g, '').slice(0, 6);
  const canSendSmsOtp =
    SMS_OTP_SIGNUP_ENABLED && baseFormValid && !otpSent && !sendingOtp && !isSubmitting;
  const canFinishSignUp =
    SMS_OTP_SIGNUP_ENABLED &&
    baseFormValid &&
    otpSent &&
    otpDigits.length === 6 &&
    !sendingOtp &&
    !isSubmitting;

  useEffect(() => {
    if (!SMS_OTP_SIGNUP_ENABLED || !otpSent || !phoneAtOtpSend) return;
    if (normalizedPhone !== phoneAtOtpSend) {
      setOtpSent(false);
      setOtpCode('');
      setPhoneAtOtpSend('');
    }
  }, [normalizedPhone, otpSent, phoneAtOtpSend]);

  const runSendOtp = async () => {
    if (password !== confirmPassword) {
      setError('Mật khẩu không khớp');
      return;
    }
    if (!hasValidAge) {
      setError('Độ tuổi không hợp lệ (16-90).');
      return;
    }
    setError('');
    setSendingOtp(true);
    try {
      const res = await sendOtp(normalizedPhone);
      if (!res.success) {
        setError(res.message.trim() || 'Không gửi được mã OTP.');
        return;
      }
      setPhoneAtOtpSend(normalizedPhone);
      setOtpSent(true);
      setOtpCode('');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleSubmit = async () => {
    if (password !== confirmPassword) {
      setError('Mật khẩu không khớp');
      return;
    }
    if (!hasValidAge) {
      setError('Độ tuổi không hợp lệ (16-90).');
      return;
    }

    if (!otpSent) {
      if (!canSendSmsOtp) return;
      await runSendOtp();
      return;
    }

    if (!canFinishSignUp) return;

    setError('');
    setIsSubmitting(true);

    try {
      const v = await verifyOtp(normalizedPhone, otpDigits);
      if (!v.success) {
        setError(v.message.trim() || 'Mã OTP không đúng.');
        return;
      }

      await onSubmit({
        displayName: displayName.trim(),
        phone: phone.trim(),
        password,
        area: area.trim(),
        age: parsedAge,
      });
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null
            ? String((e as { message?: unknown }).message ?? '')
            : '';
      setError(message.trim() || 'Đăng ký thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          
          {/* TOP */}
          <View style={styles.topRow}>
            <Pressable style={styles.iconBtn} onPress={onBack}>
              <Feather name="x" size={18} color={THEME.text} />
            </Pressable>

            <View style={styles.lang}>
              <Text>🇻🇳 VI</Text>
            </View>
          </View>

          {/* HERO */}
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Tạo tài khoản</Text>
            <Text style={styles.heroSub}>
              Điền thông tin và đặt mật khẩu, nhấn gửi mã OTP qua SMS, sau đó nhập mã để hoàn tất.
            </Text>
          </View>

          {/* FORM */}
          <View style={styles.card}>
            <Text style={styles.label}>Họ và tên</Text>
            <View style={styles.input}>
              <Feather name="user" size={16} color={THEME.textMuted} />
              <TextInput
                placeholder="Nhập họ và tên"
                placeholderTextColor="#AE9985"
                value={displayName}
                onChangeText={setDisplayName}
                style={styles.textInput}
              />
            </View>

            <Text style={styles.label}>Khu vực (tỉnh / thành phố)</Text>
            <Pressable
              style={styles.input}
              onPress={() => {
                setProvinceQuery('');
                setShowProvinceModal(true);
              }}
            >
              <Feather name="map-pin" size={16} color={THEME.textMuted} />
              <Text
                style={[styles.textInput, !area && styles.provincePlaceholder]}
                numberOfLines={1}
              >
                {hasProvince ? area : 'Chọn 1 trong 63 tỉnh thành'}
              </Text>
              <Feather name="chevron-down" size={18} color={THEME.textMuted} />
            </Pressable>

            <Modal
              visible={showProvinceModal}
              transparent
              animationType="slide"
              onRequestClose={() => setShowProvinceModal(false)}
            >
              <Pressable style={styles.provinceOverlay} onPress={() => setShowProvinceModal(false)}>
                <Pressable style={styles.provinceSheet} onPress={() => {}}>
                  <View style={styles.provinceHandle} />
                  <Text style={styles.provinceModalTitle}>Chọn tỉnh / thành phố</Text>
                  <View style={styles.provinceSearchRow}>
                    <Feather name="search" size={16} color={THEME.textMuted} />
                    <TextInput
                      style={styles.provinceSearchInput}
                      placeholder="Tìm tỉnh, thành phố..."
                      placeholderTextColor="#AE9985"
                      value={provinceQuery}
                      onChangeText={setProvinceQuery}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <FlatList
                    data={filteredProvinces}
                    keyExtractor={(item) => item}
                    style={styles.provinceList}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                      <Text style={styles.provinceEmpty}>Không tìm thấy tỉnh/thành phù hợp</Text>
                    }
                    renderItem={({ item }) => {
                      const active = item === area;
                      return (
                        <Pressable
                          style={[styles.provinceRow, active && styles.provinceRowActive]}
                          onPress={() => {
                            setArea(item);
                            setShowProvinceModal(false);
                            setProvinceQuery('');
                          }}
                        >
                          <Text style={[styles.provinceRowText, active && styles.provinceRowTextActive]}>
                            {item}
                          </Text>
                          {active ? <Text style={styles.provinceCheck}>✓</Text> : null}
                        </Pressable>
                      );
                    }}
                  />
                </Pressable>
              </Pressable>
            </Modal>

            <Text style={styles.label}>Độ tuổi</Text>
            <View style={styles.input}>
              <Feather name="calendar" size={16} color={THEME.textMuted} />
              <TextInput
                placeholder="Nhập độ tuổi"
                placeholderTextColor="#AE9985"
                keyboardType="number-pad"
                value={age}
                onChangeText={(value) => setAge(value.replace(/\D/g, '').slice(0, 2))}
                style={styles.textInput}
              />
            </View>

            <Text style={styles.label}>Số điện thoại</Text>
            <View style={styles.input}>
              <Text style={{ marginRight: 8, color: THEME.text }}>🇻🇳 +84</Text>
              <TextInput
                placeholder="Nhập số điện thoại"
                placeholderTextColor="#AE9985"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                style={styles.textInput}
              />
            </View>

            <Text style={styles.label}>Mật khẩu</Text>
            <View style={styles.input}>
              <Feather name="lock" size={16} color={THEME.textMuted} />
              <TextInput
                placeholder="Tối thiểu 6 ký tự"
                placeholderTextColor="#AE9985"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                style={styles.textInput}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={THEME.textMuted} />
              </Pressable>
            </View>

            <Text style={styles.label}>Nhập lại mật khẩu</Text>
            <View style={styles.input}>
              <Feather name="shield" size={16} color={THEME.textMuted} />
              <TextInput
                placeholder="Nhập lại mật khẩu"
                placeholderTextColor="#AE9985"
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                style={styles.textInput}
              />
              <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Feather
                  name={showConfirmPassword ? 'eye-off' : 'eye'}
                  size={16}
                  color={THEME.textMuted}
                />
              </Pressable>
            </View>

            {SMS_OTP_SIGNUP_ENABLED && otpSent ? (
              <>
                <Text style={styles.label}>Mã OTP (SMS)</Text>
                <View style={styles.input}>
                  <Feather name="hash" size={16} color={THEME.textMuted} />
                  <TextInput
                    placeholder="6 chữ số"
                    placeholderTextColor="#AE9985"
                    keyboardType="number-pad"
                    value={otpCode}
                    onChangeText={(v) => setOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                    style={styles.textInput}
                    maxLength={6}
                  />
                </View>
                <Pressable
                  style={[styles.resendBtn, sendingOtp && { opacity: 0.6 }]}
                  disabled={sendingOtp || isSubmitting}
                  onPress={() => void runSendOtp()}
                >
                  <Text style={styles.resendBtnText}>Gửi lại mã OTP</Text>
                </Pressable>
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {/* BUTTON */}
            <Pressable
              style={[styles.btn, (!otpSent ? !canSendSmsOtp : !canFinishSignUp) && { opacity: 0.5 }]}
              disabled={otpSent ? !canFinishSignUp : !canSendSmsOtp}
              onPress={() => void handleSubmit()}
            >
              {sendingOtp || isSubmitting ? (
                <ActivityIndicator color={THEME.white} />
              ) : (
                <Text style={styles.btnText}>
                  {otpSent ? 'Xác nhận và tạo tài khoản' : 'Gửi mã OTP qua SMS'}
                </Text>
              )}
            </Pressable>

            {/* SWITCH */}
            <Pressable onPress={onNavigateSignIn}>
              <Text style={styles.switch}>
                Đã có tài khoản? <Text style={{ color: THEME.primary, fontWeight: '700' }}>Đăng nhập</Text>
              </Text>
            </Pressable>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  container: {
    padding: 20,
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },

  iconBtn: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    padding: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(253,129,44,0.16)',
  },

  lang: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(253,129,44,0.16)',
  },

  hero: {
    backgroundColor: THEME.hero,
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
  },

  heroTitle: {
    color: '#FFF6EE',
    fontSize: 24,
    fontWeight: '800',
  },

  heroSub: {
    color: 'rgba(255, 243, 229, 0.92)',
    marginTop: 6,
  },

  card: {
    backgroundColor: THEME.card,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.border,
  },

  label: {
    marginTop: 10,
    marginBottom: 6,
    fontWeight: '700',
    color: THEME.text,
  },

  input: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.inputBg,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },

  textInput: {
    flex: 1,
    marginLeft: 8,
    color: THEME.text,
  },

  provincePlaceholder: {
    color: '#AE9985',
  },

  provinceOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },

  provinceSheet: {
    backgroundColor: THEME.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 28,
    maxHeight: '78%',
  },

  provinceHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
    marginTop: 8,
    marginBottom: 12,
  },

  provinceModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 12,
  },

  provinceSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.inputBg,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 8,
  },

  provinceSearchInput: {
    flex: 1,
    marginLeft: 8,
    color: THEME.text,
    fontSize: 16,
    paddingVertical: 4,
  },

  provinceList: {
    flexGrow: 0,
  },

  provinceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: THEME.border,
  },

  provinceRowActive: {
    backgroundColor: THEME.primarySoft2,
  },

  provinceRowText: {
    flex: 1,
    fontSize: 16,
    color: THEME.text,
  },

  provinceRowTextActive: {
    fontWeight: '700',
    color: THEME.primaryDark,
  },

  provinceCheck: {
    fontSize: 16,
    color: THEME.primary,
    fontWeight: '800',
  },

  provinceEmpty: {
    textAlign: 'center',
    color: THEME.textMuted,
    paddingVertical: 24,
  },

  btn: {
    marginTop: 16,
    backgroundColor: THEME.primary,
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
  },

  btnText: {
    color: THEME.white,
    fontWeight: '700',
  },

  switch: {
    textAlign: 'center',
    marginTop: 12,
    color: THEME.textMuted,
  },

  error: {
    color: THEME.error,
    marginTop: 8,
    backgroundColor: THEME.errorBg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  resendBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 6,
  },
  resendBtnText: {
    color: THEME.primary,
    fontWeight: '700',
    fontSize: 14,
  },
});