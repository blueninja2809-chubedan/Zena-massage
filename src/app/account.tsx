import AdminChatPanel from '@/components/AdminChatPanel';
import { SignInScreen } from '@/components/SignInScreen';
import { SignUpScreen } from '@/components/SignUpScreen';
import VipMembershipScreen from '@/components/VipMembershipScreen';
import { SERVICE_TYPES } from '@/constants/bookingFilters';
import { useLanguage } from '@/contexts/LanguageContext';
import { UserData, useUser } from '@/contexts/UserContext';
import { checkTherapistMinBalance, createPartnerApplication, getTherapistAvailability, updateTherapistAvailability } from '@/lib/supabaseService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    Modal,
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
  primary: '#2196F3',
  primaryDark: '#1565C0',
  primaryLight: '#E3F2FD',
  gold: '#F5A623',
  goldLight: '#FFF8E1',
  bg: '#F5F5F5',
  white: '#fff',
  text: '#1A1A1A',
  subText: '#666',
  border: '#E8E8E8',
  red: '#E53935',
};

const VN_PROVINCES = [
  'Hà Nội',
  'TP. Hồ Chí Minh',
  'Hải Phòng',
  'Đà Nẵng',
  'Cần Thơ',
  'An Giang',
  'Bà Rịa - Vũng Tàu',
  'Bắc Giang',
  'Bắc Kạn',
  'Bạc Liêu',
  'Bắc Ninh',
  'Bến Tre',
  'Bình Định',
  'Bình Dương',
  'Bình Phước',
  'Bình Thuận',
  'Cà Mau',
  'Cao Bằng',
  'Đắk Lắk',
  'Đắk Nông',
  'Điện Biên',
  'Đồng Nai',
  'Đồng Tháp',
  'Gia Lai',
  'Hà Giang',
  'Hà Nam',
  'Hà Tĩnh',
  'Hải Dương',
  'Hậu Giang',
  'Hòa Bình',
  'Hưng Yên',
  'Khánh Hòa',
  'Kiên Giang',
  'Kon Tum',
  'Lai Châu',
  'Lâm Đồng',
  'Lạng Sơn',
  'Lào Cai',
  'Long An',
  'Nam Định',
  'Nghệ An',
  'Ninh Bình',
  'Ninh Thuận',
  'Phú Thọ',
  'Phú Yên',
  'Quảng Bình',
  'Quảng Nam',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Quảng Trị',
  'Sóc Trăng',
  'Sơn La',
  'Tây Ninh',
  'Thái Bình',
  'Thái Nguyên',
  'Thanh Hóa',
  'Thừa Thiên Huế',
  'Tiền Giang',
  'Trà Vinh',
  'Tuyên Quang',
  'Vĩnh Long',
  'Vĩnh Phúc',
  'Yên Bái',
];

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

export default function AccountScreen() {
  const { language, setLanguage } = useLanguage();
  const { user, setUser, logout } = useUser();
  const router = useRouter();
  const [currentScreen, setCurrentScreen] = useState<
    'account' | 'signin' | 'signup' | 'profile' | 'therapistSetup' | 'vipMembership' | 'partnerSignupType' | 'partnerBusinessSignup' | 'adminChat'
  >('account');
  const [country] = useState({ code: 'VN', label: 'Việt Nam', flag: '🇻🇳' });
  const [profileVisible, setProfileVisible] = useState(true);

  useEffect(() => {
    if (user?.authUid && user?.role === 'therapist') {
      getTherapistAvailability(user.authUid)
        .then(setProfileVisible)
        .catch(() => {});
    }
  }, [user?.authUid, user?.role]);

  const handleToggleProfileVisible = async (value: boolean) => {
    if (!user?.authUid) return;

    // If turning ON, check minimum balance (500,000đ)
    if (value) {
      try {
        const hasMinBalance = await checkTherapistMinBalance(user.authUid, 500000);
        if (!hasMinBalance) {
          Alert.alert(
            'Số dư không đủ',
            'Bạn cần có ít nhất 500.000đ trong ví để hiện hồ sơ nhận việc. Vui lòng nạp tiền vào ví.',
          );
          return;
        }
      } catch {
        // If check fails, allow toggle
      }
    }

    setProfileVisible(value);
    try {
      await updateTherapistAvailability(user.authUid, value);
    } catch {
      setProfileVisible(!value);
    }
  };

  if (currentScreen === 'signin' || (!user && currentScreen === 'account')) {
    return (
      <SignInScreen
        onBack={() => setCurrentScreen('account')}
        onNavigateSignUp={() => setCurrentScreen('signup')}
      />
    );
  }
  if (currentScreen === 'signup') {
    return (
      <SignUpScreen
        onBack={() => setCurrentScreen('account')}
        onNavigateSignIn={() => setCurrentScreen('signin')}
      />
    );
  }
  if (currentScreen === 'profile' && user) {
    return (
      <ProfileDetailsScreen
        user={user}
        onBack={() => setCurrentScreen('account')}
        onSave={async (updatedUser) => {
          await setUser(updatedUser);
          setCurrentScreen('account');
        }}
        onDeleteAccount={async () => {
          await AsyncStorage.clear();
          await logout();
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
          await setUser(updatedUser);
          setCurrentScreen('account');
        }}
      />
    );
  }
  if (currentScreen === 'vipMembership' && user) {
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
  if (currentScreen === 'adminChat') {
    return <AdminChatPanel onClose={() => setCurrentScreen('account')} />;
  }

  const displayName = user?.displayName || user?.phoneNumber || '';
  const langLabel = language === 'vi' ? 'Tiếng Việt' : 'English';
  const genderLabel = user?.gender === 'female' ? 'Nữ' : user?.gender === 'male' ? 'Nam' : '';
  const avatarInitials = getInitials(displayName || 'Zena');
  const roleLabel = user?.role === 'therapist'
    ? 'Kỹ thuật viên'
    : user?.partnerApplicationStatus === 'pending'
      ? 'Khách hàng (chờ duyệt đối tác)'
      : 'Khách hàng';
  const vipLabel = user?.isVipMember ? 'Hội viên VIP' : 'Đăng ký trở thành hội viên';

  const rewardPromoCard = (
    <TouchableOpacity style={s.promoRewardCard} activeOpacity={0.85}>
      <Image
        source={require('../../assets/images/promo-reward-banner.png')}
        style={s.promoRewardBannerImg}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );

  const partnerPromoCard = user?.role === 'therapist' ? (
    <TouchableOpacity style={s.promoRewardCard} activeOpacity={0.85} onPress={() => setCurrentScreen('therapistSetup')}>
      <Image
        source={require('../../assets/images/ktv2.png')}
        style={s.promoRewardBannerImg}
        resizeMode="cover"
      />
    </TouchableOpacity>
  ) : (
    <TouchableOpacity style={s.promoRewardCard} activeOpacity={0.85} onPress={() => setCurrentScreen('partnerSignupType')}>
      <Image
        source={require('../../assets/images/promo-partner-banner.png')}
        style={s.promoRewardBannerImg}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );

  const handleRoleInfo = () => {
    Alert.alert(
      'Vai trò tài khoản',
      'Tài khoản mới luôn là Khách hàng. Để trở thành Kỹ thuật viên, bạn cần gửi đăng ký đối tác và chờ quản trị viên duyệt.',
    );
  };

  if (user?.role === 'therapist') {
    return (
      <SafeAreaView style={s.therapistContainer} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 34 }}>
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
                <Text style={s.profileName}>{displayName}</Text>
                <Text style={s.profilePhone}>{user.email || user.phoneNumber || ''}</Text>
              </View>
            </View>

            <TouchableOpacity style={s.vipBanner} activeOpacity={0.85} onPress={() => setCurrentScreen('vipMembership')}>
              <Text style={s.vipIcon}>👑</Text>
              <Text style={s.vipText}>{vipLabel}</Text>
              <View style={s.vipBadge}><Text style={s.vipBadgeText}>VIP</Text></View>
            </TouchableOpacity>

            <View style={s.promoRow}>
              {partnerPromoCard}
              {rewardPromoCard}
            </View>
          </View>

          <View style={s.menuCard}>
            <MenuRow icon="📋" label="Lịch sử hoạt động" onPress={() => router.push('/activity')} />
            <MenuRow icon="👤" label="Thông tin cá nhân" onPress={() => setCurrentScreen('profile')} />
            <MenuRow icon="🌐" label="Ngôn ngữ" value={langLabel} onPress={() => setLanguage(language === 'vi' ? 'en' : 'vi')} />
            <MenuRow icon="🏳️" label="Quốc gia" value={`${country.flag} ${country.label}`} onPress={() => {}} />
            <MenuRow icon="ℹ️" label="Về chúng tôi" onPress={() => Alert.alert('Zena', 'Phiên bản 1.0.0')} />
            <MenuRow icon="🚪" label="Đăng xuất" onPress={logout} color={COLORS.text} isLast />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <ScrollView showsVerticalScrollIndicator={false}>

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
                <Text style={s.profileName}>{displayName}</Text>
                {(user.email || user.phoneNumber) && <Text style={s.profilePhone}>{user.email || user.phoneNumber}</Text>}
                {genderLabel ? <Text style={s.profileGender}>{genderLabel}</Text> : null}
              </View>
            </View>

            {/* VIP Banner */}
            <TouchableOpacity style={s.vipBanner} activeOpacity={0.85} onPress={() => setCurrentScreen('vipMembership')}>
              <Text style={s.vipIcon}>👑</Text>
              <Text style={s.vipText}>{vipLabel}</Text>
              <View style={s.vipBadge}><Text style={s.vipBadgeText}>VIP</Text></View>
            </TouchableOpacity>

            {/* Promo cards */}
            <View style={s.promoRow}>
              {partnerPromoCard}
              {rewardPromoCard}
            </View>

            {/* Menu */}
            <View style={s.menuCard}>
              <MenuRow icon="📋" label="Lịch sử hoạt động" onPress={() => router.push('/activity')} />
              <MenuRow icon="👤" label="Thông tin cá nhân" onPress={() => setCurrentScreen('profile')} />
              <MenuRow icon="🌐" label="Ngôn ngữ" value={langLabel} onPress={() => setLanguage(language === 'vi' ? 'en' : 'vi')} />
              <MenuRow icon="🏳️" label="Quốc gia" value={`${country.flag} ${country.label}`} onPress={() => {}} />
              <MenuRow icon="ℹ️" label="Về chúng tôi" onPress={() => Alert.alert('Zena', 'Phiên bản 1.0.0\n\nỨng dụng đặt lịch massage và spa tại nhà.\n\n© 2026 Zena. All rights reserved.')} isLast />
            </View>

            {/* Logout */}
            <TouchableOpacity style={s.logoutBtn} onPress={logout} activeOpacity={0.85}>
              <Text style={s.logoutBtnText}>🚪  Đăng xuất</Text>
            </TouchableOpacity>
          </>
        ) : null}

        <View style={{ height: 40 }} />
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
    <SafeAreaView style={s.partnerContainer} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF7FA" />

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
            <Text style={s.partnerOptionIcon}>🧑‍⚕️</Text>
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
            <Text style={s.partnerOptionIcon}>🏢</Text>
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

  const save = async () => {
    if (!user?.phoneNumber) {
      Alert.alert(
        isEn ? 'Sign in required' : 'Cần đăng nhập',
        isEn
          ? 'Please sign in before submitting partner registration.'
          : 'Vui lòng đăng nhập trước khi gửi đăng ký đối tác.',
      );
      return;
    }

    if (!valid) {
      Alert.alert(
        isEn ? 'Missing required fields' : 'Thiếu thông tin bắt buộc',
        isEn
          ? 'Please add at least 2 branch images and fill all required fields.'
          : 'Vui lòng thêm ít nhất 2 ảnh và điền đầy đủ các trường bắt buộc.',
      );
      return;
    }
    setIsSaving(true);
    try {
      const applicationId = await createPartnerApplication({
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
        role: user.role === 'therapist' ? 'therapist' : 'customer',
        partnerApplicationId: applicationId,
        partnerApplicationStatus: 'pending',
      });

      Alert.alert(
        isEn ? 'Submitted for review' : 'Đã gửi chờ duyệt',
        isEn
          ? 'Your business partner registration and images were sent to admin for review.'
          : 'Hồ sơ doanh nghiệp và hình ảnh của bạn đã được gửi lên quản trị để phê duyệt.',
      );
      onBack();
    } catch {
      Alert.alert(
        isEn ? 'Submit failed' : 'Gửi hồ sơ thất bại',
        isEn ? 'Could not submit registration. Please try again.' : 'Không thể gửi hồ sơ. Vui lòng thử lại.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.partnerContainer} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF7FA" />
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
                    <Text style={s.businessImagePlaceholderIcon}>🖼️</Text>
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
          placeholderTextColor="#B59CA5"
          value={branchName}
          onChangeText={setBranchName}
        />

        <Text style={s.businessLabel}>{isEn ? 'Address' : 'Địa chỉ'} <Text style={s.requiredStar}>*</Text></Text>
        <TextInput
          style={s.businessInput}
          placeholder={isEn ? 'Enter branch address' : 'Nhập địa chỉ chi nhánh'}
          placeholderTextColor="#B59CA5"
          value={branchAddress}
          onChangeText={setBranchAddress}
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
            placeholderTextColor="#B59CA5"
            value={weekdayStart}
            onChangeText={setWeekdayStart}
          />
          <Text style={s.businessTimeDash}>-</Text>
          <TextInput
            style={s.businessTimeInput}
            placeholder="22:00"
            placeholderTextColor="#B59CA5"
            value={weekdayEnd}
            onChangeText={setWeekdayEnd}
          />
        </View>

        <View style={s.businessTimeRow}>
          <Text style={s.businessTimeLabel}>{isEn ? 'Sat - Sun' : 'Thứ 7 - Chủ nhật'}</Text>
          <TextInput
            style={s.businessTimeInput}
            placeholder="09:00"
            placeholderTextColor="#B59CA5"
            value={weekendStart}
            onChangeText={setWeekendStart}
          />
          <Text style={s.businessTimeDash}>-</Text>
          <TextInput
            style={s.businessTimeInput}
            placeholder="21:00"
            placeholderTextColor="#B59CA5"
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
              placeholderTextColor="#B59CA5"
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
    </SafeAreaView>
  );
}

function MenuRow({ icon, label, value, onPress, color, isLast }: {
  icon: string; label: string; value?: string;
  onPress: () => void; color?: string; isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.menuRow, !isLast && s.menuRowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.menuRowLeft}>
        <View style={s.menuIconWrap}><Text style={s.menuIcon}>{icon}</Text></View>
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
  onDeleteAccount,
}: {
  user: UserData;
  onBack: () => void;
  onSave: (user: UserData) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>(user.gender || 'other');
  const [nationality, setNationality] = useState(user.nationality || 'Việt Nam');
  const [password, setPassword] = useState(user.password || '');
  const [avatarUri, setAvatarUri] = useState(user.avatarUri || '');
  const [isSaving, setIsSaving] = useState(false);
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

    setIsSaving(true);
    try {
      await onSave({
        ...user,
        displayName: displayName.trim(),
        phoneNumber: phoneNumber.trim(),
        gender,
        nationality: nationality.trim(),
        password: password.trim(),
        avatarUri,
      });
      Alert.alert('Thành công', 'Thông tin tài khoản đã được cập nhật.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Xóa tài khoản', 'Bạn có chắc muốn xóa tài khoản khỏi thiết bị này không?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          await onDeleteAccount();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.profileDetailsContent}>
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
            <Text style={s.cameraBadgeText}>📷</Text>
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

        <TouchableOpacity style={s.deleteAccountButton} onPress={handleDelete} activeOpacity={0.7}>
          <Text style={s.deleteAccountButtonText}>Xóa tài khoản</Text>
        </TouchableOpacity>
      </ScrollView>
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
  const filteredCities = VN_PROVINCES.filter((item) =>
    item.toLowerCase().includes(cityQuery.trim().toLowerCase()),
  );

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
      Alert.alert('Thiếu hình ảnh', 'Vui lòng thêm ít nhất 2 ảnh.');
      return;
    }
    if (!displayName.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên của bạn.');
      return;
    }
    if (!workingCity.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn tỉnh/thành phố.');
      return;
    }
    if (services.length === 0) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn ít nhất 1 dịch vụ.');
      return;
    }

    setIsSaving(true);
    try {
      const applicationId = await createPartnerApplication({
        applicationType: 'individual',
        phoneNumber: user.phoneNumber ?? '',
        displayName: displayName.trim(),
        gender,
        workingCity,
        services,
        imageUris: galleryUris,
      });

      await onSave({
        ...user,
        avatarUri: user.avatarUri || '',
        displayName: displayName.trim(),
        gender,
        workingCity,
        serviceImages: galleryUris,
        services,
        role: user.role === 'therapist' ? 'therapist' : 'customer',
        partnerApplicationId: applicationId,
        partnerApplicationStatus: 'pending',
      });
      Alert.alert('Đã gửi chờ duyệt', 'Hồ sơ đối tác và hình ảnh đã được gửi lên quản trị để phê duyệt.');
    } catch {
      Alert.alert('Gửi hồ sơ thất bại', 'Không thể gửi hồ sơ. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };
  const canSave = galleryUris.length >= 2 && !!displayName.trim() && !!workingCity.trim() && services.length > 0 && !isSaving;

  return (
    <SafeAreaView style={s.partnerContainer} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF7FA" />

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
                    <Text style={s.businessImagePlaceholderIcon}>🖼️</Text>
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
          <Text style={s.businessWarning}>❗ Vui lòng thêm ít nhất 2 ảnh</Text>
        ) : null}
        <Text style={s.setupServiceHint}>Hình ảnh sẽ được quản trị viên duyệt nội dung. Ảnh phản cảm sẽ không được phê duyệt.</Text>

        <Text style={s.businessLabel}>Tên hiển thị <Text style={s.requiredStar}>*</Text></Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Nhập tên hiển thị"
          placeholderTextColor="#B59CA5"
          style={s.businessInput}
        />

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
              placeholderTextColor="#B59CA5"
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

function GuestBenefit({ label }: { label: string }) {
  return (
    <View style={s.guestBenefitPill}>
      <Text style={s.guestBenefitText}>{label}</Text>
    </View>
  );
}

function getInitials(value: string) {
  // If the value is purely digits (phone number), show a person icon
  if (/^\d+$/.test(value.trim())) return '👤';

  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'MN';
}

const s = StyleSheet.create({
  partnerContainer: { flex: 1, backgroundColor: '#FFF7FA' },
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
    color: '#2A0C16',
    marginBottom: 18,
    letterSpacing: -0.5,
  },
  partnerOptionCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BBDEFB',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#7A1230',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  partnerOptionTextWrap: { flex: 1, gap: 6 },
  partnerOptionTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: '#2A0C16' },
  partnerOptionDesc: { fontSize: 15, lineHeight: 22, color: '#7E5865', fontWeight: '500' },
  partnerOptionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FFEAF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerOptionIcon: { fontSize: 26 },
  businessHeaderTitle: { fontSize: 22, fontWeight: '800', color: '#2A0C16' },
  businessContent: { paddingHorizontal: 16, paddingBottom: 36 },
  businessLabel: { marginTop: 10, marginBottom: 8, color: '#2A0C16', fontSize: 18, fontWeight: '700' },
  requiredStar: { color: '#E33A57', fontSize: 16, fontWeight: '800' },
  businessImageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  businessImageSlot: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0D8E0',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  businessImage: { width: '100%', height: '100%' },
  businessImagePlaceholderIcon: { fontSize: 24, opacity: 0.35 },
  businessImagePlaceholderText: { marginTop: 4, fontSize: 12, color: '#B59CA5', fontWeight: '600' },
  businessPlusBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DE3A56',
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
  businessRemoveText: { color: '#6B5059', fontSize: 15, fontWeight: '800' },
  businessWarning: { color: '#1976D2', fontSize: 13, marginTop: 10, fontWeight: '600' },
  businessInput: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#F0D8E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: '#2A0C16',
  },
  businessSelect: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#F0D8E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  businessSelectText: { fontSize: 16, color: '#2A0C16', fontWeight: '600' },
  businessSelectPlaceholder: { color: '#B59CA5', fontWeight: '500' },
  businessSelectArrow: { fontSize: 14, color: '#8E7480' },
  businessCityWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  businessCityChip: {
    borderWidth: 1,
    borderColor: '#F0D8E0',
    backgroundColor: '#FFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  businessCityChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#FFE8EE',
  },
  businessCityChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7A5D68',
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
  cityModalTitle: { fontSize: 18, fontWeight: '800', color: '#2A0C16' },
  cityModalClose: { fontSize: 18, color: '#8E7480', fontWeight: '700' },
  citySearchInput: {
    backgroundColor: '#FFF7FA',
    borderWidth: 1,
    borderColor: '#F0D8E0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#2A0C16',
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
    backgroundColor: '#FFE8EE',
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
    borderColor: '#F0D8E0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    textAlign: 'center',
    color: '#2A0C16',
    fontSize: 14,
    fontWeight: '600',
  },
  businessTimeDash: { color: '#8E7480', fontSize: 16, fontWeight: '700' },
  businessSaveBtn: {
    marginTop: 20,
    borderRadius: 14,
    backgroundColor: '#DE3A56',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 20,
  },
  businessSaveBtnDisabled: { backgroundColor: '#F3E7EB' },
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
  profileName: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  profilePhone: { fontSize: 13, color: COLORS.subText },
  profileGender: { fontSize: 12, color: COLORS.subText },

  // VIP
  vipBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.goldLight, marginHorizontal: 12, marginTop: 12, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  vipIcon: { fontSize: 20 },
  vipText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#7A5400' },
  vipBadge: { backgroundColor: COLORS.gold, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  vipBadgeText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },

  // Promo cards
  promoRow: { flexDirection: 'row', gap: 12, marginHorizontal: 12, marginTop: 12, height: 120 },
  promoCard: { flex: 1, borderRadius: 14, padding: 14, gap: 8, justifyContent: 'space-between' },
  promoEmoji: { fontSize: 24 },
  promoRewardCard: { flex: 1, borderRadius: 14, overflow: 'hidden', minWidth: 0, flexBasis: 0 },
  promoRewardBannerImg: { width: '100%', height: '100%', borderRadius: 14 },
  promoTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, lineHeight: 19 },
  promoArrow: { fontSize: 18, color: COLORS.primary, fontWeight: '700' },

  // Menu
  menuCard: { backgroundColor: COLORS.white, borderRadius: 16, marginHorizontal: 12, marginTop: 12, borderWidth: 1, borderColor: COLORS.border },
  menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 15 },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  menuRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  menuIcon: { fontSize: 16 },
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
  cameraBadgeText: { fontSize: 16 },
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
  deleteAccountButton: {
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  deleteAccountButtonText: {
    color: COLORS.red,
    fontSize: 16,
    fontWeight: '500',
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
  guestGlowPrimary: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#F8E0E5',
    top: -78,
    right: -46,
  },
  guestGlowSecondary: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FAEEF1',
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
    backgroundColor: '#E3F2FD',
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
    backgroundColor: '#FAF4F5',
    borderWidth: 1,
    borderColor: '#EED7DC',
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
  signUpBtn: { borderWidth: 1.5, borderColor: '#D8A9B2', borderRadius: 16, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center', backgroundColor: '#FFF8F9' },
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
    backgroundColor: '#FFF4F6',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0D5DB',
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
    backgroundColor: '#FFF0F0',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FADDDD',
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutBtnText: {
    color: COLORS.red,
    fontSize: 15,
    fontWeight: '700',
  },
});
