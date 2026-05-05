import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { SMS_OTP_SIGNUP_ENABLED } from '@/constants/smsOtpSignUp';
import { normalizeVietnamPhone } from '@/lib/phoneNormalize';
import { resetPasswordWithPhoneOtp, sendOtp } from '@/lib/smsService';

export type PhoneSignInPayload = {
  phone: string;
  password: string;
};

export type PhoneSignInScreenProps = {
  onBack: () => void;
  onNavigateSignUp: () => void;
  onSubmit: (payload: PhoneSignInPayload) => Promise<void>;
};

const THEME = {
  bg: AppColors.bg,
  bgSoft: AppColors.bgAlt,
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
  hero2: AppColors.primary,
  white: AppColors.white,
  errorBg: AppColors.dangerBg,
  error: AppColors.danger,
};

export function PhoneSignInScreen({
  onBack,
  onNavigateSignUp,
  onSubmit,
}: PhoneSignInScreenProps) {
  const passwordInputRef = useRef<TextInput>(null);
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const [forgotOtpSent, setForgotOtpSent] = useState(false);
  const [forgotOtpCode, setForgotOtpCode] = useState('');
  const [forgotPhoneAtSend, setForgotPhoneAtSend] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotShowPass, setForgotShowPass] = useState(false);
  const [forgotSendingOtp, setForgotSendingOtp] = useState(false);
  const [forgotResetting, setForgotResetting] = useState(false);

  const normalizedPhone = normalizeVietnamPhone(phone);
  const hasValidVnMobile = /^84[35789]\d{8}$/.test(normalizedPhone);
  const canSubmit = hasValidVnMobile && password.length >= 6 && !isSubmitting;

  const forgotOtpDigits = forgotOtpCode.replace(/\D/g, '').slice(0, 6);
  const canSendForgotOtp =
    SMS_OTP_SIGNUP_ENABLED &&
    hasValidVnMobile &&
    !forgotOtpSent &&
    !forgotSendingOtp &&
    !forgotResetting;
  const canSubmitForgotReset =
    SMS_OTP_SIGNUP_ENABLED &&
    forgotOtpSent &&
    forgotOtpDigits.length === 6 &&
    forgotNewPassword.length >= 6 &&
    forgotNewPassword === forgotConfirmPassword &&
    normalizedPhone === forgotPhoneAtSend &&
    !forgotSendingOtp &&
    !forgotResetting;

  const goBackToSignIn = () => {
    setMode('signin');
    setError('');
    setForgotOtpSent(false);
    setForgotOtpCode('');
    setForgotPhoneAtSend('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
  };

  const openForgotPassword = () => {
    if (!SMS_OTP_SIGNUP_ENABLED) return;
    setMode('forgot');
    setError('');
    setForgotOtpSent(false);
    setForgotOtpCode('');
    setForgotPhoneAtSend('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
  };

  const runForgotSendOtp = async () => {
    if (!SMS_OTP_SIGNUP_ENABLED || !hasValidVnMobile) return;
    setError('');
    setForgotSendingOtp(true);
    try {
      const res = await sendOtp(normalizedPhone);
      if (!res.success) {
        setError(res.message.trim() || 'Không gửi được mã OTP.');
        return;
      }
      setForgotPhoneAtSend(normalizedPhone);
      setForgotOtpSent(true);
      setForgotOtpCode('');
    } finally {
      setForgotSendingOtp(false);
    }
  };

  const handleForgotReset = async () => {
    if (!canSubmitForgotReset) return;
    setError('');
    setForgotResetting(true);
    try {
      const res = await resetPasswordWithPhoneOtp(normalizedPhone, forgotOtpDigits, forgotNewPassword);
      if (!res.success) {
        setError(res.message.trim() || 'Không đặt lại được mật khẩu.');
        return;
      }
      Alert.alert(
        'Đặt lại mật khẩu thành công',
        res.message.trim() || 'Bạn có thể đăng nhập bằng mật khẩu mới.',
        [
          {
            text: 'Đóng',
            style: 'default',
            onPress: () => {
              goBackToSignIn();
              setPassword('');
            },
          },
        ],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đặt lại được mật khẩu.');
    } finally {
      setForgotResetting(false);
    }
  };

  useEffect(() => {
    if (!SMS_OTP_SIGNUP_ENABLED || mode !== 'forgot' || !forgotOtpSent || !forgotPhoneAtSend) return;
    if (normalizedPhone !== forgotPhoneAtSend) {
      setForgotOtpSent(false);
      setForgotOtpCode('');
      setForgotPhoneAtSend('');
    }
  }, [normalizedPhone, forgotOtpSent, forgotPhoneAtSend, mode]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError('');
    setIsSubmitting(true);

    try {
      await onSubmit({
        phone: phone.trim(),
        password,
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Đăng nhập thất bại. Vui lòng thử lại.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bgOrbTop} />
      <View style={styles.bgOrbBottom} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <View style={styles.topRow}>
              <Pressable style={styles.iconBtn} onPress={onBack}>
                <Feather name="x" size={18} color={THEME.text} />
              </Pressable>

              <View style={styles.langPill}>
                <Text style={styles.langFlag}>🇻🇳</Text>
                <Text style={styles.langText}>VI</Text>
              </View>
            </View>

            <View style={styles.heroCard}>
              <Text style={styles.title}>Chào mừng trở lại</Text>
              <Text style={styles.subtitle}>
                Đăng nhập để tiếp tục đặt dịch vụ, theo dõi lịch hẹn và quản lý tài khoản của bạn.
              </Text>

              <View style={styles.heroStatsRow}>
                <View style={styles.heroStatItem}>
                  <Feather name="shield" size={14} color="#FFD5AF" />
                  <Text style={styles.heroStatText}>Bảo mật</Text>
                </View>
                <View style={styles.heroStatDivider} />
                <View style={styles.heroStatItem}>
                  <Feather name="clock" size={14} color="#FFD5AF" />
                  <Text style={styles.heroStatText}>Nhanh chóng</Text>
                </View>
                <View style={styles.heroStatDivider} />
                <View style={styles.heroStatItem}>
                  <Feather name="star" size={14} color="#FFD5AF" />
                  <Text style={styles.heroStatText}>Cao cấp</Text>
                </View>
              </View>
            </View>

            <View style={styles.formCard}>
              {mode === 'forgot' ? (
                <>
                  <Pressable style={styles.forgotBackRow} onPress={goBackToSignIn} hitSlop={8}>
                    <Feather name="arrow-left" size={18} color={THEME.primary} />
                    <Text style={styles.forgotBackText}>Quay lại đăng nhập</Text>
                  </Pressable>
                  <View style={styles.formHeader}>
                    <Text style={styles.formTitle}>Đặt lại mật khẩu</Text>
                    <Text style={styles.formCaption}>
                      Xác thực số điện thoại bằng mã OTP (SMS VietGuys), sau đó nhập mật khẩu mới.
                    </Text>
                  </View>

                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>Số điện thoại</Text>
                    <View
                      style={[
                        styles.phoneWrap,
                        phoneFocused && styles.inputWrapFocused,
                        error ? styles.inputWrapError : null,
                      ]}
                    >
                      <View style={styles.countryPrefix}>
                        <Text style={styles.prefixFlag}>🇻🇳</Text>
                        <Text style={styles.prefixCode}>+84</Text>
                        <Feather name="chevron-down" size={15} color={THEME.textMuted} />
                      </View>
                      <TextInput
                        style={styles.phoneInput}
                        placeholder="Nhập số điện thoại"
                        placeholderTextColor="#AE9985"
                        keyboardType="phone-pad"
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={phone}
                        onChangeText={setPhone}
                        onFocus={() => setPhoneFocused(true)}
                        onBlur={() => setPhoneFocused(false)}
                        editable={!forgotOtpSent}
                      />
                    </View>
                  </View>

                  {!forgotOtpSent ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.submitBtn,
                        !canSendForgotOtp && styles.submitBtnDisabled,
                        pressed && canSendForgotOtp && styles.submitBtnPressed,
                      ]}
                      onPress={() => void runForgotSendOtp()}
                      disabled={!canSendForgotOtp}
                    >
                      {forgotSendingOtp ? (
                        <ActivityIndicator color={THEME.white} />
                      ) : (
                        <>
                          <Feather name="mail" size={18} color={THEME.white} />
                          <Text style={styles.submitText}>Gửi mã OTP qua SMS</Text>
                        </>
                      )}
                    </Pressable>
                  ) : (
                    <>
                      <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Mã OTP (SMS)</Text>
                        <TextInput
                          style={styles.otpInput}
                          placeholder="• • • • • •"
                          placeholderTextColor="#AE9985"
                          keyboardType="number-pad"
                          maxLength={6}
                          value={forgotOtpCode}
                          onChangeText={(v) => setForgotOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                        />
                        <Pressable
                          style={[styles.resendOtpBtn, forgotSendingOtp && { opacity: 0.6 }]}
                          disabled={forgotSendingOtp || forgotResetting}
                          onPress={() => void runForgotSendOtp()}
                        >
                          <Text style={styles.resendOtpText}>Gửi lại mã OTP</Text>
                        </Pressable>
                      </View>

                      <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Mật khẩu mới</Text>
                        <View style={styles.inputWrap}>
                          <View style={styles.leadingIconWrap}>
                            <Feather name="lock" size={17} color={THEME.textMuted} />
                          </View>
                          <TextInput
                            style={styles.passwordInput}
                            placeholder="Tối thiểu 6 ký tự"
                            placeholderTextColor="#AE9985"
                            secureTextEntry={!forgotShowPass}
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={forgotNewPassword}
                            onChangeText={setForgotNewPassword}
                          />
                          <Pressable
                            onPress={() => setForgotShowPass((v) => !v)}
                            hitSlop={8}
                            style={styles.trailingIconBtn}
                          >
                            <Feather
                              name={forgotShowPass ? 'eye-off' : 'eye'}
                              size={18}
                              color={THEME.textMuted}
                            />
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Nhập lại mật khẩu</Text>
                        <View style={styles.inputWrap}>
                          <View style={styles.leadingIconWrap}>
                            <Feather name="lock" size={17} color={THEME.textMuted} />
                          </View>
                          <TextInput
                            style={styles.passwordInput}
                            placeholder="Trùng khớp mật khẩu mới"
                            placeholderTextColor="#AE9985"
                            secureTextEntry={!forgotShowPass}
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={forgotConfirmPassword}
                            onChangeText={setForgotConfirmPassword}
                          />
                        </View>
                      </View>

                      <Pressable
                        style={({ pressed }) => [
                          styles.submitBtn,
                          !canSubmitForgotReset && styles.submitBtnDisabled,
                          pressed && canSubmitForgotReset && styles.submitBtnPressed,
                        ]}
                        onPress={() => void handleForgotReset()}
                        disabled={!canSubmitForgotReset}
                      >
                        {forgotResetting ? (
                          <ActivityIndicator color={THEME.white} />
                        ) : (
                          <>
                            <Text style={styles.submitText}>Xác nhận đặt lại mật khẩu</Text>
                            <Feather name="check" size={18} color={THEME.white} />
                          </>
                        )}
                      </Pressable>
                    </>
                  )}

                  {error ? (
                    <View style={[styles.errorBox, { marginTop: forgotOtpSent ? 12 : 0 }]}>
                      <Feather name="alert-circle" size={15} color={THEME.error} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <View style={styles.formHeader}>
                    <Text style={styles.formTitle}>Đăng nhập tài khoản</Text>
                    <Text style={styles.formCaption}>
                      Sử dụng số điện thoại và mật khẩu của bạn
                    </Text>
                  </View>

                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>Số điện thoại</Text>
                    <View
                      style={[
                        styles.phoneWrap,
                        phoneFocused && styles.inputWrapFocused,
                        error ? styles.inputWrapError : null,
                      ]}
                    >
                      <View style={styles.countryPrefix}>
                        <Text style={styles.prefixFlag}>🇻🇳</Text>
                        <Text style={styles.prefixCode}>+84</Text>
                        <Feather name="chevron-down" size={15} color={THEME.textMuted} />
                      </View>

                      <TextInput
                        style={styles.phoneInput}
                        placeholder="Nhập số điện thoại"
                        placeholderTextColor="#AE9985"
                        keyboardType="phone-pad"
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={phone}
                        onChangeText={setPhone}
                        onFocus={() => setPhoneFocused(true)}
                        onBlur={() => setPhoneFocused(false)}
                      />
                    </View>
                  </View>

                  <View style={styles.fieldBlock}>
                    <View style={styles.passwordLabelRow}>
                      <Text style={styles.label}>Mật khẩu</Text>
                      <Text style={styles.helperText}>Tối thiểu 6 ký tự</Text>
                    </View>

                    <Pressable
                      style={[
                        styles.inputWrap,
                        passwordFocused && styles.inputWrapFocused,
                        error ? styles.inputWrapError : null,
                      ]}
                      onPress={() => passwordInputRef.current?.focus()}
                    >
                      <View style={styles.leadingIconWrap}>
                        <Feather name="lock" size={17} color={THEME.textMuted} />
                      </View>

                      <TextInput
                        ref={passwordInputRef}
                        style={styles.passwordInput}
                        placeholder="Nhập mật khẩu"
                        placeholderTextColor="#AE9985"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={password}
                        onChangeText={setPassword}
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={() => setPasswordFocused(false)}
                      />

                      <Pressable
                        onPress={() => setShowPassword((v) => !v)}
                        hitSlop={8}
                        style={styles.trailingIconBtn}
                      >
                        <Feather
                          name={showPassword ? 'eye-off' : 'eye'}
                          size={18}
                          color={THEME.textMuted}
                        />
                      </Pressable>
                    </Pressable>
                    <Pressable style={styles.forgotLinkWrap} onPress={openForgotPassword} hitSlop={8}>
                      <Text style={styles.forgotLinkText}>Quên mật khẩu?</Text>
                    </Pressable>
                  </View>

                  {error ? (
                    <View style={styles.errorBox}>
                      <Feather name="alert-circle" size={15} color={THEME.error} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}

                  <Pressable
                    style={({ pressed }) => [
                      styles.submitBtn,
                      !canSubmit && styles.submitBtnDisabled,
                      pressed && canSubmit && styles.submitBtnPressed,
                    ]}
                    onPress={() => void handleSubmit()}
                    disabled={!canSubmit}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color={THEME.white} />
                    ) : (
                      <>
                        <Text style={styles.submitText}>Đăng nhập</Text>
                        <Feather name="arrow-right" size={18} color={THEME.white} />
                      </>
                    )}
                  </Pressable>

                  <>
                      <View style={styles.dividerRow}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>HOẶC</Text>
                        <View style={styles.dividerLine} />
                      </View>

                      <Pressable style={styles.altBtn} onPress={onNavigateSignUp}>
                        <Feather name="user-plus" size={16} color={THEME.primary} />
                        <Text style={styles.altBtnText}>Tạo tài khoản mới</Text>
                      </Pressable>

                      <Pressable style={styles.switchBtn} onPress={onNavigateSignUp}>
                        <Text style={styles.switchText}>
                          Bạn chưa có tài khoản?{' '}
                          <Text style={styles.switchTextBold}>Đăng ký ngay</Text>
                        </Text>
                      </Pressable>
                    </>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  safe: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  bgOrbTop: {
    position: 'absolute',
    top: -70,
    right: -45,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(253, 129, 44, 0.10)',
  },

  bgOrbBottom: {
    position: 'absolute',
    bottom: -40,
    left: -30,
    width: 190,
    height: 190,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 101, 32, 0.08)',
  },

  scrollContent: {
    flexGrow: 1,
    paddingTop: 8,
    paddingBottom: 28,
  },

  container: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },

  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(253,129,44,0.16)',
    shadowColor: '#A7632A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(253,129,44,0.16)',
  },

  langFlag: {
    fontSize: 12,
  },

  langText: {
    color: THEME.text,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },

  heroCard: {
    backgroundColor: THEME.hero,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },

  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: '#FFF6EE',
    marginBottom: 10,
  },

  subtitle: {
    color: 'rgba(255, 243, 229, 0.92)',
    fontSize: 14.5,
    lineHeight: 22,
    marginBottom: 16,
  },

  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },

  heroStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  heroStatText: {
    color: '#FFF3E5',
    fontSize: 12.5,
    fontWeight: '700',
  },

  heroStatDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },

  formCard: {
    backgroundColor: THEME.card,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#A7632A',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },

  formHeader: {
    marginBottom: 16,
  },

  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 6,
  },

  formCaption: {
    fontSize: 13.5,
    lineHeight: 20,
    color: THEME.textMuted,
  },

  fieldBlock: {
    marginBottom: 14,
  },

  label: {
    fontSize: 14.5,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 9,
  },

  helperText: {
    fontSize: 12,
    color: THEME.textMuted,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 10,
  },

  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },

  phoneWrap: {
    borderWidth: 1.5,
    borderColor: THEME.border,
    borderRadius: 18,
    backgroundColor: THEME.inputBg,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },

  countryPrefix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
    borderRightWidth: 1,
    borderRightColor: THEME.border,
    backgroundColor: THEME.primarySoft,
  },

  prefixFlag: {
    fontSize: 15,
  },

  prefixCode: {
    fontSize: 15,
    color: THEME.text,
    fontWeight: '800',
  },

  phoneInput: {
    flex: 1,
    fontSize: 16.5,
    color: THEME.text,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  inputWrap: {
    borderWidth: 1.5,
    borderColor: THEME.border,
    borderRadius: 18,
    backgroundColor: THEME.inputBg,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 8,
  },

  inputWrapFocused: {
    borderColor: THEME.primary,
    backgroundColor: THEME.white,
    shadowColor: THEME.primary,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  inputWrapError: {
    borderColor: 'rgba(232, 78, 78, 0.30)',
  },

  leadingIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.bgSoft,
    borderWidth: 1,
    borderColor: THEME.border,
    marginRight: 8,
  },

  passwordInput: {
    flex: 1,
    fontSize: 16.5,
    color: THEME.text,
    paddingVertical: 12,
  },

  trailingIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.errorBg,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },

  errorText: {
    flex: 1,
    color: THEME.error,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },

  submitBtn: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
    shadowColor: THEME.primaryDark,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },

  submitBtnPressed: {
    transform: [{ scale: 0.992 }],
    opacity: 0.96,
  },

  submitBtnDisabled: {
    backgroundColor: '#DCCAB7',
    shadowOpacity: 0,
    elevation: 0,
  },

  submitText: {
    color: THEME.white,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    marginBottom: 14,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: THEME.border,
  },

  dividerText: {
    color: THEME.textMuted,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  altBtn: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: THEME.primarySoft,
    backgroundColor: THEME.primarySoft2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },

  altBtnText: {
    color: THEME.primary,
    fontSize: 15.5,
    fontWeight: '800',
  },

  switchBtn: {
    marginTop: 16,
    alignItems: 'center',
  },

  switchText: {
    color: THEME.textMuted,
    fontSize: 14.5,
  },

  switchTextBold: {
    color: THEME.primary,
    fontWeight: '800',
  },

  forgotBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },

  forgotBackText: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.primary,
  },

  forgotLinkWrap: {
    alignSelf: 'flex-end',
    marginTop: 10,
  },

  forgotLinkText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: THEME.primary,
  },

  otpInput: {
    borderWidth: 1.5,
    borderColor: THEME.border,
    borderRadius: 18,
    backgroundColor: THEME.inputBg,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 4,
    color: THEME.text,
    paddingVertical: 14,
    paddingHorizontal: 16,
    textAlign: 'center',
  },

  resendOtpBtn: {
    marginTop: 10,
    alignSelf: 'center',
    paddingVertical: 6,
  },

  resendOtpText: {
    color: THEME.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});