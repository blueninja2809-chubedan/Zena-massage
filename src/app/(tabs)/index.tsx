import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    InteractionManager,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ChatScreen from '@/components/ChatScreen';
import MassageHomeScreen from '@/components/MassageHomeScreen';
import MassageLocationScreen from '@/components/MassageLocationScreen';
import NotificationScreen from '@/components/NotificationScreen';
import type { OnboardingLanguage } from '@/components/Onboarding';
import PromotionsScreen from '@/components/PromotionsScreen';
import TherapistTopUpScreen from '@/components/TherapistTopUpScreen';
import WalletScreen from '@/components/WalletScreen';
import { AppColors } from '@/constants/appColors';
import { DEFAULT_CITY, SERVICE_TYPES, VIETNAM_PROVINCES } from '@/constants/bookingFilters';
import { useActiveBooking } from '@/contexts/ActiveBookingContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useUser } from '@/contexts/UserContext';
import { useTabletLayout } from '@/hooks/use-tablet-layout';
import { getOrCreateWallet, getTherapists } from '@/lib/supabaseService';
import type { Therapist } from '@/lib/types';

const HOME_SERVICE_TAG_EMOJIS = ['🧴', '♨️', '💆', '🌸', '🦶', '💪', '🧴', '🤲', '✨', '🛁', '👂'] as const;

function getHomeServiceTags() {
  return SERVICE_TYPES.filter((n) => n !== 'Tất cả').map((label, i) => ({
    emoji: HOME_SERVICE_TAG_EMOJIS[i] ?? '✨',
    label,
  }));
}

const translations: Record<OnboardingLanguage, Record<string, string>> = {
  vi: {
    balanceLabel: 'Số dư',
    topUp: 'Nạp tiền',
    currency: '₫',
    bannerHomeTitle: 'Massage tại nhà',
    bannerHomeDesc: 'Xem & chọn kỹ thuật viên phục vụ tận nhà',
    bannerLocTitle: '500+ địa điểm tập luyện và spa',
    bannerLocDesc: 'Giá tốt, dịch vụ đa dạng,\ncó mặt khắp mọi nơi',
    bannerPromoTitle: 'Ưu đãi hấp dẫn',
    bannerPromoDesc: 'Giảm đến 50% cho lần đặt đầu tiên',
    therapistListTitle: 'Kỹ thuật viên đang rảnh',
    therapistListDesc: 'Chọn kỹ thuật viên để xem giao diện booking',
    loadingTherapists: 'Đang tải kỹ thuật viên...',
    noTherapists: 'Chưa có kỹ thuật viên nào khả dụng',
    available: 'Sẵn sàng',
    bookNow: 'Đặt ngay',
    support: 'Hỗ trợ',
    supportChannels: 'Kênh hỗ trợ',
    services: 'Dịch vụ',
    offers: 'Ưu đãi',
    upTo50: 'Giảm đến 50%',
    vip: 'VIP',
    moreTherapists: 'Nhiều kỹ thuật viên hơn',
    featuredTherapists: 'Kỹ thuật viên nổi bật',
    seeAll: 'Xem tất cả',
    age: 'Tuổi',
    yearsExp: 'năm kinh nghiệm',
    reviews: 'đánh giá',
    selectCity: 'Chọn tỉnh/thành phố',
    searchCity: 'Tìm tỉnh/thành...',
    noCityFound: 'Không tìm thấy tỉnh/thành phù hợp',
    noTherapistsInCity: 'Chưa có kỹ thuật viên tại khu vực đã chọn',
  },
  en: {
    balanceLabel: 'Balance',
    topUp: 'Top up',
    currency: '₫',
    bannerHomeTitle: 'Home Massage',
    bannerHomeDesc: 'Browse & choose a therapist at your doorstep',
    bannerLocTitle: '500+ training & spa locations',
    bannerLocDesc: 'Great prices, diverse services,\navailable everywhere',
    bannerPromoTitle: 'Exciting Offers',
    bannerPromoDesc: 'Up to 50% off your first booking',
    therapistListTitle: 'Available therapists',
    therapistListDesc: 'Choose a therapist to preview the booking flow',
    loadingTherapists: 'Loading therapists...',
    noTherapists: 'No therapists available right now',
    available: 'Available',
    bookNow: 'Book now',
    support: 'Support',
    supportChannels: 'Support channels',
    services: 'Services',
    offers: 'Offers',
    upTo50: 'Up to 50% off',
    vip: 'VIP',
    moreTherapists: 'More therapists',
    featuredTherapists: 'Featured therapists',
    seeAll: 'See all',
    age: 'Age',
    yearsExp: 'years experience',
    reviews: 'reviews',
    selectCity: 'Select province/city',
    searchCity: 'Search province/city...',
    noCityFound: 'No matching province/city',
    noTherapistsInCity: 'No therapists in selected area',
  },
};

const COLORS = {
  primary: AppColors.primaryDark,
  dark: AppColors.primaryDark,
  light: AppColors.border,
  bg: AppColors.bg,
  text: AppColors.text,
  lightText: AppColors.textMuted,
  accent: AppColors.accent,
};

const isTestMode =
  process.env.EXPO_PUBLIC_TEST_MODE === 'true' ||
  process.env.EXPO_PUBLIC_TEST_MODE === '1' ||
  (typeof __DEV__ !== 'undefined' && __DEV__);

function buildMockFeaturedTherapists(city: string): Therapist[] {
  const now = new Date().toISOString();
  const baseCity = city?.trim() || DEFAULT_CITY;
  return [
    {
      id: 'mock-therapist-1',
      name: 'Linh Anh',
      phoneNumber: '0901000001',
      email: 'linhanh.mock@zena.vn',
      gender: 'female',
      avatar: 'https://i.pravatar.cc/300?img=47',
      bio: 'KTV nhẹ nhàng, chuyên massage thư giãn tại nhà.',
      bioEn: 'Gentle therapist specialized in relaxing home massage.',
      specialties: ['Massage Dầu + Giác Hơi', 'Massage Thái'],
      experience: 5,
      rating: 4.9,
      reviewCount: 128,
      hourlyRate: 380000,
      distanceFromCenter: 1.3,
      workingCity: baseCity,
      isAvailable: true,
      availability: {},
      languages: ['vi', 'en'],
      certifications: ['Spa Therapy'],
      createdAt: now,
    },
    {
      id: 'mock-therapist-2',
      name: 'Ngọc Mai',
      phoneNumber: '0901000002',
      email: 'ngocmai.mock@zena.vn',
      gender: 'female',
      avatar: 'https://i.pravatar.cc/300?img=32',
      bio: 'KTV kinh nghiệm cao, lực tay tốt, phù hợp dân văn phòng.',
      bioEn: 'Experienced therapist with strong pressure for office workers.',
      specialties: ['Massage Đá Nóng', 'Massage Cổ Vai Gáy'],
      experience: 7,
      rating: 4.8,
      reviewCount: 173,
      hourlyRate: 420000,
      distanceFromCenter: 2.1,
      workingCity: baseCity,
      isAvailable: true,
      availability: {},
      languages: ['vi'],
      certifications: ['Hot Stone'],
      createdAt: now,
    },
    {
      id: 'mock-therapist-3',
      name: 'Thảo Vy',
      phoneNumber: '0901000003',
      email: 'thaovy.mock@zena.vn',
      gender: 'female',
      avatar: 'https://i.pravatar.cc/300?img=44',
      bio: 'Phong cách trị liệu nhẹ nhàng, chăm sóc toàn thân.',
      bioEn: 'Soft therapeutic style with full body care.',
      specialties: ['Massage Foot', 'Aromatherapy'],
      experience: 4,
      rating: 4.7,
      reviewCount: 94,
      hourlyRate: 360000,
      distanceFromCenter: 0.9,
      workingCity: baseCity,
      isAvailable: true,
      availability: {},
      languages: ['vi', 'en'],
      certifications: ['Aromatherapy'],
      createdAt: now,
    },
    {
      id: 'mock-therapist-4',
      name: 'Mỹ Duyên',
      phoneNumber: '0901000004',
      email: 'myduyen.mock@zena.vn',
      gender: 'female',
      avatar: 'https://i.pravatar.cc/300?img=49',
      bio: 'KTV thân thiện, phù hợp khách hàng mới trải nghiệm.',
      bioEn: 'Friendly therapist, ideal for first-time customers.',
      specialties: ['Massage Thư Giãn', 'Massage Body'],
      experience: 3,
      rating: 4.8,
      reviewCount: 81,
      hourlyRate: 340000,
      distanceFromCenter: 3.0,
      workingCity: baseCity,
      isAvailable: true,
      availability: {},
      languages: ['vi'],
      certifications: ['Body Massage'],
      createdAt: now,
    },
  ];
}

function hasTherapistInCity(items: Therapist[], city: string): boolean {
  const target = city.trim().toLowerCase();
  if (!target) return items.length > 0;
  return items.some((item) => (item.workingCity || '').trim().toLowerCase() === target);
}

export default function HomeScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const tabletLayout = useTabletLayout();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { user, setUser } = useUser();
  const { activeBooking } = useActiveBooking();
  const router = useRouter();
  const [showTherapistModal, setShowTherapistModal] = useState(false);
  const [showMassageHome, setShowMassageHome] = useState(false);
  const [showMassageLocation, setShowMassageLocation] = useState(false);
  const [showPromotions, setShowPromotions] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const { unreadCount: unreadNotifCount, refreshUnreadCount } = useNotifications();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [featuredTherapists, setFeaturedTherapists] = useState<Therapist[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [loadingTherapists, setLoadingTherapists] = useState(false);
  const [balance, setBalance] = useState(0);
  const isVipMember = !!user?.isVipMember;
  const [selectedCity, setSelectedCity] = useState(user?.selectedCity || user?.workingCity || DEFAULT_CITY);

  const strings = useMemo(() => {
    return translations[language] ?? translations.vi;
  }, [language]);
  const contentMaxWidth = tabletLayout.isTablet ? 980 : screenWidth;
  const contentHorizontalPadding = tabletLayout.horizontalPadding;
  const contentHorizontalInset = tabletLayout.isTablet ? contentHorizontalPadding : 8;
  const contentAreaWidth = Math.min(screenWidth - contentHorizontalPadding * 2, contentMaxWidth);
  const gridGap = tabletLayout.isTablet ? 16 : 12;
  const gridHeight = tabletLayout.isTablet ? 260 : 210;
  const rightColumnWidth = tabletLayout.isTablet
    ? Math.max(180, contentAreaWidth * 0.38)
    : Math.max(140, (screenWidth - 44) * 0.42);
  const featuredCardWidth = tabletLayout.isTablet ? 176 : 140;
  const cardImageResizeMode = tabletLayout.isTablet ? 'contain' : 'cover';

  useEffect(() => {
    if (user?.selectedCity && user.selectedCity !== selectedCity) {
      setSelectedCity(user.selectedCity);
    }
  }, [user?.selectedCity, selectedCity]);

  const resolveTherapistCity = (item: Therapist) => {
    if (item.workingCity?.trim()) {
      return item.workingCity.trim();
    }
    const hash = item.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return VIETNAM_PROVINCES[hash % VIETNAM_PROVINCES.length];
  };

  const filteredCities = useMemo(
    () => VIETNAM_PROVINCES.filter((city) => city.toLowerCase().includes(cityQuery.trim().toLowerCase())),
    [cityQuery],
  );

  // Load wallet balance
  const loadWalletBalance = useCallback(() => {
    if (!user?.authUid) return;
    getOrCreateWallet(user.authUid)
      .then((w) => setBalance(w.balance))
      .catch(() => {});
  }, [user?.authUid]);

  useEffect(() => { loadWalletBalance(); }, [loadWalletBalance]);



  // Load featured therapists after transitions — avoids stacking network work right when tabs appear after login
  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        try {
          const data = await getTherapists();
          if (cancelled) return;
          let source = data;
          if (isTestMode) {
            if (source.length === 0) {
              source = buildMockFeaturedTherapists(selectedCity);
            } else if (!hasTherapistInCity(source, selectedCity)) {
              source = [...source, ...buildMockFeaturedTherapists(selectedCity)];
            }
          }
          const sorted = [...source].sort((a, b) => b.rating - a.rating);
          setFeaturedTherapists(sorted);
        } catch {
          if (!cancelled) {
            setFeaturedTherapists(isTestMode ? buildMockFeaturedTherapists(selectedCity) : []);
          }
        } finally {
          if (!cancelled) setLoadingFeatured(false);
        }
      })();
    });
    return () => {
      cancelled = true;
      task.cancel?.();
    };
  }, [selectedCity]);

  const handleSelectCity = async (city: string) => {
    setSelectedCity(city);
    setShowCityPicker(false);
    if (user) {
      await setUser({ ...user, selectedCity: city });
    }
  };

  const handleOpenTherapists = async () => {
    setShowTherapistModal(true);

    if (therapists.length > 0 || loadingTherapists) {
      return;
    }

    try {
      setLoadingTherapists(true);
      const data = await getTherapists();
      let source = data;
      if (isTestMode) {
        if (source.length === 0) {
          source = buildMockFeaturedTherapists(selectedCity);
        } else if (!hasTherapistInCity(source, selectedCity)) {
          source = [...source, ...buildMockFeaturedTherapists(selectedCity)];
        }
      }
      setTherapists(source);
    } catch (error) {
      console.error('Error loading therapists from home:', error);
      setTherapists(isTestMode ? buildMockFeaturedTherapists(selectedCity) : []);
    } finally {
      setLoadingTherapists(false);
    }
  };

  const renderTherapistCard = ({ item }: { item: Therapist }) => {
    const distanceText = item.distanceFromCenter < 1
      ? `${Math.round(item.distanceFromCenter * 1000)}m`
      : `${item.distanceFromCenter} km`;

    return (
      <TouchableOpacity style={styles.therapistCard} activeOpacity={0.85}>
        <View style={styles.therapistAvatar}>
          {item.avatar?.startsWith('http') ? (
            <Image source={{ uri: item.avatar }} style={styles.therapistAvatarImage} />
          ) : (
            <Text style={styles.therapistAvatarText}>{item.gender === 'female' ? '👩' : '👨'}</Text>
          )}
        </View>
        <View style={styles.therapistInfo}>
          <Text style={styles.therapistName}>{item.name}</Text>
          <Text style={styles.therapistMeta}>⭐ {item.rating.toFixed(1)} • {item.reviewCount} {strings.reviews}</Text>
          <Text style={styles.therapistMeta}>📍 {distanceText} • {item.experience} {strings.yearsExp}</Text>
          {isVipMember ? <Text style={styles.therapistMeta}>🎂 {strings.age}: {estimateAge(item)}</Text> : null}
          <View style={styles.therapistFooter}>
            <View style={styles.availableBadge}>
              <View style={styles.availableDot} />
              <Text style={styles.availableText}>{strings.available}</Text>
            </View>
            <Text style={styles.therapistPrice}>{item.hourlyRate.toLocaleString()}₫/giờ</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.therapistBookButton}>
          <Text style={styles.therapistBookText}>{strings.bookNow}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const cityFeaturedTherapists = useMemo(
    () => featuredTherapists.filter((item) => resolveTherapistCity(item) === selectedCity),
    [featuredTherapists, selectedCity],
  );

  const visibleFeaturedTherapists = useMemo(
    () => cityFeaturedTherapists.slice(0, isVipMember ? 10 : 5),
    [cityFeaturedTherapists, isVipMember],
  );

  const visibleTherapists = useMemo(
    () => {
      const byCity = therapists.filter((item) => resolveTherapistCity(item) === selectedCity);
      return isVipMember ? byCity : byCity.slice(0, 6);
    },
    [therapists, isVipMember, selectedCity],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} translucent />

      {/* Khối đỏ bọc đầu (full-bleed), bo góc đáy — đồng bộ app dịch vụ */}
      <View style={[styles.heroBlue, { paddingTop: Math.max(insets.top, 10) + 8 }]}>
        <View style={[styles.pageMax, { maxWidth: contentMaxWidth, paddingHorizontal: contentHorizontalInset }]}>
        <View style={styles.headerBar}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.avatarPlaceholder} onPress={() => router.push('/account')}>
              <Text style={styles.avatarIcon}>👤</Text>
            </TouchableOpacity>
            <View>
              <TouchableOpacity style={styles.locationRow} onPress={() => setShowCityPicker(true)}>
                <Text style={styles.locationText}>{selectedCity}</Text>
                <Text style={styles.locationArrow}>▾</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowNotifications(true)}>
              <Text style={styles.headerIcon}>🔔</Text>
              {unreadNotifCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowChat(true)}>
              <Text style={styles.headerIcon}>💬</Text>
            </TouchableOpacity>
          </View>
        </View>
        </View>
      </View>

      {user ? (
        <View style={[styles.pageMax, { maxWidth: contentMaxWidth }]}>
        <View style={[styles.balanceOuter, { marginHorizontal: contentHorizontalInset }]}>
          <View style={styles.balanceSection}>
            <View style={styles.balanceLeft}>
              <TouchableOpacity style={styles.balanceLabelRow} onPress={() => setShowWallet(true)}>
                <Text style={styles.balanceLabel}>{strings.balanceLabel}</Text>
                <Text style={styles.balanceChevron}>›</Text>
              </TouchableOpacity>
              <Text style={styles.balanceAmount}>
                {balance.toLocaleString()} {strings.currency}
              </Text>
            </View>
            <TouchableOpacity style={styles.topUpButton} onPress={() => setShowTopUp(true)}>
              <Text style={styles.topUpText}>{strings.topUp}</Text>
            </TouchableOpacity>
          </View>
        </View>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pageMax, { maxWidth: contentMaxWidth, paddingHorizontal: contentHorizontalInset }]}>
        {/* Connected Therapist Banner */}
        {activeBooking && (
          <View style={styles.connectedBanner}>
            <Image source={{ uri: activeBooking.therapist.avatar }} style={styles.connectedAvatar} />
            <View style={styles.connectedInfo}>
              <Text style={styles.connectedName}>{activeBooking.therapist.name}</Text>
              <Text style={styles.connectedStatus}>{language === 'en' ? 'Connected' : 'Đã kết nối'}</Text>
            </View>
            <TouchableOpacity style={styles.connectedMsgBtn} onPress={() => setShowChat(true)}>
              <Text style={styles.connectedMsgIcon}>💬</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.connectedDetailBtn} onPress={() => setShowChat(true)}>
              <Text style={styles.connectedDetailIcon}>↗</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Actions Grid */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{strings.services}</Text>
        </View>
        <View style={[styles.gridContainer, tabletLayout.isTablet && { height: gridHeight, gap: gridGap }]}>
          {/* Large card — Massage tại nhà */}
          <TouchableOpacity style={styles.gridCardLarge} activeOpacity={0.85} onPress={() => setShowMassageHome(true)}>
            <Image
              source={require('@/assets/images/massage-home-banner.png')}
              style={{ width: '100%', height: '100%' }}
              resizeMode={cardImageResizeMode}
            />
          </TouchableOpacity>

          {/* Right column — 2 smaller cards */}
          <View
            style={[
              tabletLayout.isTablet ? styles.gridColRightTablet : styles.gridColRight,
              { width: rightColumnWidth, gap: gridGap },
            ]}
          >
            <TouchableOpacity
              style={tabletLayout.isTablet ? styles.gridCardSmallImgTablet : styles.gridCardSmallImg}
              activeOpacity={0.85}
              onPress={() => setShowMassageLocation(true)}
            >
              <Image
                source={require('@/assets/images/promo-location-banner.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode={cardImageResizeMode}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.gridCardSmall} activeOpacity={0.85} onPress={() => setShowPromotions(true)}>
              <View style={[styles.gridCardBg, { backgroundColor: COLORS.primary }]}>
                <View style={[styles.gridDeco, { width: 80, height: 80, bottom: -20, left: -10 }]} />
                <View style={styles.gridCardContent}>
                  <Text style={styles.gridEmojiSmall}>🎁</Text>
                  <Text style={styles.gridTitleSmall}>{strings.offers}</Text>
                  <Text style={styles.gridDescSmall}>{strings.upTo50}</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick service tags */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow} contentContainerStyle={styles.tagsContent}>
          {getHomeServiceTags().map((tag) => (
            <TouchableOpacity key={tag.label} style={styles.tagChip} activeOpacity={1} onPress={() => setShowMassageHome(true)}>
              <Text style={styles.tagEmoji}>{tag.emoji}</Text>
              <Text style={styles.tagLabel}>{tag.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Featured Therapists */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{strings.featuredTherapists}</Text>
          <TouchableOpacity onPress={handleOpenTherapists}>
            <Text style={styles.seeAllLink}>{strings.seeAll} ›</Text>
          </TouchableOpacity>
        </View>

        {loadingFeatured ? (
          <View style={styles.featuredLoading}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        ) : visibleFeaturedTherapists.length === 0 ? (
          <View style={styles.featuredEmpty}>
            <Text style={styles.therapistEmptyText}>{strings.noTherapistsInCity}</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.featuredScrollContent, { gap: gridGap }]}
          >
            {visibleFeaturedTherapists.map((t) => {
              const distText = t.distanceFromCenter < 1
                ? `${Math.round(t.distanceFromCenter * 1000)}m`
                : `${t.distanceFromCenter} km`;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.featuredCard, { width: featuredCardWidth }]}
                  activeOpacity={0.85}
                  onPress={() => setShowMassageHome(true)}
                >
                  <View style={styles.featuredAvatarWrap}>
                    <View style={styles.featuredAvatar}>
                      {t.avatar?.startsWith('http') ? (
                        <Image source={{ uri: t.avatar }} style={styles.featuredAvatarImage} />
                      ) : (
                        <Text style={styles.featuredAvatarText}>
                          {t.gender === 'female' ? '👩' : '👨'}
                        </Text>
                      )}
                    </View>
                    {t.rating >= 4.8 && (
                      <View style={styles.featuredBadge}>
                        <Text style={styles.featuredBadgeText}>⭐</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.featuredName} numberOfLines={1}>{t.name}</Text>
                  <View style={styles.featuredRatingRow}>
                    <Text style={styles.featuredStar}>⭐</Text>
                    <Text style={styles.featuredRating}>{t.rating.toFixed(1)}</Text>
                    <Text style={styles.featuredReviews}>({t.reviewCount})</Text>
                  </View>
                  <Text style={styles.featuredDistance}>📍 {distText}</Text>
                  <View style={styles.featuredSpecialty}>
                    <Text style={styles.featuredSpecialtyText} numberOfLines={1}>{t.specialties[0]}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Bottom spacer */}
        <View style={{ height: 80 }} />
        </View>
      </ScrollView>


      <Modal visible={showCityPicker} transparent animationType="slide" onRequestClose={() => setShowCityPicker(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.cityModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{strings.selectCity}</Text>
              <TouchableOpacity onPress={() => setShowCityPicker(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.citySearchWrap}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.citySearchInput}
                placeholder={strings.searchCity}
                placeholderTextColor="#999"
                value={cityQuery}
                onChangeText={setCityQuery}
              />
            </View>
            <FlatList
              data={filteredCities}
              keyExtractor={(item) => item}
              contentContainerStyle={styles.cityListContent}
              renderItem={({ item }) => {
                const active = item === selectedCity;
                return (
                  <TouchableOpacity
                    style={[styles.cityItem, active && styles.cityItemActive]}
                    onPress={() => handleSelectCity(item)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.cityItemText, active && styles.cityItemTextActive]}>{item}</Text>
                    {active ? <Text style={styles.cityCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.cityEmptyText}>{strings.noCityFound}</Text>}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showTherapistModal} transparent animationType="slide" onRequestClose={() => setShowTherapistModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.therapistModalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{strings.therapistListTitle}</Text>
                <Text style={styles.therapistModalDesc}>{strings.therapistListDesc}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTherapistModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingTherapists ? (
              <View style={styles.therapistEmptyState}>
                <Text style={styles.therapistLoadingText}>{strings.loadingTherapists}</Text>
              </View>
            ) : visibleTherapists.length === 0 ? (
              <View style={styles.therapistEmptyState}>
                <Text style={styles.therapistEmptyEmoji}>💆</Text>
                <Text style={styles.therapistEmptyText}>{strings.noTherapistsInCity}</Text>
              </View>
            ) : (
              <FlatList
                data={visibleTherapists}
                keyExtractor={(item) => item.id}
                renderItem={renderTherapistCard}
                contentContainerStyle={styles.therapistListContent}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Massage Home full-screen overlay */}
      <Modal visible={showMassageHome} animationType="slide" onRequestClose={() => setShowMassageHome(false)}>
        <MassageHomeScreen
          onClose={() => setShowMassageHome(false)}
          selectedCity={selectedCity}
          onChangeCity={handleSelectCity}
        />
      </Modal>

      {/* Notification screen */}
      <Modal visible={showNotifications} animationType="slide" onRequestClose={() => setShowNotifications(false)}>
        <NotificationScreen onClose={() => { setShowNotifications(false); refreshUnreadCount(); }} />
      </Modal>

      {/* Chat screen */}
      <Modal visible={showChat} animationType="slide" onRequestClose={() => setShowChat(false)}>
        <ChatScreen onClose={() => setShowChat(false)} />
      </Modal>

      {/* Massage Location screen */}
      <Modal visible={showMassageLocation} animationType="slide" onRequestClose={() => setShowMassageLocation(false)}>
        <MassageLocationScreen onClose={() => setShowMassageLocation(false)} />
      </Modal>

      {/* Promotions screen */}
      <Modal visible={showPromotions} animationType="slide" onRequestClose={() => setShowPromotions(false)}>
        <PromotionsScreen onClose={() => setShowPromotions(false)} />
      </Modal>

      {/* Top-up screen */}
      <Modal visible={showTopUp} animationType="slide" onRequestClose={() => setShowTopUp(false)}>
        <TherapistTopUpScreen onClose={() => { setShowTopUp(false); loadWalletBalance(); }} />
      </Modal>

      {/* Wallet screen */}
      <Modal visible={showWallet} animationType="slide" onRequestClose={() => setShowWallet(false)}>
        <WalletScreen onClose={() => { setShowWallet(false); loadWalletBalance(); }} />
      </Modal>

    </SafeAreaView>
  );
}

function estimateAge(item: Therapist) {
  const base = 21 + item.experience;
  const hash = item.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return base + (hash % 5);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  pageMax: {
    width: '100%',
    alignSelf: 'center',
  },

  heroBlue: {
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.38)',
    paddingBottom: 18,
    overflow: 'hidden',
  },

  balanceOuter: {
    marginTop: 12,
    marginBottom: 4,
  },

  // --- Header Bar ---
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: {
    fontSize: 20,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  locationArrow: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.88)',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconBtn: {
    position: 'relative',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 18,
  },
  notifBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  notifBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },

  // --- Balance Section ---
  balanceSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 20,
  },
  balanceLeft: {
    flex: 1,
  },
  balanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  balanceLabel: {
    fontSize: 13,
    color: COLORS.lightText,
    fontWeight: '500',
  },
  balanceChevron: {
    fontSize: 16,
    color: COLORS.lightText,
    fontWeight: '600',
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  topUpButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  topUpText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // --- Scroll Content ---
  scrollContent: {
    paddingTop: 10,
    paddingBottom: 100,
  },

  // --- Section Headers ---
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  seeAllLink: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // --- Grid Layout ---
  gridContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    height: 210,
  },
  gridCardLarge: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  gridColRight: {
    width: '42%',
    gap: 12,
  },
  gridColRightTablet: {
    flex: 1,
    gap: 12,
  },
  gridCardSmall: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  gridCardSmallImg: {
    borderRadius: 16,
    overflow: 'hidden',
    aspectRatio: 960 / 600,
  },
  gridCardSmallImgTablet: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    minHeight: 110,
  },
  gridCardBg: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 100,
  },
  gridDeco: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.15,
    backgroundColor: '#fff',
  },
  gridCardContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  gridEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  gridTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  gridDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 17,
    marginBottom: 10,
  },
  gridArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridArrowIcon: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
  gridEmojiSmall: {
    fontSize: 26,
    marginBottom: 6,
  },
  gridTitleSmall: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  gridDescSmall: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
  },

  // --- Quick Tags ---
  tagsRow: {
    marginBottom: 20,
  },
  tagsContent: {
    gap: 10,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  tagEmoji: {
    fontSize: 16,
  },
  tagLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },

  // --- Featured Therapists ---
  featuredLoading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  featuredEmpty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  featuredScrollContent: {
    gap: 12,
    paddingRight: 4,
  },
  featuredCard: {
    width: 140,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  featuredAvatarWrap: {
    position: 'relative',
    marginBottom: 10,
  },
  featuredAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: AppColors.primarySoft2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
  },
  featuredAvatarText: {
    fontSize: 30,
  },
  featuredBadge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  featuredBadgeText: {
    fontSize: 10,
  },
  featuredName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  featuredRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 3,
  },
  featuredStar: {
    fontSize: 11,
  },
  featuredRating: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F5A623',
  },
  featuredReviews: {
    fontSize: 11,
    color: COLORS.lightText,
  },
  featuredDistance: {
    fontSize: 11,
    color: COLORS.lightText,
    marginBottom: 8,
  },
  featuredSpecialty: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  featuredSpecialtyText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // --- Support Button ---
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
  },
  supportButtonDragLayer: {
    position: 'absolute',
    zIndex: 50,
  },
  supportButtonIcon: {
    fontSize: 18,
  },
  supportButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  // --- Modal ---
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(60, 45, 35, 0.38)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  therapistModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '86%',
  },
  cityModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
  },
  citySearchWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.primarySoft2,
    borderRadius: 16,
    paddingHorizontal: 10,
    gap: 8,
  },
  citySearchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 10,
  },
  searchIcon: {
    fontSize: 14,
  },
  cityListContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  cityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.white,
    marginBottom: 8,
  },
  cityItemActive: {
    backgroundColor: AppColors.primaryDark,
    borderColor: AppColors.primaryDark,
  },
  cityItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  cityItemTextActive: {
    color: '#fff',
  },
  cityCheck: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  cityEmptyText: {
    textAlign: 'center',
    paddingVertical: 20,
    color: COLORS.lightText,
    fontSize: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.light,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  therapistModalDesc: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.lightText,
  },
  closeButton: {
    fontSize: 24,
    color: COLORS.lightText,
    fontWeight: '400',
  },
  supportChannelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.light,
    gap: 12,
  },
  supportIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportIcon: {
    fontSize: 22,
  },
  supportIconText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  supportChannelName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  supportChevron: {
    fontSize: 18,
    color: COLORS.lightText,
  },
  therapistListContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  therapistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0A2540',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  therapistAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppColors.primarySoft2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  therapistAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
  },
  therapistAvatarText: {
    fontSize: 28,
  },
  therapistInfo: {
    flex: 1,
  },
  therapistName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  therapistMeta: {
    fontSize: 12,
    color: COLORS.lightText,
    marginBottom: 2,
  },
  therapistFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  availableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  availableDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.accent,
  },
  availableText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.primaryDark,
  },
  therapistPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  therapistBookButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    marginLeft: 12,
  },
  therapistBookText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  therapistEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  therapistLoadingText: {
    fontSize: 14,
    color: COLORS.lightText,
  },
  therapistEmptyEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  therapistEmptyText: {
    fontSize: 14,
    color: COLORS.lightText,
    textAlign: 'center',
  },

  // --- Connected Therapist Banner ---
  connectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  connectedAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8E8E8',
    marginRight: 10,
  },
  connectedInfo: {
    flex: 1,
  },
  connectedName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  connectedStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.primaryDark,
  },
  connectedMsgBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: AppColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  connectedMsgIcon: {
    fontSize: 18,
  },
  connectedDetailBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedDetailIcon: {
    fontSize: 16,
    color: '#666',
  },
});
