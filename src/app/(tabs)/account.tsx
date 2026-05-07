import Feather from '@expo/vector-icons/Feather';
import AppNoticeModal from '@/components/AppNoticeModal';
import { PhoneSignInScreen } from '@/components/PhoneSignInScreen';
import { PhoneSignUpScreen } from '@/components/PhoneSignUpScreen';
import VipMembershipScreen from '@/components/VipMembershipScreen';
import { SERVICE_TYPES, VIETNAM_PROVINCES } from '@/constants/bookingFilters';
import { isAdminPhone } from '@/constants/adminAccount';
import { AppColors } from '@/constants/appColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReviewMode } from '@/contexts/ReviewModeContext';
import { UserData, useUser } from '@/contexts/UserContext';
import { useTabletLayout } from '@/hooks/use-tablet-layout';
import {
  accountDeletionUsesOAuthSession,
  createPartnerApplication,
  deleteUserAccountOnServer,
  ensurePublicPartnerImageUris,
  signInUserAccountWithPhone,
  signUpWithPhone,
  upsertUserProfile,
} from '@/lib/supabaseService';
import { debugLog } from '@/lib/debugLog';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  primary: AppColors.primaryDark,
  primaryDark: AppColors.primaryDark,
  primaryLight: AppColors.primarySoft,
  gold: '#F5A623',
  goldLight: '#FFF8E1',
  bg: AppColors.bg,
  white: AppColors.white,
  text: AppColors.text,
  subText: AppColors.textMuted,
  border: AppColors.border,
  red: AppColors.danger,
};

/** Cùng tông với icon tab bar (Feather outline). */
const NAV_ICON = '#6B5F52';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

const VN_PROVINCES = VIETNAM_PROVINCES.map((p) => (p === 'TP.HCM' ? 'TP. Hồ Chí Minh' : p));

/** Cùng danh mục tỉnh/thành với màn đăng ký SĐT (PhoneSignUpScreen). */
const PROFILE_PROVINCE_SET = new Set(VIETNAM_PROVINCES as readonly string[]);

const THERAPIST_SERVICE_OPTIONS = SERVICE_TYPES.filter((name) => name !== 'Tất cả');

const SERVICE_PRICING: Record<string, { duration: string; price: string }[]> = {
  'Massage Dầu + Giác Hơi': [
    { duration: '60 phút', price: '500.000 đ' },
    { duration: '90 phút', price: '600.000 đ' },
    { duration: '120 phút', price: '700.000 đ' },
  ],
  'Massage Đá Nóng': [
    { duration: '60 phút', price: '500.000 đ' },
    { duration: '90 phút', price: '600.000 đ' },
    { duration: '120 phút', price: '700.000 đ' },
  ],
  'Massage Thái': [
    { duration: '60 phút', price: '500.000 đ' },
    { duration: '90 phút', price: '600.000 đ' },
    { duration: '120 phút', price: '700.000 đ' },
  ],
  'Massage Aroma': [
    { duration: '60 phút', price: '500.000 đ' },
    { duration: '90 phút', price: '600.000 đ' },
    { duration: '120 phút', price: '700.000 đ' },
  ],
  'Massage Chân': [
    { duration: '60 phút', price: '500.000 đ' },
    { duration: '90 phút', price: '600.000 đ' },
    { duration: '120 phút', price: '700.000 đ' },
  ],
  'Massage Cổ Vai Gáy': [
    { duration: '60 phút', price: '500.000 đ' },
    { duration: '90 phút', price: '600.000 đ' },
    { duration: '120 phút', price: '700.000 đ' },
  ],
  'Massage Dầu': [
    { duration: '60 phút', price: '500.000 đ' },
    { duration: '90 phút', price: '600.000 đ' },
    { duration: '120 phút', price: '700.000 đ' },
  ],
  'Massage Không Dầu': [
    { duration: '60 phút', price: '500.000 đ' },
    { duration: '90 phút', price: '600.000 đ' },
    { duration: '120 phút', price: '700.000 đ' },
  ],
  'Wax Bikini': [
    { duration: '60 phút', price: '500.000 đ' },
    { duration: '90 phút', price: '600.000 đ' },
  ],
  'Tắm tẩy tế bào chết toàn thân Hàn Quốc': [
    { duration: '60 phút', price: '500.000 đ' },
    { duration: '90 phút', price: '600.000 đ' },
  ],
  'Lấy ráy tai': [
    { duration: '30 phút', price: '300.000 đ' },
    { duration: '60 phút', price: '500.000 đ' },
  ],
};
const LEGACY_SERVICE_MAP: Record<string, string> = {
  'Massage body': 'Massage Dầu',
  'Foot massage': 'Massage Chân',
  'Massage cổ vai gáy': 'Massage Cổ Vai Gáy',
  'Gội đầu dưỡng sinh': 'Massage Aroma',
  'Chăm sóc da': 'Tắm tẩy tế bào chết toàn thân Hàn Quốc',
};

function toAuthUserData(profile: Record<string, unknown>): UserData {
  const base = profile as Partial<UserData>;
  const createdAt =
    typeof base.createdAt === 'string' && base.createdAt.trim()
      ? base.createdAt
      : new Date().toISOString();
  const isAdminByRole = base.role === 'admin';
  const isAdminByPhone = isAdminPhone(base.phoneNumber);
  const normalizedRole = isAdminByRole || isAdminByPhone
    ? 'admin'
    : base.role === 'therapist'
      ? 'therapist'
      : 'customer';

  return {
    ...base,
    createdAt,
    role: normalizedRole,
    partnerApplicationStatus:
      base.partnerApplicationStatus === 'pending' ||
      base.partnerApplicationStatus === 'approved' ||
      base.partnerApplicationStatus === 'rejected'
        ? base.partnerApplicationStatus
        : 'none',
  };
}

function normalizeVietnameseText(value: string, maxChars: number): string {
  const normalized = value.normalize('NFC');
  const chars = Array.from(normalized);
  if (chars.length <= maxChars) {
    return normalized;
  }
  return chars.slice(0, maxChars).join('');
}

function getErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  let raw = '';
  if (error instanceof Error && error.message.trim()) raw = error.message;
  else if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    raw = (error as { message: string }).message.trim();
  }
  if (!raw) return fallbackMessage;
  if (
    raw.includes('partner_applications_user_id_fkey') ||
    (raw.includes('foreign key') && raw.includes('partner_applications'))
  ) {
    return 'Máy chủ chưa cập nhật cấu hình tài khoản. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.';
  }
  if (raw === 'partner-image-read-failed') {
    return 'Không đọc được ảnh. Vui lòng chọn lại hoặc thử ảnh khác.';
  }
  if (raw === 'missing-supabase-config') {
    return 'Ứng dụng chưa cấu hình máy chủ. Vui lòng liên hệ hỗ trợ.';
  }
  return raw;
}

function getAccountDeleteErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (raw.includes('invalid_credentials')) {
    return 'Mật khẩu không đúng. Vui lòng kiểm tra lại.';
  }
  if (raw.includes('not_authenticated') || raw.includes('missing_auth')) {
    return 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.';
  }
  if (raw.includes('crypt(') || raw.includes('pgcrypto')) {
    return 'Máy chủ chưa sẵn sàng để xác nhận mật khẩu. Vui lòng thử lại sau.';
  }
  return raw.trim() || 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

function getPhoneSignUpErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null
        ? String((error as { message?: unknown }).message ?? '')
        : String(error || '');
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const details =
    typeof error === 'object' && error !== null && 'details' in error
      ? String((error as { details?: unknown }).details ?? '')
      : '';
  const hint =
    typeof error === 'object' && error !== null && 'hint' in error
      ? String((error as { hint?: unknown }).hint ?? '')
      : '';
  const combined = `${raw} ${details} ${hint} ${code}`.toLowerCase();
  const msg = combined.trim();

  if (msg.includes('phone_already_registered') || (code.toLowerCase() === 'p0001' && msg.includes('phone_already'))) {
    return 'Số điện thoại đã tồn tại. Vui lòng đăng nhập.';
  }
  if (msg.includes('signup_no_uid_response')) {
    return 'Máy chủ không trả về mã tài khoản sau khi đăng ký. Hãy cập nhật app/kiểm tra Supabase rồi thử lại.';
  }
  if (
    msg.includes('could not find the function') ||
    (msg.includes('pgrst202') && (msg.includes('rpc') || msg.includes('signup_with_phone') || msg.includes('signin_with_phone'))) ||
    (msg.includes('schema cache') && (msg.includes('rpc') || msg.includes('postgrest'))) ||
    /signup_with_phone|signin_with_phone/.test(msg) && (msg.includes('does not exist') || msg.includes('not found') || msg.includes('undefined'))
  ) {
    return 'Thiếu RPC đăng ký trên Supabase (signup_with_phone/signin_with_phone). Hãy chạy migration DB rồi thử lại.';
  }
  if (msg.includes('pgcrypto') || msg.includes('gen_salt') || msg.includes('crypt(')) {
    return 'Máy chủ xác thực chưa sẵn sàng. Vui lòng thử lại sau.';
  }
  if (
    msg.includes('permission denied') ||
    msg.includes('not allowed') ||
    msg.includes('insufficient privilege') ||
    code === '42501'
  ) {
    return 'Máy chủ chưa cấp quyền đăng ký. Vui lòng cập nhật quyền trên Supabase rồi thử lại.';
  }
  if (
    msg.includes("relation 'profiles' does not exist") ||
    msg.includes('relation "profiles" does not exist')
  ) {
    return 'Bảng hồ sơ (profiles) chưa có trên Supabase. Cần chạy migration.';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout')) {
    return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';
  }
  if (msg.includes('native module')) {
    return 'Lỗi nội bộ ứng dụng (native). Hãy cập nhật bản build mới nhất hoặc thử lại sau.';
  }
  if (msg.includes('invalid input syntax for type uuid')) {
    return 'Dữ liệu tài khoản chưa hợp lệ trên máy chủ. Vui lòng thử lại sau.';
  }
  if (msg.includes('upsertuserprofile')) {
    const tail = raw.replace(/^upsertUserProfile:\s*/i, '').trim().slice(0, 320);
    return tail
      ? `Không lưu được hồ sơ sau đăng ký: ${tail}`
      : 'Không lưu được họ tên, tuổi hoặc khu vực lên máy chủ. Kiểm tra kết nối hoặc thử lại.';
  }

  return raw.trim() || details.trim() || hint.trim() || 'Đăng ký thất bại. Vui lòng thử lại.';
}

type NoticeModalState = {
  visible: boolean;
  title: string;
  message: string;
  variant: 'default' | 'success' | 'danger';
};

const DEFAULT_NOTICE_STATE: NoticeModalState = {
  visible: false,
  title: '',
  message: '',
  variant: 'default',
};

export default function AccountScreen() {
  const tabBarBottomInset = useBottomTabBarHeight();
  const { language, setLanguage } = useLanguage();
  const { hideVipSubscription } = useReviewMode();
  const { user, setUser, logout } = useUser();
  const router = useRouter();
  const [currentScreen, setCurrentScreen] = useState<
    'account' | 'signin' | 'signup' | 'profile' | 'therapistSetup' | 'vipMembership' | 'partnerSignupType' | 'partnerBusinessSignup'
  >('account');
  const [country] = useState({ code: 'VN', label: 'Việt Nam', flag: '\uD83C\uDDFB\uD83C\uDDF3' });
  const tabletLayout = useTabletLayout();

  const handlePhoneSignIn = async (payload: { phone: string; password: string }) => {
    const profile = await signInUserAccountWithPhone(payload.phone, payload.password);
    if (!profile) {
      throw new Error('Số điện thoại hoặc mật khẩu không đúng.');
    }
    await setUser(toAuthUserData(profile));
    setCurrentScreen('account');
  };

  const handlePhoneSignUp = async (payload: {
    displayName: string;
    phone: string;
    password: string;
    area: string;
    age: number;
  }) => {
    try {
      await signUpWithPhone(payload.phone, payload.password);
    } catch (e) {
      debugLog('PhoneSignUp', 'signUpWithPhone failed', e);
      throw new Error(getPhoneSignUpErrorMessage(e));
    }

    try {
      const profile = await signInUserAccountWithPhone(payload.phone, payload.password);
      if (!profile) {
        throw new Error('Không thể tạo tài khoản. Vui lòng thử lại.');
      }

      const nextUser = toAuthUserData(profile);
      if (payload.displayName.trim()) {
        nextUser.displayName = payload.displayName.trim();
      }
      if (payload.area.trim()) {
        nextUser.selectedCity = payload.area.trim();
      }
      if (Number.isFinite(payload.age) && payload.age > 0) {
        nextUser.age = payload.age;
      }
      // Lưu họ tên / tuổi / khu vực lên Supabase trước khi cache local — nếu lỗi phải báo, không nuốt lỗi như setUser.
      try {
        await upsertUserProfile(nextUser as Record<string, unknown>);
      } catch (syncErr) {
        debugLog('PhoneSignUp', 'upsertUserProfile after signup failed', syncErr);
        console.warn('[PhoneSignUp] upsertUserProfile after signup failed', syncErr);
        throw syncErr instanceof Error ? syncErr : new Error(String(syncErr));
      }
      await setUser(nextUser, { skipRemotePersist: true });
      setCurrentScreen('account');
    } catch (e) {
      debugLog('PhoneSignUp', 'post-signup signIn or profile failed', e);
      throw new Error(getPhoneSignUpErrorMessage(e));
    }
  };

  if (currentScreen === 'signin' || (!user && currentScreen === 'account')) {
    return (
      <PhoneSignInScreen
        onBack={() => router.replace('/')}
        onNavigateSignUp={() => setCurrentScreen('signup')}
        onSubmit={handlePhoneSignIn}
      />
    );
  }
  if (currentScreen === 'signup') {
    return (
      <PhoneSignUpScreen
        onBack={() => router.replace('/')}
        onNavigateSignIn={() => setCurrentScreen('signin')}
        onSubmit={handlePhoneSignUp}
      />
    );
  }
  if (currentScreen === 'profile' && user) {
    return (
      <ProfileDetailsScreen
        user={user}
        onBack={() => setCurrentScreen('account')}
        onSave={async (updatedUser) => {
          try {
            await upsertUserProfile(updatedUser as Record<string, unknown>);
          } catch (e) {
            debugLog('ProfileDetails', 'upsertUserProfile failed', e);
            const raw =
              e instanceof Error
                ? e.message
                : String((e as { message?: string })?.message ?? e ?? '');
            throw new Error(
              /permission|pgrst|not allowed|insufficient|42501|upsert|rpc|column|timeout|fetch/i.test(
                String(raw).toLowerCase(),
              )
                ? 'Không lưu được hồ sơ lên máy chủ. Kiểm tra mạng, quyền Supabase (upsert_profile) hoặc thử lại.'
                : raw.trim() || 'Không lưu được hồ sơ. Vui lòng thử lại.',
            );
          }
          await setUser(updatedUser, { skipRemotePersist: true });
          setCurrentScreen('account');
        }}
      />
    );
  }
  if (currentScreen === 'therapistSetup' && user) {
    return (
      <TherapistSetupScreen
        user={user}
        onBack={() => setCurrentScreen('account')}
        onSave={async (updatedUser) => {
          try {
            await upsertUserProfile(updatedUser as Record<string, unknown>);
          } catch (e) {
            debugLog('TherapistSetup', 'upsertUserProfile failed', e);
            const raw =
              e instanceof Error
                ? e.message
                : String((e as { message?: string })?.message ?? e ?? '');
            throw new Error(
              /permission|pgrst|not allowed|insufficient|42501|upsert|rpc|column|timeout|fetch/i.test(
                String(raw).toLowerCase(),
              )
                ? 'Không lưu được hồ sơ lên máy chủ. Kiểm tra mạng, quyền Supabase (upsert_profile) hoặc thử lại.'
                : raw.trim() || 'Không lưu được hồ sơ. Vui lòng thử lại.',
            );
          }
          await setUser(updatedUser, { skipRemotePersist: true });
          setCurrentScreen('account');
        }}
      />
    );
  }
  if (currentScreen === 'vipMembership' && user && !hideVipSubscription) {
    return (
      <VipMembershipScreen onClose={() => setCurrentScreen('account')} />
    );
  }
  if (currentScreen === 'partnerSignupType') {
    return (
      <PartnerSignupTypeScreen
        language={language}
        onBack={() => setCurrentScreen('account')}
        onSelectIndividual={() => setCurrentScreen('therapistSetup')}
        onSelectBusiness={() => setCurrentScreen('partnerBusinessSignup')}
      />
    );
  }
  if (currentScreen === 'partnerBusinessSignup') {
    return <BusinessPartnerSignupScreen language={language} onBack={() => setCurrentScreen('partnerSignupType')} />;
  }
  const displayName = user?.displayName || user?.phoneNumber || '';
  const isAdminAccount = user?.role === 'admin' || isAdminPhone(user?.phoneNumber);
  const langLabel = language === 'vi' ? 'Tiếng Việt' : 'English';
  const genderLabel = user?.gender === 'female' ? 'Nữ' : user?.gender === 'male' ? 'Nam' : '';
  const avatarInitials = getInitials(displayName || 'Zena');
  const vipLabel = user?.isVipMember ? 'Hội viên VIP' : 'Đăng ký trở thành hội viên';

  const handleDeleteAccount = async (password?: string) => {
    if (!user) return;
    await deleteUserAccountOnServer(user, password);
    await logout();
    Alert.alert('Đã xóa tài khoản', 'Dữ liệu tài khoản trên hệ thống đã được gỡ.');
  };

  const rewardPromoCard = (
    <TouchableOpacity
      style={s.promoRewardCard}
      activeOpacity={0.85}
      onPress={() => Alert.alert('Sắp ra mắt', 'Tính năng này sắp ra mắt.')}
    >
      <Image
        source={require('@/assets/images/promo-reward-banner.png')}
        style={s.promoRewardBannerImg}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );

  const partnerPromoCard = user?.role === 'therapist' ? (
    <TouchableOpacity style={s.promoRewardCard} activeOpacity={0.85} onPress={() => setCurrentScreen('therapistSetup')}>
      <Image
        source={require('@/assets/images/ktv2.png')}
        style={s.promoRewardBannerImg}
        resizeMode="cover"
      />
    </TouchableOpacity>
  ) : (
    <TouchableOpacity style={s.promoRewardCard} activeOpacity={0.85} onPress={() => setCurrentScreen('partnerSignupType')}>
      <Image
        source={require('@/assets/images/promo-partner-banner.png')}
        style={s.promoRewardBannerImg}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );

  if (user?.role === 'therapist') {
    return (
      <SafeAreaView style={s.therapistContainer} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: tabBarBottomInset + 24 }}
        >
          <View style={s.therapistTop}>
            <View style={s.profileHeader}>
              <View style={s.avatarCircle}>
                {user.avatarUri ? (
                  <Image source={{ uri: user.avatarUri }} style={s.avatarImage} />
                ) : (
                  <Text style={s.avatarInitials}>{avatarInitials}</Text>
                )}
              </View>
              <View style={s.profileInfo}>
                <View style={s.profileNameRow}>
                  <Text style={s.profileName}>{displayName}</Text>
                  {isAdminAccount ? (
                    <View style={s.adminBadge}>
                      <Text style={s.adminBadgeText}>✓</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={s.profilePhone}>{user.email || user.phoneNumber || ''}</Text>
              </View>
            </View>

            {!hideVipSubscription ? (
              <TouchableOpacity style={s.vipBanner} activeOpacity={0.85} onPress={() => setCurrentScreen('vipMembership')}>
                <Feather name="award" size={20} color={COLORS.gold} />
                <Text style={s.vipText}>{vipLabel}</Text>
                <View style={s.vipBadge}><Text style={s.vipBadgeText}>VIP</Text></View>
              </TouchableOpacity>
            ) : null}

            <View style={[s.promoRow, tabletLayout.isTablet && s.promoRowTablet]}>
              {partnerPromoCard}
              {rewardPromoCard}
            </View>
          </View>

          <View style={s.menuCard}>
            <MenuRow icon="package" label="Lịch sử đơn hàng" onPress={() => router.push('/therapist-order-history')} />
            <MenuRow icon="user" label="Thông tin cá nhân" onPress={() => setCurrentScreen('profile')} />
            <MenuRow icon="globe" label="Ngôn ngữ" value={langLabel} onPress={() => setLanguage(language === 'vi' ? 'en' : 'vi')} />
            <MenuRow icon="flag" label="Quốc gia" value={`${country.flag} ${country.label}`} onPress={() => {}} />
            <MenuRow icon="info" label="Về chúng tôi" onPress={() => Alert.alert('Zena', 'Phiên bản 1.0.0')} isLast />
          </View>

          <TouchableOpacity style={s.logoutBtn} onPress={logout} activeOpacity={0.85}>
            <Feather name="log-out" size={18} color={COLORS.red} />
            <Text style={s.logoutBtnText}>Đăng xuất</Text>
          </TouchableOpacity>

          <AccountDeleteEntry user={user} onDeleteComplete={handleDeleteAccount} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarBottomInset + 24 }}
      >

        {/*  LOGGED IN VIEW  */}
        {user ? (
          <>
            {/* Avatar + Name */}
            <View style={s.profileHeader}>
              <View style={s.avatarCircle}>
                {user.avatarUri ? (
                  <Image source={{ uri: user.avatarUri }} style={s.avatarImage} />
                ) : (
                  <Text style={s.avatarInitials}>{avatarInitials}</Text>
                )}
              </View>
              <View style={s.profileInfo}>
                <View style={s.profileNameRow}>
                  <Text style={s.profileName}>{displayName}</Text>
                  {isAdminAccount ? (
                    <View style={s.adminBadge}>
                      <Text style={s.adminBadgeText}>✓</Text>
                    </View>
                  ) : null}
                </View>
                {(user.email || user.phoneNumber) && <Text style={s.profilePhone}>{user.email || user.phoneNumber}</Text>}
                {genderLabel ? <Text style={s.profileGender}>{genderLabel}</Text> : null}
              </View>
            </View>

            {/* VIP Banner */}
            {!hideVipSubscription ? (
              <TouchableOpacity style={s.vipBanner} activeOpacity={0.85} onPress={() => setCurrentScreen('vipMembership')}>
                <Feather name="award" size={20} color={COLORS.gold} />
                <Text style={s.vipText}>{vipLabel}</Text>
                <View style={s.vipBadge}><Text style={s.vipBadgeText}>VIP</Text></View>
              </TouchableOpacity>
            ) : null}

            {/* Promo cards */}
            <View style={[s.promoRow, tabletLayout.isTablet && s.promoRowTablet]}>
              {partnerPromoCard}
              {rewardPromoCard}
            </View>

            {/* Menu */}
            <View style={s.menuCard}>
              <MenuRow icon="clock" label="Lịch sử hoạt động" onPress={() => router.push('/activity')} />
              <MenuRow icon="user" label="Thông tin cá nhân" onPress={() => setCurrentScreen('profile')} />
              <MenuRow icon="globe" label="Ngôn ngữ" value={langLabel} onPress={() => setLanguage(language === 'vi' ? 'en' : 'vi')} />
              <MenuRow icon="flag" label="Quốc gia" value={`${country.flag} ${country.label}`} onPress={() => {}} />
              <MenuRow icon="info" label="Về chúng tôi" onPress={() => Alert.alert('Zena', 'Phiên bản 1.0.0\n\nỨng dụng đặt lịch massage và spa tại nhà.\n\n© 2026 Zena. All rights reserved.')} isLast />
            </View>

            {/* Logout */}
            <TouchableOpacity style={s.logoutBtn} onPress={logout} activeOpacity={0.85}>
              <Feather name="log-out" size={18} color={COLORS.red} />
              <Text style={s.logoutBtnText}>Đăng xuất</Text>
            </TouchableOpacity>

            <AccountDeleteEntry user={user} onDeleteComplete={handleDeleteAccount} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PartnerSignupTypeScreen({
  language,
  onBack,
  onSelectIndividual,
  onSelectBusiness,
}: {
  language: 'vi' | 'en';
  onBack: () => void;
  onSelectIndividual: () => void;
  onSelectBusiness: () => void;
}) {
  const isEn = language === 'en';
  const title = isEn ? 'What would you like to register as?' : 'Bạn muốn đăng ký làm gì?';

  return (
    <SafeAreaView style={s.partnerContainer} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={s.partnerHeader}>
        <TouchableOpacity style={s.backButton} onPress={onBack} activeOpacity={0.8}>
          <Text style={s.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={s.headerSpacer} />
      </View>

      <View style={s.partnerContent}>
        <Text style={s.partnerTitle}>{title}</Text>

        <TouchableOpacity style={s.partnerOptionCard} activeOpacity={0.9} onPress={onSelectIndividual}>
          <View style={s.partnerOptionTextWrap}>
            <Text style={s.partnerOptionTitle}>
              {isEn ? 'Independent service provider' : 'Cá nhân làm việc thời vụ'}
            </Text>
            <Text style={s.partnerOptionDesc}>
              {isEn
                ? 'Therapists and spa specialists looking for additional flexible income.'
                : 'Kỹ thuật viên Massage, Spa đang mong muốn tìm kiếm thêm nguồn thu nhập mới'}
            </Text>
          </View>
          <View style={s.partnerOptionIconWrap}>
            <Feather name="user" size={26} color={AppColors.primaryDark} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={s.partnerOptionCard} activeOpacity={0.9} onPress={onSelectBusiness}>
          <View style={s.partnerOptionTextWrap}>
            <Text style={s.partnerOptionTitle}>
              {isEn ? 'Spa business / organization' : 'Tổ chức, doanh nghiệp spa'}
            </Text>
            <Text style={s.partnerOptionDesc}>
              {isEn
                ? 'Reach more customers and manage your team with Zena partner tools.'
                : 'Zena giúp đối tác tiếp cận hàng triệu khách hàng và quản lý vận hành tốt hơn.'}
            </Text>
          </View>
          <View style={s.partnerOptionIconWrap}>
            <Feather name="briefcase" size={26} color={AppColors.primaryDark} />
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function BusinessPartnerSignupScreen({
  language,
  onBack,
}: {
  language: 'vi' | 'en';
  onBack: () => void;
}) {
  const { user, setUser } = useUser();
  const isEn = language === 'en';
  const [branchImages, setBranchImages] = useState<string[]>([]);
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [city, setCity] = useState('');
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [weekdayStart, setWeekdayStart] = useState('');
  const [weekdayEnd, setWeekdayEnd] = useState('');
  const [weekendStart, setWeekendStart] = useState('');
  const [weekendEnd, setWeekendEnd] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<NoticeModalState>(DEFAULT_NOTICE_STATE);

  const cityOptions = VN_PROVINCES;
  const filteredCities = cityOptions.filter((item) =>
    item.toLowerCase().includes(cityQuery.trim().toLowerCase()),
  );

  const pickBranchImage = async () => {
    if (branchImages.length >= 6) {
      Alert.alert(
        isEn ? 'Maximum reached' : 'Đã đủ ảnh',
        isEn ? 'You can upload up to 6 images.' : 'Bạn chỉ có thể tải tối đa 6 ảnh.',
      );
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        isEn ? 'Permission needed' : 'Chưa có quyền',
        isEn ? 'Please allow access to your photo library.' : 'Vui lòng cho phép ứng dụng truy cập thư viện ảnh.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setBranchImages((prev) => [...prev, result.assets[0].uri].slice(0, 6));
    }
  };

  const removeBranchImage = (index: number) => {
    setBranchImages((prev) => prev.filter((_, i) => i !== index));
  };

  const valid = branchImages.length >= 2 && !!branchName.trim() && !!branchAddress.trim() && !!city.trim();
  const showNotice = (next: Omit<NoticeModalState, 'visible'>) => {
    setNotice({ ...next, visible: true });
  };

  const save = async () => {
    if (!user?.phoneNumber) {
      showNotice({
        title: 'Cần đăng nhập',
        message: 'Vui lòng đăng nhập trước khi gửi hồ sơ đối tác.',
        variant: 'default',
      });
      return;
    }

    if (!valid) {
      showNotice({
        title: 'Thiếu thông tin bắt buộc',
        message: 'Vui lòng thêm ít nhất 2 ảnh và điền đầy đủ các trường bắt buộc.',
        variant: 'danger',
      });
      return;
    }
    setIsSaving(true);
    try {
      const applicationId = await createPartnerApplication({
        userId: user.authUid,
        applicationType: 'business',
        phoneNumber: user.phoneNumber,
        displayName: user.displayName || branchName.trim(),
        imageUris: branchImages,
        businessName: branchName.trim(),
        businessAddress: branchAddress.trim(),
        workingCity: city.trim(),
        weekdayHours: {
          start: weekdayStart.trim(),
          end: weekdayEnd.trim(),
        },
        weekendHours: {
          start: weekendStart.trim(),
          end: weekendEnd.trim(),
        },
      });

      await setUser({
        ...user,
        role: user.role === 'therapist' ? 'therapist' : user.role === 'admin' ? 'admin' : 'customer',
        partnerApplicationId: applicationId,
        partnerApplicationStatus: 'pending',
      });

      showNotice({
        title: '✅ Gửi hồ sơ thành công',
        message: 'Hồ sơ doanh nghiệp và hình ảnh của bạn đã được gửi đến quản trị viên để phê duyệt.',
        variant: 'success',
      });
    } catch (error) {
      const message = getErrorMessage(
        error,
        'Không thể gửi hồ sơ. Vui lòng thử lại.',
      );
      showNotice({
        title: '❌ Gửi hồ sơ thất bại',
        message:
          message === 'missing-user-id'
            ? 'Không tìm thấy phiên đăng nhập. Vui lòng đăng nhập lại rồi gửi hồ sơ.'
            : message,
        variant: 'danger',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.partnerContainer} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <View style={s.partnerHeader}>
        <TouchableOpacity style={s.backButton} onPress={onBack} activeOpacity={0.8}>
          <Text style={s.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={s.businessHeaderTitle}>{isEn ? 'Add branch' : 'Thêm chi nhánh'}</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.businessContent}>
        <Text style={s.businessLabel}>{isEn ? 'Branch images' : 'Hình ảnh'} <Text style={s.requiredStar}>*</Text></Text>
        <View style={s.businessImageGrid}>
          {Array.from({ length: 6 }).map((_, index) => {
            const uri = branchImages[index];
            return (
              <TouchableOpacity key={`branch-img-${index}`} style={s.businessImageSlot} onPress={pickBranchImage} activeOpacity={0.85}>
                {uri ? (
                  <>
                    <Image source={{ uri }} style={s.businessImage} />
                    <TouchableOpacity
                      style={s.businessRemoveBtn}
                      onPress={() => removeBranchImage(index)}
                      activeOpacity={0.8}
                    >
                      <Text style={s.businessRemoveText}>×</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Feather name="image" size={28} color="#C5B8BB" />
                    <Text style={s.businessImagePlaceholderText}>{isEn ? 'Add image' : 'Thêm ảnh'}</Text>
                    <View style={s.businessPlusBadge}>
                      <Text style={s.businessPlusBadgeText}>+</Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        {branchImages.length < 2 ? (
          <Text style={s.businessWarning}>❗ {isEn ? 'Please add at least 2 images' : 'Vui lòng thêm ít nhất 2 ảnh'}</Text>
        ) : null}
        <Text style={s.setupServiceHint}>
          {isEn
            ? 'Images are reviewed by admin. Inappropriate content will not be approved.'
            : 'Hình ảnh sẽ được quản trị viên duyệt nội dung. Ảnh phản cảm sẽ không được phê duyệt.'}
        </Text>

        <Text style={s.businessLabel}>{isEn ? 'Branch name' : 'Tên chi nhánh'} <Text style={s.requiredStar}>*</Text></Text>
        <TextInput
          style={s.businessInput}
          placeholder={isEn ? 'Enter branch name' : 'Nhập tên chi nhánh'}
          placeholderTextColor="#9E8585"
          value={branchName}
          onChangeText={setBranchName}
          autoCapitalize="words"
          autoCorrect={false}
          spellCheck={false}
        />

        <Text style={s.businessLabel}>{isEn ? 'Address' : 'Địa chỉ'} <Text style={s.requiredStar}>*</Text></Text>
        <TextInput
          style={s.businessInput}
          placeholder={isEn ? 'Enter branch address' : 'Nhập địa chỉ chi nhánh'}
          placeholderTextColor="#9E8585"
          value={branchAddress}
          onChangeText={setBranchAddress}
          autoCapitalize="sentences"
          autoCorrect={false}
          spellCheck={false}
        />

        <Text style={s.businessLabel}>{isEn ? 'Province/City' : 'Tỉnh/Thành phố'} <Text style={s.requiredStar}>*</Text></Text>
        <TouchableOpacity style={s.businessSelect} activeOpacity={0.85} onPress={() => setShowCityPicker(true)}>
          <Text style={[s.businessSelectText, !city && s.businessSelectPlaceholder]}>
            {city || (isEn ? 'Select province/city' : 'Chọn tỉnh/thành phố')}
          </Text>
          <Text style={s.businessSelectArrow}>▾</Text>
        </TouchableOpacity>

        <Text style={s.businessLabel}>{isEn ? 'Working hours' : 'Thời gian hoạt động'}</Text>

        <View style={s.businessTimeRow}>
          <Text style={s.businessTimeLabel}>{isEn ? 'Mon - Fri' : 'Thứ 2 - Thứ 6'}</Text>
          <TextInput
            style={s.businessTimeInput}
            placeholder="08:00"
            placeholderTextColor="#9E8585"
            value={weekdayStart}
            onChangeText={setWeekdayStart}
          />
          <Text style={s.businessTimeDash}>-</Text>
          <TextInput
            style={s.businessTimeInput}
            placeholder="22:00"
            placeholderTextColor="#9E8585"
            value={weekdayEnd}
            onChangeText={setWeekdayEnd}
          />
        </View>

        <View style={s.businessTimeRow}>
          <Text style={s.businessTimeLabel}>{isEn ? 'Sat - Sun' : 'Thứ 7 - Chủ nhật'}</Text>
          <TextInput
            style={s.businessTimeInput}
            placeholder="09:00"
            placeholderTextColor="#9E8585"
            value={weekendStart}
            onChangeText={setWeekendStart}
          />
          <Text style={s.businessTimeDash}>-</Text>
          <TextInput
            style={s.businessTimeInput}
            placeholder="21:00"
            placeholderTextColor="#9E8585"
            value={weekendEnd}
            onChangeText={setWeekendEnd}
          />
        </View>

        <TouchableOpacity
          style={[s.businessSaveBtn, (!valid || isSaving) && s.businessSaveBtnDisabled]}
          onPress={save}
          disabled={!valid || isSaving}
          activeOpacity={0.9}
        >
          <Text style={[s.businessSaveBtnText, (!valid || isSaving) && s.businessSaveBtnTextDisabled]}>
            {isSaving ? (isEn ? 'Saving...' : 'Đang lưu...') : (isEn ? 'Save' : 'Lưu')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showCityPicker} transparent animationType="slide" onRequestClose={() => setShowCityPicker(false)}>
        <View style={s.cityModalOverlay}>
          <View style={s.cityModalSheet}>
            <View style={s.cityModalHeader}>
              <Text style={s.cityModalTitle}>{isEn ? 'Select province/city' : 'Chọn tỉnh/thành phố'}</Text>
              <TouchableOpacity onPress={() => setShowCityPicker(false)} activeOpacity={0.8}>
                <Text style={s.cityModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={s.citySearchInput}
              value={cityQuery}
              onChangeText={setCityQuery}
              placeholder={isEn ? 'Search province/city...' : 'Tìm tỉnh/thành...'}
              placeholderTextColor="#9E8585"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />

            <FlatList
              data={filteredCities}
              keyExtractor={(item) => item}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const active = city === item;
                return (
                  <TouchableOpacity
                    style={[s.cityOptionRow, active && s.cityOptionRowActive]}
                    onPress={() => {
                      setCity(item);
                      setShowCityPicker(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.cityOptionText, active && s.cityOptionTextActive]}>{item}</Text>
                    {active ? <Text style={s.cityOptionCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={s.cityEmptyText}>{isEn ? 'No matching province/city' : 'Không tìm thấy tỉnh/thành phù hợp'}</Text>
              }
            />
          </View>
        </View>
      </Modal>
      <AppNoticeModal
        visible={notice.visible}
        title={notice.title}
        message={notice.message}
        primaryText={notice.variant === 'success' ? 'Về trang trước' : 'Đã hiểu'}
        onPrimaryPress={() => {
          const shouldGoBack = notice.variant === 'success';
          setNotice(DEFAULT_NOTICE_STATE);
          if (shouldGoBack) onBack();
        }}
        variant={notice.variant}
      />
    </SafeAreaView>
  );
}

function AccountDeleteEntry({
  user,
  onDeleteComplete,
}: {
  user: UserData;
  onDeleteComplete: (password?: string) => Promise<void>;
}) {
  const [showDeletePasswordModal, setShowDeletePasswordModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const runDelete = async (password?: string) => {
    setDeleteBusy(true);
    try {
      await onDeleteComplete(password);
    } catch (e) {
      Alert.alert('Không thể xóa tài khoản', getAccountDeleteErrorMessage(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Xóa tài khoản',
      'Tài khoản và dữ liệu liên quan (đặt lịch, địa chỉ, thông báo, ví…) sẽ bị xóa vĩnh viễn trên hệ thống. Bạn có chắc chắn?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Tiếp tục',
          style: 'destructive',
          onPress: async () => {
            const oauth = user.authUid
              ? await accountDeletionUsesOAuthSession(user.authUid)
              : false;
            if (oauth) {
              await runDelete();
            } else {
              setDeletePassword('');
              setShowDeletePasswordModal(true);
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <TouchableOpacity
        style={s.accountDeleteBtn}
        onPress={handleDelete}
        activeOpacity={0.75}
        disabled={deleteBusy}
      >
        <Feather name="trash-2" size={17} color={COLORS.red} />
        <Text style={s.accountDeleteBtnText}>
          {deleteBusy ? 'Đang xử lý...' : 'Xóa tài khoản'}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={showDeletePasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => !deleteBusy && setShowDeletePasswordModal(false)}
      >
        <View style={s.deleteModalBackdrop}>
          <View style={s.deleteModalCard}>
            <Text style={s.deleteModalTitle}>Xác nhận mật khẩu</Text>
            <Text style={s.deleteModalHint}>
              Nhập mật khẩu đăng nhập bằng số điện thoại để xóa tài khoản trên máy chủ.
            </Text>
            <TextInput
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Mật khẩu"
              placeholderTextColor="#A0A0A0"
              secureTextEntry
              style={s.deleteModalInput}
              editable={!deleteBusy}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            <View style={s.deleteModalActions}>
              <TouchableOpacity
                style={s.deleteModalCancelBtn}
                onPress={() => !deleteBusy && setShowDeletePasswordModal(false)}
                activeOpacity={0.8}
              >
                <Text style={s.deleteModalCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.deleteModalConfirmBtn}
                onPress={() => void runDelete(deletePassword)}
                activeOpacity={0.85}
                disabled={deleteBusy}
              >
                <Text style={s.deleteModalConfirmText}>{deleteBusy ? 'Đang xóa...' : 'Xóa vĩnh viễn'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function MenuRow({ icon, label, value, onPress, color, isLast }: {
  icon: FeatherIconName;
  label: string;
  value?: string;
  onPress: () => void;
  color?: string;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.menuRow, !isLast && s.menuRowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.menuRowLeft}>
        <View style={s.menuIconWrap}>
          <Feather name={icon} size={20} color={NAV_ICON} />
        </View>
        <Text style={[s.menuLabel, color ? { color } : null]}>{label}</Text>
      </View>
      <View style={s.menuRowRight}>
        {value ? <Text style={s.menuValue}>{value}</Text> : null}
        <Text style={s.menuChevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

function ProfileDetailsScreen({
  user,
  onBack,
  onSave,
}: {
  user: UserData;
  onBack: () => void;
  onSave: (user: UserData) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '');
  const [area, setArea] = useState(user.selectedCity?.trim() || '');
  const [ageInput, setAgeInput] = useState(
    user.age != null && Number(user.age) > 0 ? String(user.age) : '',
  );
  const [showProvinceModal, setShowProvinceModal] = useState(false);
  const [provinceQuery, setProvinceQuery] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>(user.gender || 'other');
  const [nationality, setNationality] = useState(user.nationality || 'Việt Nam');
  const [password, setPassword] = useState(user.password || '');
  const [avatarUri, setAvatarUri] = useState(user.avatarUri || '');
  const [isSaving, setIsSaving] = useState(false);
  const filteredProfileProvinces = useMemo(
    () =>
      VIETNAM_PROVINCES.filter((p) =>
        p.toLowerCase().includes(provinceQuery.trim().toLowerCase()),
      ),
    [provinceQuery],
  );
  const avatarInitials = getInitials(displayName || user.email || user.phoneNumber || 'Zena');

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Chưa có quyền', 'Vui lòng cho phép ứng dụng truy cập thư viện ảnh.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!phoneNumber.trim() && !user.email?.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập số điện thoại hoặc email.');
      return;
    }

    const ageTrim = ageInput.replace(/\D/g, '').slice(0, 2);
    if (ageTrim.length > 0) {
      const a = Number(ageTrim);
      if (!Number.isFinite(a) || a < 16 || a > 90) {
        Alert.alert('Độ tuổi', 'Nhập độ tuổi từ 16 đến 90, hoặc để trống.');
        return;
      }
    }
    if (area.trim() && !PROFILE_PROVINCE_SET.has(area.trim())) {
      Alert.alert('Khu vực', 'Vui lòng chọn tỉnh/thành trong danh sách.');
      return;
    }

    setIsSaving(true);
    try {
      const parsedAge = ageTrim.length > 0 ? Number(ageTrim) : undefined;
      await onSave({
        ...user,
        displayName: displayName.trim(),
        phoneNumber: phoneNumber.trim(),
        selectedCity: area.trim() || undefined,
        age: parsedAge,
        gender,
        nationality: nationality.trim(),
        password: password.trim(),
        avatarUri,
      });
      Alert.alert('Thành công', 'Thông tin tài khoản đã được cập nhật.');
    } catch (e) {
      const message =
        e instanceof Error ? e.message.trim() : 'Không lưu được hồ sơ. Vui lòng thử lại.';
      Alert.alert('Lỗi lưu hồ sơ', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.profileDetailsContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={s.profileDetailsHeader}>
          <TouchableOpacity style={s.backButton} onPress={onBack} activeOpacity={0.7}>
            <Text style={s.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={s.profileDetailsTitle}>Thông tin tài khoản</Text>
          <View style={s.headerSpacer} />
        </View>

        <View style={s.profileAvatarWrap}>
          <View style={s.profileAvatarLarge}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={s.profileAvatarLargeImage} />
            ) : (
              <Text style={s.profileAvatarLargeText}>{avatarInitials}</Text>
            )}
          </View>
          <TouchableOpacity style={s.cameraBadge} activeOpacity={0.8} onPress={handlePickAvatar}>
            <Feather name="camera" size={15} color={NAV_ICON} />
          </TouchableOpacity>
        </View>

        <View style={s.profileFormCard}>
          <EditableRow label="Họ và tên">
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Nhập họ và tên"
              placeholderTextColor="#A0A0A0"
              style={s.profileInput}
              autoCapitalize="words"
              autoCorrect={false}
              spellCheck={false}
            />
          </EditableRow>

          <EditableRow label="Khu vực (tỉnh, thành)">
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setProvinceQuery('');
                setShowProvinceModal(true);
              }}
              style={s.profileSelectTouch}
            >
              <Text
                style={[s.profileSelectText, !area.trim() && s.profileSelectPlaceholder]}
                numberOfLines={2}
              >
                {area.trim() ? area.trim() : 'Chọn tỉnh, thành phố —'}
              </Text>
            </TouchableOpacity>
          </EditableRow>

          <EditableRow label="Độ tuổi">
            <TextInput
              value={ageInput}
              onChangeText={(v) => setAgeInput(v.replace(/\D/g, '').slice(0, 2))}
              keyboardType="number-pad"
              placeholder="Ví dụ: 25"
              placeholderTextColor="#A0A0A0"
              style={s.profileInput}
            />
          </EditableRow>

          <EditableRow label="Số điện thoại">
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              placeholder="Nhập số điện thoại"
              placeholderTextColor="#A0A0A0"
              style={s.profileInput}
            />
          </EditableRow>

          <EditableRow label="Giới tính">
            <View style={s.genderChipsRow}>
              <ChoiceChip label="Nam" active={gender === 'male'} onPress={() => setGender('male')} />
              <ChoiceChip label="Nữ" active={gender === 'female'} onPress={() => setGender('female')} />
              <ChoiceChip label="Khác" active={gender === 'other'} onPress={() => setGender('other')} />
            </View>
          </EditableRow>

          <EditableRow label="Quốc tịch">
            <TextInput
              value={nationality}
              onChangeText={setNationality}
              placeholder="Nhập quốc tịch"
              placeholderTextColor="#A0A0A0"
              style={s.profileInput}
              autoCapitalize="words"
              autoCorrect={false}
              spellCheck={false}
            />
          </EditableRow>

          <EditableRow label="Xác minh hồ sơ">
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => Alert.alert('Thông báo', 'Tính năng xác minh hồ sơ sẽ được cập nhật sau.')}
            >
              <Text style={s.profileActionText}>Chưa xác minh ›</Text>
            </TouchableOpacity>
          </EditableRow>

          <EditableRow label="Đổi mật khẩu" isLast>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Nhập mật khẩu mới"
              placeholderTextColor="#A0A0A0"
              secureTextEntry
              style={s.profileInput}
            />
          </EditableRow>
        </View>

        <TouchableOpacity style={s.saveProfileButton} onPress={handleSave} activeOpacity={0.85}>
          <Text style={s.saveProfileButtonText}>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showProvinceModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowProvinceModal(false)}
      >
        <TouchableOpacity
          style={s.provinceModalRoot}
          activeOpacity={1}
          onPress={() => setShowProvinceModal(false)}
        >
          <View style={s.provinceModalCard} onStartShouldSetResponder={() => true}>
            <Text style={s.provinceModalTitle}>Chọn tỉnh, thành phố</Text>
            <TextInput
              value={provinceQuery}
              onChangeText={setProvinceQuery}
              placeholder="Tìm tỉnh, thành phố…"
              placeholderTextColor="#A0A0A0"
              style={s.provinceModalSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <FlatList
              data={filteredProfileProvinces}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              style={s.provinceModalList}
              renderItem={({ item }) => {
                const active = item === area;
                return (
                  <TouchableOpacity
                    style={[s.provinceModalRow, active && s.provinceModalRowActive]}
                    onPress={() => {
                      setArea(item);
                      setShowProvinceModal(false);
                      setProvinceQuery('');
                    }}
                  >
                    <Text
                      style={[s.provinceModalRowText, active && s.provinceModalRowTextActive]}
                    >
                      {item}
                    </Text>
                    {active ? <Text style={s.provinceModalCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={s.provinceModalEmpty}>Không tìm thấy tỉnh/thành phù hợp</Text>
              }
            />
            <TouchableOpacity
              style={s.provinceModalClose}
              onPress={() => setShowProvinceModal(false)}
            >
              <Text style={s.provinceModalCloseText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function TherapistSetupScreen({
  user,
  onBack,
  onSave,
}: {
  user: UserData;
  onBack: () => void;
  onSave: (user: UserData) => Promise<void>;
}) {
  const [galleryUris, setGalleryUris] = useState<string[]>(user.serviceImages || []);
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [shortDescription, setShortDescription] = useState(
    normalizeVietnameseText(user.bio || '', 240),
  );
  const [gender, setGender] = useState<'male' | 'female' | 'other'>(user.gender || 'female');
  const [workingCity, setWorkingCity] = useState(user.workingCity || 'Hà Nội');
  const [services, setServices] = useState<string[]>(
    (user.services || [])
      .map((name) => LEGACY_SERVICE_MAP[name] || name)
      .filter((name, index, arr) => THERAPIST_SERVICE_OPTIONS.includes(name as any) && arr.indexOf(name) === index),
  );
  const [expandedPricing, setExpandedPricing] = useState<string | null>(null);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<NoticeModalState>(DEFAULT_NOTICE_STATE);
  const filteredCities = VN_PROVINCES.filter((item) =>
    item.toLowerCase().includes(cityQuery.trim().toLowerCase()),
  );
  const showNotice = (next: Omit<NoticeModalState, 'visible'>) => {
    setNotice({ ...next, visible: true });
  };

  const pickGalleryImage = async () => {
    if (galleryUris.length >= 6) {
      Alert.alert('Đã đủ ảnh', 'Bạn chỉ có thể thêm tối đa 6 ảnh.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Chưa có quyền', 'Vui lòng cho phép ứng dụng truy cập thư viện ảnh.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setGalleryUris((prev) => [...prev, result.assets[0].uri].slice(0, 6));
    }
  };

  const removeGalleryImage = (index: number) => {
    setGalleryUris((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const toggleService = (serviceName: string) => {
    setServices((prev) => (
      prev.includes(serviceName)
        ? prev.filter((value) => value !== serviceName)
        : [...prev, serviceName]
    ));
  };

  const handleSave = async () => {
    if (galleryUris.length < 2) {
      showNotice({ title: 'Thiếu hình ảnh', message: 'Vui lòng thêm ít nhất 2 ảnh.', variant: 'danger' });
      return;
    }
    if (!displayName.trim()) {
      showNotice({ title: 'Thiếu thông tin', message: 'Vui lòng nhập tên của bạn.', variant: 'danger' });
      return;
    }
    if (!workingCity.trim()) {
      showNotice({ title: 'Thiếu thông tin', message: 'Vui lòng chọn tỉnh/thành phố.', variant: 'danger' });
      return;
    }
    if (services.length === 0) {
      showNotice({ title: 'Thiếu thông tin', message: 'Vui lòng chọn ít nhất 1 dịch vụ.', variant: 'danger' });
      return;
    }

    setIsSaving(true);
    try {
      const uploadedGalleryUris = await ensurePublicPartnerImageUris(user.authUid ?? '', galleryUris);
      const normalizedDescription = normalizeVietnameseText(shortDescription.trim(), 240);
      const applicationId = await createPartnerApplication({
        userId: user.authUid,
        applicationType: 'individual',
        phoneNumber: user.phoneNumber ?? '',
        displayName: displayName.trim(),
        shortDescription: normalizedDescription,
        gender,
        workingCity,
        services,
        imageUris: uploadedGalleryUris,
      });

      await onSave({
        ...user,
        avatarUri: user.avatarUri || '',
        displayName: displayName.trim(),
        bio: normalizedDescription,
        gender,
        workingCity,
        serviceImages: uploadedGalleryUris,
        services,
        role: user.role === 'therapist' ? 'therapist' : user.role === 'admin' ? 'admin' : 'customer',
        partnerApplicationId: applicationId,
        partnerApplicationStatus: 'pending',
      });
      showNotice({
        title: '✅ Gửi hồ sơ thành công',
        message: 'Hồ sơ đối tác và hình ảnh đã được gửi đến quản trị viên để phê duyệt.',
        variant: 'success',
      });
    } catch (error) {
      const message = getErrorMessage(error, 'Không thể gửi hồ sơ. Vui lòng thử lại.');
      showNotice({
        title: '❌ Gửi hồ sơ thất bại',
        message:
          message === 'missing-user-id'
            ? 'Không tìm thấy phiên đăng nhập. Vui lòng đăng nhập lại rồi gửi hồ sơ.'
            : message,
        variant: 'danger',
      });
    } finally {
      setIsSaving(false);
    }
  };
  const canSave = galleryUris.length >= 2 && !!displayName.trim() && !!workingCity.trim() && services.length > 0 && !isSaving;

  return (
    <SafeAreaView style={s.partnerContainer} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={s.partnerHeader}>
        <TouchableOpacity style={s.backButton} onPress={onBack} activeOpacity={0.7}>
          <Text style={s.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={s.businessHeaderTitle}>Cài đặt thông tin</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.businessContent}>
        <Text style={s.businessLabel}>Hình ảnh <Text style={s.requiredStar}>*</Text></Text>
        <View style={s.businessImageGrid}>
          {Array.from({ length: 6 }).map((_, index) => {
            const uri = galleryUris[index];
            return (
              <TouchableOpacity key={`setup-img-${index}`} style={s.businessImageSlot} onPress={pickGalleryImage} activeOpacity={0.85}>
                {uri ? (
                  <>
                    <Image source={{ uri }} style={s.businessImage} />
                    <TouchableOpacity
                      style={s.businessRemoveBtn}
                      onPress={() => removeGalleryImage(index)}
                      activeOpacity={0.8}
                    >
                      <Text style={s.businessRemoveText}>×</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Feather name="image" size={28} color="#C5B8BB" />
                    <Text style={s.businessImagePlaceholderText}>Thêm ảnh</Text>
                    <View style={s.businessPlusBadge}>
                      <Text style={s.businessPlusBadgeText}>+</Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        {galleryUris.length < 2 ? (
          <View style={s.businessWarningRow}>
            <Feather name="alert-circle" size={16} color="#B45309" />
            <Text style={s.businessWarning}>Vui lòng thêm ít nhất 2 ảnh</Text>
          </View>
        ) : null}
        <Text style={s.setupServiceHint}>Hình ảnh sẽ được quản trị viên duyệt nội dung. Ảnh phản cảm sẽ không được phê duyệt.</Text>

        <Text style={s.businessLabel}>Tên hiển thị <Text style={s.requiredStar}>*</Text></Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Nhập tên hiển thị"
          placeholderTextColor="#9E8585"
          style={s.businessInput}
          autoCapitalize="words"
          autoCorrect={false}
          spellCheck={false}
        />

        <Text style={s.businessLabel}>Mô tả ngắn</Text>
        <TextInput
          value={shortDescription}
          onChangeText={(value) => setShortDescription(normalizeVietnameseText(value, 240))}
          placeholder="Giới thiệu ngắn gọn về kỹ năng/điểm mạnh của bạn"
          placeholderTextColor="#9E8585"
          style={[s.businessInput, s.businessTextarea]}
          autoCapitalize="sentences"
          autoCorrect
          spellCheck
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={240}
        />
        <Text style={s.setupServiceHint}>
          Mô tả này sẽ hiển thị trên hồ sơ kỹ thuật viên ({shortDescription.trim().length}/240).
        </Text>

        <Text style={s.businessLabel}>Giới tính <Text style={s.requiredStar}>*</Text></Text>
        <View style={s.setupGenderRow}>
          <ChoiceChip label="Nam" active={gender === 'male'} onPress={() => setGender('male')} />
          <ChoiceChip label="Nữ" active={gender === 'female'} onPress={() => setGender('female')} />
          <ChoiceChip label="Khác" active={gender === 'other'} onPress={() => setGender('other')} />
        </View>

        <Text style={s.businessLabel}>Tỉnh/Thành phố <Text style={s.requiredStar}>*</Text></Text>
        <TouchableOpacity style={s.businessSelect} activeOpacity={0.85} onPress={() => setShowCityPicker(true)}>
          <Text style={[s.businessSelectText, !workingCity && s.businessSelectPlaceholder]}>
            {workingCity || 'Chọn tỉnh/thành phố'}
          </Text>
          <Text style={s.businessSelectArrow}>▾</Text>
        </TouchableOpacity>

        <Text style={s.businessLabel}>Dịch vụ bạn nhận <Text style={s.requiredStar}>*</Text></Text>
        <View style={s.setupServiceWrap}>
          {THERAPIST_SERVICE_OPTIONS.map((name) => {
            const active = services.includes(name);
            const pricing = SERVICE_PRICING[name];
            const isExpanded = expandedPricing === name;
            return (
              <View key={name} style={{ width: '100%' }}>
                <View style={s.serviceChipRow}>
                  <TouchableOpacity
                    style={[s.setupServiceChip, active && s.setupServiceChipActive, { flex: 1 }]}
                    onPress={() => toggleService(name)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.setupServiceText, active && s.setupServiceTextActive]}>{name}</Text>
                  </TouchableOpacity>
                  {pricing && (
                    <TouchableOpacity
                      style={s.pricingToggleBtn}
                      onPress={() => setExpandedPricing(isExpanded ? null : name)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.pricingToggleText}>{isExpanded ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {isExpanded && pricing && (
                  <View style={s.pricingTable}>
                    {pricing.map((row, i) => (
                      <View key={i} style={s.pricingRow}>
                        <Text style={s.pricingDuration}>Giá tiền <Text style={s.pricingDurationBold}>{row.duration}</Text></Text>
                        <Text style={s.pricingPrice}>{row.price}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
        <Text style={s.setupServiceHint}>Chọn dịch vụ để hồ sơ của bạn hiển thị đúng bộ lọc khách hàng.</Text>

        <TouchableOpacity
          style={[s.businessSaveBtn, !canSave && s.businessSaveBtnDisabled]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={!canSave}
        >
          <Text style={[s.businessSaveBtnText, !canSave && s.businessSaveBtnTextDisabled]}>
            {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showCityPicker} transparent animationType="slide" onRequestClose={() => setShowCityPicker(false)}>
        <View style={s.cityModalOverlay}>
          <View style={s.cityModalSheet}>
            <View style={s.cityModalHeader}>
              <Text style={s.cityModalTitle}>Chọn tỉnh/thành phố</Text>
              <TouchableOpacity onPress={() => setShowCityPicker(false)} activeOpacity={0.8}>
                <Text style={s.cityModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={s.citySearchInput}
              value={cityQuery}
              onChangeText={setCityQuery}
              placeholder="Tìm tỉnh/thành..."
              placeholderTextColor="#9E8585"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />

            <FlatList
              data={filteredCities}
              keyExtractor={(item) => item}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const active = workingCity === item;
                return (
                  <TouchableOpacity
                    style={[s.cityOptionRow, active && s.cityOptionRowActive]}
                    onPress={() => {
                      setWorkingCity(item);
                      setShowCityPicker(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.cityOptionText, active && s.cityOptionTextActive]}>{item}</Text>
                    {active ? <Text style={s.cityOptionCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
      <AppNoticeModal
        visible={notice.visible}
        title={notice.title}
        message={notice.message}
        primaryText={notice.variant === 'success' ? 'Về trang trước' : 'Đã hiểu'}
        onPrimaryPress={() => {
          const shouldGoBack = notice.variant === 'success';
          setNotice(DEFAULT_NOTICE_STATE);
          if (shouldGoBack) onBack();
        }}
        variant={notice.variant}
      />
    </SafeAreaView>
  );
}

function EditableRow({
  label,
  children,
  isLast,
}: {
  label: string;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View style={[s.editableRow, !isLast && s.editableRowBorder]}>
      <Text style={s.editableRowLabel}>{label}</Text>
      <View style={s.editableRowValue}>{children}</View>
    </View>
  );
}

function ChoiceChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.choiceChip, active && s.choiceChipActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[s.choiceChipText, active && s.choiceChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function getInitials(value: string) {
  if (/^\d+$/.test(value.trim())) {
    const d = value.trim().slice(-2);
    return d || '··';
  }

  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'MN';
}

const s = StyleSheet.create({
  partnerContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  partnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  partnerContent: { paddingHorizontal: 16, paddingTop: 8 },
  partnerTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: '#0A2540',
    marginBottom: 18,
    letterSpacing: -0.5,
  },
  partnerOptionCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D9E6',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  partnerOptionTextWrap: { flex: 1, gap: 6 },
  partnerOptionTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: '#0A2540' },
  partnerOptionDesc: { fontSize: 15, lineHeight: 22, color: '#7D5E5E', fontWeight: '500' },
  partnerOptionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: AppColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessHeaderTitle: { fontSize: 22, fontWeight: '800', color: '#0A2540' },
  businessContent: { paddingHorizontal: 16, paddingBottom: 36 },
  businessLabel: { marginTop: 10, marginBottom: 8, color: '#0A2540', fontSize: 18, fontWeight: '700' },
  requiredStar: { color: AppColors.danger, fontSize: 16, fontWeight: '800' },
  businessImageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  businessImageSlot: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D9E6',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  businessImage: { width: '100%', height: '100%' },
  businessImagePlaceholderText: { marginTop: 4, fontSize: 12, color: '#9E8585', fontWeight: '600' },
  businessPlusBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: AppColors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessPlusBadgeText: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: -1 },
  businessRemoveBtn: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFFE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessRemoveText: { color: '#4B5563', fontSize: 15, fontWeight: '800' },
  businessWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  businessWarning: { color: '#B45309', fontSize: 13, fontWeight: '600', flex: 1 },
  businessInput: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#D1D9E6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: '#0A2540',
  },
  businessTextarea: {
    minHeight: 96,
  },
  businessSelect: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#D1D9E6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  businessSelectText: { fontSize: 16, color: '#0A2540', fontWeight: '600' },
  businessSelectPlaceholder: { color: '#9E8585', fontWeight: '500' },
  businessSelectArrow: { fontSize: 14, color: '#8B6B6B' },
  businessCityWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  businessCityChip: {
    borderWidth: 1,
    borderColor: '#D1D9E6',
    backgroundColor: '#FFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  businessCityChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: AppColors.primarySoft,
  },
  businessCityChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7D5E5E',
  },
  businessCityChipTextActive: {
    color: COLORS.primary,
  },
  cityModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(44, 8, 21, 0.35)',
    justifyContent: 'flex-end',
  },
  cityModalSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
    maxHeight: '78%',
  },
  cityModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cityModalTitle: { fontSize: 18, fontWeight: '800', color: '#0A2540' },
  cityModalClose: { fontSize: 18, color: '#8B6B6B', fontWeight: '700' },
  citySearchInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#D1D9E6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0A2540',
    marginBottom: 10,
  },
  cityOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F2E1E7',
    marginBottom: 8,
    backgroundColor: '#FFF',
  },
  cityOptionRowActive: {
    backgroundColor: AppColors.primarySoft,
    borderColor: COLORS.primary,
  },
  cityOptionText: { fontSize: 15, color: '#4B2A35', fontWeight: '600' },
  cityOptionTextActive: { color: COLORS.primary, fontWeight: '700' },
  cityOptionCheck: { color: COLORS.primary, fontSize: 16, fontWeight: '800' },
  cityEmptyText: { textAlign: 'center', color: '#A78B95', paddingVertical: 16, fontSize: 14 },
  businessTimeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  businessTimeLabel: { width: 110, fontSize: 14, color: '#5F4750', fontWeight: '600' },
  businessTimeInput: {
    flex: 1,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#D1D9E6',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    textAlign: 'center',
    color: '#0A2540',
    fontSize: 14,
    fontWeight: '600',
  },
  businessTimeDash: { color: '#8B6B6B', fontSize: 16, fontWeight: '700' },
  businessSaveBtn: {
    marginTop: 20,
    borderRadius: 14,
    backgroundColor: AppColors.primaryDark,
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 20,
  },
  businessSaveBtnDisabled: { backgroundColor: AppColors.primarySoft },
  businessSaveBtnText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  businessSaveBtnTextDisabled: { color: '#C2AAB4' },
  container: { flex: 1, backgroundColor: COLORS.bg },
  therapistContainer: { flex: 1, backgroundColor: COLORS.bg },
  therapistTop: { paddingHorizontal: 12, paddingTop: 12 },
  therapistProfileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  therapistAvatarWrap: {
    width: 82,
    height: 82,
    borderRadius: 41,
    overflow: 'hidden',
    backgroundColor: '#D9E8D3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  therapistAvatarImage: { width: '100%', height: '100%' },
  therapistAvatarInitial: { fontSize: 28, fontWeight: '800', color: '#5F8F47' },
  therapistName: { fontSize: 20, fontWeight: '800', color: '#111' },
  therapistPhone: { fontSize: 14, color: '#5E6662', marginTop: 3 },
  therapistVipBanner: {
    marginTop: 16,
    backgroundColor: COLORS.goldLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  therapistVipText: { fontSize: 14, fontWeight: '600', color: '#7A5400' },
  therapistVipBadge: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: '800',
    backgroundColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  therapistActionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  therapistActionCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    minHeight: 110,
    padding: 14,
    justifyContent: 'space-between',
  },
  therapistActionTitle: { fontSize: 14, fontWeight: '700', color: '#171717', lineHeight: 21 },
  therapistActionArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: COLORS.primary,
    color: '#fff',
    overflow: 'hidden',
    fontWeight: '700',
  },
  therapistStatusCard: {
    marginTop: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
  },
  therapistStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  therapistRank: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  therapistVisible: { color: '#171717', fontSize: 14, fontWeight: '700' },
  therapistProgress: { height: 8, borderRadius: 99, backgroundColor: COLORS.primary, marginTop: 12 },
  therapistDoneRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  therapistDoneLabel: { fontSize: 15, color: '#7C7F86' },
  therapistDoneValue: { fontSize: 28, fontWeight: '800', color: COLORS.primary },
  therapistMenuCard: { backgroundColor: COLORS.white },

  // Profile header
  profileHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 20, gap: 16 },
  avatarCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarIcon: { fontSize: 32 },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 22, fontWeight: '800', color: COLORS.white },
  profileInfo: { flex: 1, gap: 3 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  profileName: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  adminBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  adminBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  profilePhone: { fontSize: 13, color: COLORS.subText },
  profileGender: { fontSize: 12, color: COLORS.subText },

  // VIP
  vipBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.goldLight, marginHorizontal: 12, marginTop: 12, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  vipText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#7A5400' },
  vipBadge: { backgroundColor: COLORS.gold, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  vipBadgeText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },

  // Promo cards
  promoRow: { flexDirection: 'row', gap: 12, marginHorizontal: 12, marginTop: 12, height: 120 },
  promoRowTablet: { height: 164 },
  promoCard: { flex: 1, borderRadius: 14, padding: 14, gap: 8, justifyContent: 'space-between' },
  promoEmoji: { fontSize: 24 },
  promoRewardCard: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    minWidth: 0,
    flexBasis: 0,
    backgroundColor: '#FFFFFF',
  },
  promoRewardBannerImg: {
    width: '100%',
    height: '100%',
  },
  promoTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, lineHeight: 19 },
  promoArrow: { fontSize: 18, color: COLORS.primary, fontWeight: '700' },

  // Menu
  menuCard: { backgroundColor: COLORS.white, borderRadius: 16, marginHorizontal: 12, marginTop: 12, borderWidth: 1, borderColor: COLORS.border },
  menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 15 },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  menuRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '500', color: COLORS.text },
  menuRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuValue: { fontSize: 14, color: COLORS.subText },
  menuChevron: { fontSize: 20, color: COLORS.subText },

  setupContainer: { flex: 1, backgroundColor: COLORS.bg },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  setupTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  setupTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    gap: 14,
  },
  setupTabButton: {
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  setupTabButtonActive: {
    borderBottomColor: COLORS.text,
  },
  setupTabText: {
    color: COLORS.subText,
    fontSize: 18,
    fontWeight: '500',
  },
  setupTabTextActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
  setupContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    paddingBottom: 120,
  },
  setupLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  setupAvatarBox: {
    width: 110,
    height: 140,
    borderRadius: 16,
    backgroundColor: '#EFEFEF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupAvatarImage: { width: '100%', height: '100%' },
  setupPlaceholder: { color: '#A7A7A7', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  setupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  setupGridItem: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: '#EFEFEF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  setupGridItemEmpty: {
    borderWidth: 1,
    borderColor: '#E3E3E3',
    borderStyle: 'dashed',
  },
  setupGridImage: { width: '100%', height: '100%' },
  setupRemoveImage: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFFE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupRemoveImageText: { fontSize: 16, color: '#4C4C4C', fontWeight: '700' },
  setupInput: {
    width: '100%',
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  setupGenderRow: {
    flexDirection: 'row',
    gap: 10,
  },
  setupServiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  setupServiceChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  setupServiceChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  setupServiceText: {
    color: COLORS.subText,
    fontSize: 14,
    fontWeight: '600',
  },
  setupServiceTextActive: {
    color: COLORS.primary,
  },
  setupServiceHint: {
    marginTop: 6,
    color: COLORS.subText,
    fontSize: 13,
    lineHeight: 20,
  },
  serviceChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pricingToggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pricingToggleText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
  },
  pricingTable: {
    marginTop: 4,
    marginBottom: 4,
    marginLeft: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  pricingDuration: {
    fontSize: 14,
    color: COLORS.subText,
  },
  pricingDurationBold: {
    fontWeight: '700',
    color: COLORS.text,
  },
  pricingPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  setupBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
  },
  setupSaveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  setupSaveButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },

  profileDetailsContent: { paddingBottom: 40 },
  profileDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: { fontSize: 24, color: COLORS.text, fontWeight: '400' },
  profileDetailsTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  headerSpacer: { width: 36 },
  profileAvatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  profileAvatarLarge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileAvatarLargeImage: { width: '100%', height: '100%' },
  profileAvatarLargeText: { color: COLORS.white, fontSize: 30, fontWeight: '800' },
  cameraBadge: {
    position: 'absolute',
    right: '36%',
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileFormCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  editableRow: {
    paddingVertical: 18,
    gap: 10,
  },
  editableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  editableRowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  editableRowValue: {
    alignItems: 'flex-end',
  },
  profileInput: {
    width: '100%',
    textAlign: 'right',
    fontSize: 16,
    color: COLORS.text,
    paddingVertical: 0,
  },
  profileSelectTouch: {
    width: '100%',
    minHeight: 24,
    justifyContent: 'center',
  },
  profileSelectText: {
    width: '100%',
    textAlign: 'right',
    fontSize: 16,
    color: COLORS.text,
  },
  profileSelectPlaceholder: {
    color: '#A0A0A0',
  },
  provinceModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  provinceModalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '72%',
    paddingBottom: 8,
  },
  provinceModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  provinceModalSearch: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.text,
  },
  provinceModalList: { maxHeight: 320 },
  provinceModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  provinceModalRowActive: { backgroundColor: COLORS.goldLight },
  provinceModalRowText: { flex: 1, fontSize: 16, color: COLORS.text, paddingRight: 8 },
  provinceModalRowTextActive: { fontWeight: '700', color: COLORS.primary },
  provinceModalCheck: { fontSize: 16, color: COLORS.primary, fontWeight: '800' },
  provinceModalEmpty: { textAlign: 'center', color: '#A0A0A0', padding: 20 },
  provinceModalClose: { alignItems: 'center', paddingVertical: 14 },
  provinceModalCloseText: { fontSize: 16, color: COLORS.primary, fontWeight: '700' },
  genderChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.white,
  },
  choiceChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  choiceChipText: {
    color: COLORS.subText,
    fontSize: 14,
    fontWeight: '600',
  },
  choiceChipTextActive: {
    color: COLORS.primary,
  },
  profileActionText: {
    fontSize: 16,
    color: '#9A9A9A',
  },
  saveProfileButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveProfileButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  deleteModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  deleteModalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  deleteModalHint: {
    fontSize: 14,
    color: COLORS.subText,
    marginBottom: 14,
    lineHeight: 20,
  },
  deleteModalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 18,
  },
  deleteModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  deleteModalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  deleteModalCancelText: {
    fontSize: 16,
    color: COLORS.subText,
    fontWeight: '600',
  },
  deleteModalConfirmBtn: {
    backgroundColor: COLORS.red,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  deleteModalConfirmText: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '700',
  },

  // Guest
  guestHeroCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 28,
    padding: 22,
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1E1E4',
  },
  guestZenaPrimary: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: AppColors.primarySoft,
    top: -78,
    right: -46,
  },
  guestZenaSecondary: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: AppColors.primarySoft2,
    left: -30,
    bottom: -36,
  },
  guestAvatarWrap: {
    marginTop: 2,
    marginBottom: 2,
  },
  guestAvatarHalo: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: AppColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 5,
  },
  guestAvatarIcon: { fontSize: 24, color: COLORS.white, fontWeight: '800' },
  guestTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text, textAlign: 'center', lineHeight: 32 },
  guestBenefitRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  guestBenefitPill: {
    backgroundColor: AppColors.primarySoft2,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  guestBenefitText: {
    color: COLORS.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  signInBtn: { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 15, alignSelf: 'stretch', alignItems: 'center', marginTop: 4, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.14, shadowRadius: 20, elevation: 4 },
  signInBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  signUpBtn: {
    borderWidth: 1.5,
    borderColor: AppColors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: AppColors.primarySoft2,
  },
  signUpBtnText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  guestSectionHeader: {
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: -2,
    gap: 4,
  },
  guestSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  guestSectionSubtitle: {
    fontSize: 13,
    color: '#8B7A7E',
  },
  guestHighlightCard: {
    marginHorizontal: 12,
    marginTop: 12,
    backgroundColor: AppColors.primarySoft2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  guestHighlightTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  guestHighlightDesc: {
    fontSize: 13,
    color: '#7D6B70',
    lineHeight: 19,
    maxWidth: 250,
  },
  guestHighlightArrow: {
    color: COLORS.primary,
    fontSize: 24,
    fontWeight: '700',
  },
  logoutBtn: {
    marginHorizontal: 12,
    marginTop: 16,
    backgroundColor: AppColors.primarySoft2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutBtnText: {
    color: COLORS.red,
    fontSize: 15,
    fontWeight: '700',
  },
  accountDeleteBtn: {
    marginHorizontal: 12,
    marginTop: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  accountDeleteBtnText: {
    color: COLORS.red,
    fontSize: 15,
    fontWeight: '600',
  },
});
