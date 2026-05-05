import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ChatScreen from '@/components/ChatScreen';
import MassageHomeScreen from '@/components/MassageHomeScreen';
import MassageLocationScreen from '@/components/MassageLocationScreen';
import { ModalSafeAreaProvider } from '@/components/ModalSafeAreaProvider';
import NotificationScreen from '@/components/NotificationScreen';
import type { OnboardingLanguage } from '@/components/Onboarding';
import PromotionsScreen from '@/components/PromotionsScreen';
import TherapistTopUpScreen from '@/components/TherapistTopUpScreen';
import WalletScreen from '@/components/WalletScreen';
import { AppColors } from '@/constants/appColors';
import { SERVICE_TYPES, VIETNAM_PROVINCES } from '@/constants/bookingFilters';
import { useActiveBooking } from '@/contexts/ActiveBookingContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useUser } from '@/contexts/UserContext';
import { useTabletLayout } from '@/hooks/use-tablet-layout';
import {
  consumeReopenMassageAfterRegion,
  loadPersistedHomeSelectedCity,
  persistHomeSelectedCity,
} from '@/lib/homeSelectedRegionStorage';
import {
  applyCustomerDistanceToTherapists,
  getStoredCustomerLocation,
  refreshCustomerLocation,
} from '@/lib/location';
import { scheduleNonBlockingWork } from '@/lib/scheduleNonBlockingWork';
import { canUseAppFeatures } from '@/lib/session';
import { getOrCreateWallet, getTherapists, therapistDisplayImageCandidates } from '@/lib/supabaseService';
import type { Therapist } from '@/lib/types';
import { inferVietnamProvinceFromCoordinates } from '@/lib/vietnamProvinceFromGps';

/** Banner slide trang chủ: thời gian mỗi ảnh trước khi tự chuyển (ms). Tăng = chậm hơn, giảm = nhanh hơn. */
const HOME_PROMO_AUTOPLAY_MS = 6000;

const HOME_SERVICE_TAG_ICON_NAMES: React.ComponentProps<typeof Feather>['name'][] = [
  'droplet',
  'activity',
  'heart',
  'sun',
  'navigation',
  'target',
  'circle',
  'zap',
  'star',
  'coffee',
  'circle',
];

function getHomeServiceTags() {
  return SERVICE_TYPES.filter((n) => n !== 'Tất cả').map((label, i) => ({
    iconName: HOME_SERVICE_TAG_ICON_NAMES[i] ?? 'circle',
    label,
  }));
}

function formatDistanceLabel(distanceKm: number, updatingText: string): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return updatingText;
  }
  if (distanceKm < 0.05) {
    return '< 50 m';
  }
  if (distanceKm < 1) {
    return `${Math.max(1, Math.round(distanceKm * 1000))} m`;
  }
  return `${Math.round(distanceKm * 10) / 10} km`;
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
    bannerPromoDesc: 'Mã giảm giá phát hành trong app — xem mục Ưu đãi khi có chương trình.',
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
    upTo50: 'Ưu đãi có thời hạn',
    vip: 'VIP',
    moreTherapists: 'Nhiều kỹ thuật viên hơn',
    featuredTherapists: 'Kỹ thuật viên nổi bật',
    seeAll: 'Xem tất cả',
    age: 'Tuổi',
    yearsExp: 'năm kinh nghiệm',
    reviews: 'đánh giá',
    noTherapistsInCity: 'Chưa có kỹ thuật viên tại khu vực đã chọn',
    distanceUpdating: 'Đang cập nhật',
    detectingRegion: 'Đang xác định…',
    pickRegion: 'Chọn khu vực',
    selectRegionHint: 'Chọn tỉnh/thành ở góc trên hoặc bật định vị để xem kỹ thuật viên gần bạn.',
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
    bannerPromoDesc: 'Promo codes posted in the app — check Offers when campaigns run.',
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
    upTo50: 'Limited-time offers',
    vip: 'VIP',
    moreTherapists: 'More therapists',
    featuredTherapists: 'Featured therapists',
    seeAll: 'See all',
    age: 'Age',
    yearsExp: 'years experience',
    reviews: 'reviews',
    noTherapistsInCity: 'No therapists in selected area',
    distanceUpdating: 'Updating',
    detectingRegion: 'Detecting…',
    pickRegion: 'Choose area',
    selectRegionHint: 'Pick a province/city above or enable location to see therapists near you.',
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

export default function HomeScreen() {
  const { width: screenWidth, height: windowHeight } = useWindowDimensions();
  const tabletLayout = useTabletLayout();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { user, setUser, isLoading: authLoading } = useUser();
  const { activeBooking } = useActiveBooking();
  const router = useRouter();

  const promptSignIn = useCallback(() => {
    Alert.alert(
      language === 'en' ? 'Sign in required' : 'Cần đăng nhập',
      language === 'en'
        ? 'Please sign in to use this feature.'
        : 'Vui lòng đăng nhập để sử dụng tính năng này.',
      [
        { text: language === 'en' ? 'Cancel' : 'Huỷ', style: 'cancel' },
        {
          text: language === 'en' ? 'Sign in' : 'Đăng nhập',
          onPress: () => router.push('/(tabs)/account'),
        },
      ],
    );
  }, [language, router]);

  const requireAuthTo = useCallback(
    (fn: () => void) => {
      if (authLoading) return;
      if (!canUseAppFeatures(user)) {
        promptSignIn();
        return;
      }
      fn();
    },
    [user, authLoading, promptSignIn],
  );

  const [showTherapistModal, setShowTherapistModal] = useState(false);
  const [showMassageHome, setShowMassageHome] = useState(false);
  const [selectedHomeService, setSelectedHomeService] = useState<string | null>(null);
  const [showMassageLocation, setShowMassageLocation] = useState(false);
  const [showPromotions, setShowPromotions] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [autoLocateDone, setAutoLocateDone] = useState(false);
  const [homeSlideIndex, setHomeSlideIndex] = useState(0);
  const [homeBannerWidth, setHomeBannerWidth] = useState(0);
  const homePromoScrollRef = React.useRef<ScrollView | null>(null);
  const { unreadCount: unreadNotifCount, refreshUnreadCount } = useNotifications();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [featuredTherapists, setFeaturedTherapists] = useState<Therapist[]>([]);
  const [therapistImageFallbackStep, setTherapistImageFallbackStep] = useState<Record<string, number>>({});
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [loadingTherapists, setLoadingTherapists] = useState(false);
  const [balance, setBalance] = useState(0);
  const isVipMember = !!user?.isVipMember;
  const [selectedCity, setSelectedCity] = useState(
    () => user?.selectedCity || user?.workingCity || '',
  );
  const [customerLocation, setCustomerLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const strings = useMemo(() => {
    return translations[language] ?? translations.vi;
  }, [language]);
  const openMassageHomeWithService = useCallback((service?: string | null) => {
    setSelectedHomeService(service ?? null);
    setShowMassageHome(true);
  }, []);

  const withLiveDistance = useCallback(
    (list: Therapist[]) => applyCustomerDistanceToTherapists(list, customerLocation),
    [customerLocation],
  );
  const contentColumnMax = tabletLayout.isTablet ? 1040 : screenWidth;
  const contentMaxWidth = contentColumnMax;
  const contentHorizontalPadding = tabletLayout.horizontalPadding;
  const contentHorizontalInset = tabletLayout.isTablet ? contentHorizontalPadding : 12;
  const contentAreaWidth = tabletLayout.isTablet
    ? Math.min(screenWidth, contentColumnMax) - contentHorizontalInset * 2
    : Math.min(screenWidth - contentHorizontalPadding * 2, contentColumnMax);
  const gridGap = tabletLayout.isTablet ? 16 : 12;
  const gridHeight = tabletLayout.isTablet ? 288 : 210;
  const rightColumnWidth = tabletLayout.isTablet
    ? Math.max(180, contentAreaWidth * 0.38)
    : Math.max(140, (screenWidth - 44) * 0.42);
  const featuredColumns = tabletLayout.isTablet ? (contentAreaWidth >= 840 ? 5 : 4) : 1;
  const featuredGridCardWidth =
    tabletLayout.isTablet && featuredColumns > 0
      ? Math.max(
          152,
          Math.floor((contentAreaWidth - gridGap * (featuredColumns - 1)) / featuredColumns),
        )
      : 140;
  const phoneFeaturedCardWidth = 156;
  const cardImageResizeMode = tabletLayout.isTablet ? 'contain' : 'cover';
  const featuredAvatarSize = tabletLayout.isTablet ? 76 : 68;
  // Keep just enough breathing room above the tab bar; avoid large blank tail space.
  const bottomContentSpacer = tabletLayout.isTablet ? 20 : Math.max(12, insets.bottom + 8);

  /** Promo strip: wider aspect + max height so it does not dominate the scroll area */
  const homePromoBannerHeight = Math.round(
    Math.min(screenWidth / 2.35, windowHeight * 0.18, tabletLayout.isTablet ? 220 : 200),
  );
  const resolvedHomeBannerWidth = homeBannerWidth > 0 ? homeBannerWidth : Math.round(screenWidth * 0.96);
  const homeSlides = useMemo(
    () => ([
      require('@/assets/images/home-slide-1.jpg'),
      require('@/assets/images/home-slide-2.jpg'),
      require('@/assets/images/home-slide-3.jpg'),
    ]),
    [],
  );

  useEffect(() => {
    if (homeSlides.length <= 1 || resolvedHomeBannerWidth <= 0) return;

    const timer = setInterval(() => {
      setHomeSlideIndex((prev) => {
        const next = (prev + 1) % homeSlides.length;
        homePromoScrollRef.current?.scrollTo({
          x: next * resolvedHomeBannerWidth,
          animated: true,
        });
        return next;
      });
    }, HOME_PROMO_AUTOPLAY_MS);

    return () => clearInterval(timer);
  }, [homeSlides.length, resolvedHomeBannerWidth]);

  useEffect(() => {
    const fromProfile = user?.selectedCity || user?.workingCity;
    if (fromProfile) {
      setSelectedCity(fromProfile);
    }
  }, [user?.selectedCity, user?.workingCity]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const reopen = await consumeReopenMassageAfterRegion();
        if (!cancelled && reopen) {
          setShowMassageHome(true);
        }
        const fromProfile = user?.selectedCity || user?.workingCity;
        if (fromProfile) {
          return;
        }
        const stored = await loadPersistedHomeSelectedCity();
        if (!cancelled && stored) {
          setSelectedCity(stored);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.selectedCity, user?.workingCity]),
  );

  const didInitialProvinceGps = React.useRef(false);
  useEffect(() => {
    if (authLoading || didInitialProvinceGps.current) {
      return;
    }
    const fromProfile = user?.selectedCity || user?.workingCity;
    if (fromProfile) {
      didInitialProvinceGps.current = true;
      setAutoLocateDone(true);
      return;
    }
    didInitialProvinceGps.current = true;
    const snapshotUser = user;
    let cancelled = false;
    void (async () => {
      try {
        const stored = await loadPersistedHomeSelectedCity();
        if (cancelled) {
          return;
        }
        if (stored) {
          setSelectedCity(stored);
          return;
        }
        const coords = await refreshCustomerLocation({ askPermissionIfNeeded: false });
        const inferred = coords ? await inferVietnamProvinceFromCoordinates(coords) : null;
        if (cancelled) {
          return;
        }
        if (inferred) {
          setSelectedCity(inferred);
          await persistHomeSelectedCity(inferred);
          if (snapshotUser && canUseAppFeatures(snapshotUser)) {
            await setUser({ ...snapshotUser, selectedCity: inferred });
          }
        }
      } finally {
        if (!cancelled) {
          setAutoLocateDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, setUser]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Lấy GPS thật để hiện distance chính xác. Nếu permission chưa cấp,
      // AppLocationBootstrap đã chặn UI — chỗ này dùng `true` để re-prompt
      // ngay khi permission còn `undetermined`.
      const live = await refreshCustomerLocation({ askPermissionIfNeeded: true });
      const fallback = live ?? (await getStoredCustomerLocation());
      if (!cancelled && fallback) {
        setCustomerLocation(fallback);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!customerLocation) return;
    setTherapists((prev) => withLiveDistance(prev));
    setFeaturedTherapists((prev) => withLiveDistance(prev));
  }, [customerLocation, withLiveDistance]);

  const resolveTherapistCity = (item: Therapist) => {
    if (item.workingCity?.trim()) {
      return item.workingCity.trim();
    }
    const hash = item.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return VIETNAM_PROVINCES[hash % VIETNAM_PROVINCES.length];
  };

  // Load wallet balance
  const loadWalletBalance = useCallback(() => {
    if (!user?.authUid) return;
    getOrCreateWallet(user.authUid)
      .then((w) => setBalance(w.balance))
      .catch(() => {});
  }, [user?.authUid]);

  useEffect(() => { loadWalletBalance(); }, [loadWalletBalance]);



  // Load featured therapists sau khi idle — tránh chồng tác vụ ngay lúc chuyển cảnh (thay InteractionManager deprecated)
  useEffect(() => {
    let cancelled = false;
    const task = scheduleNonBlockingWork(() => {
      void (async () => {
        try {
          const data = await getTherapists({ bypassCache: true });
          if (cancelled) return;
          const sorted = [...withLiveDistance(data)].sort((a, b) => {
            if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
            return b.rating - a.rating;
          });
          setFeaturedTherapists(sorted);
        } catch {
          if (!cancelled) {
            setFeaturedTherapists([]);
          }
        } finally {
          if (!cancelled) setLoadingFeatured(false);
        }
      })();
    }, 600);
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [selectedCity, withLiveDistance]);

  const handleSelectCity = async (city: string) => {
    setSelectedCity(city);
    await persistHomeSelectedCity(city);
    if (user && canUseAppFeatures(user)) {
      await setUser({ ...user, selectedCity: city });
    }
  };

  const openSelectRegion = useCallback(() => {
    router.push({
      pathname: '/select-region',
      params: { current: selectedCity || '' },
    });
  }, [router, selectedCity]);

  const handleOpenTherapists = async () => {
    if (authLoading) return;
    if (!canUseAppFeatures(user)) {
      promptSignIn();
      return;
    }
    setShowTherapistModal(true);

    if (therapists.length > 0 || loadingTherapists) {
      return;
    }

    try {
      setLoadingTherapists(true);
      const data = await getTherapists({ bypassCache: true });
      const live = withLiveDistance(data);
      live.sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        const da = Number.isFinite(a.distanceFromCenter) ? a.distanceFromCenter : Number.POSITIVE_INFINITY;
        const db = Number.isFinite(b.distanceFromCenter) ? b.distanceFromCenter : Number.POSITIVE_INFINITY;
        if (da === db) return 0;
        return da < db ? -1 : 1;
      });
      setTherapists(live);
    } catch (error) {
      console.error('Error loading therapists from home:', error);
      setTherapists([]);
    } finally {
      setLoadingTherapists(false);
    }
  };

  const renderTherapistCard = ({ item }: { item: Therapist }) => {
    const candidates = therapistDisplayImageCandidates(item);
    const attempt = therapistImageFallbackStep[item.id] ?? 0;
    const displayUri = candidates[attempt] ?? '';
    const hasImageAvatar = attempt < candidates.length && !!displayUri;
    const distanceText = formatDistanceLabel(item.distanceFromCenter, strings.distanceUpdating);

    return (
      <TouchableOpacity style={styles.therapistCard} activeOpacity={0.85}>
        <View style={styles.therapistAvatar}>
          {hasImageAvatar ? (
            <Image
              source={{ uri: displayUri }}
              style={styles.therapistAvatarImage}
              onError={() =>
                setTherapistImageFallbackStep((prev) => ({
                  ...prev,
                  [item.id]: (prev[item.id] ?? 0) + 1,
                }))
              }
            />
          ) : (
            <Feather name="user" size={24} color={AppColors.primaryDark} />
          )}
        </View>
        <View style={styles.therapistInfo}>
          <Text style={styles.therapistName}>{item.name}</Text>
          <View style={styles.therapistMetaRow}>
            <Feather name="star" size={11} color="#F59E0B" />
            <Text style={styles.therapistMeta}>{item.rating.toFixed(1)} • {item.reviewCount} {strings.reviews}</Text>
          </View>
          <View style={styles.therapistMetaRow}>
            <Feather name="map-pin" size={11} color={COLORS.lightText} />
            <Text style={styles.therapistMeta}>{distanceText} • {item.experience} {strings.yearsExp}</Text>
          </View>
          {isVipMember ? (
            <View style={styles.therapistMetaRow}>
              <Feather name="calendar" size={11} color={COLORS.lightText} />
              <Text style={styles.therapistMeta}>{strings.age}: {estimateAge(item)}</Text>
            </View>
          ) : null}
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

  const cityFeaturedTherapists = useMemo(() => {
    if (!selectedCity) return [];
    const list = featuredTherapists.filter((item) => resolveTherapistCity(item) === selectedCity);
    return [...list].sort((a, b) => {
      if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
      return b.rating - a.rating;
    });
  }, [featuredTherapists, selectedCity]);

  const visibleFeaturedTherapists = useMemo(() => {
    const capTablet = isVipMember ? 12 : 8;
    const capPhone = isVipMember ? 10 : 5;
    const cap = tabletLayout.isTablet ? capTablet : capPhone;
    return cityFeaturedTherapists.slice(0, cap);
  }, [cityFeaturedTherapists, isVipMember, tabletLayout.isTablet]);

  const visibleTherapists = useMemo(
    () => {
      if (!selectedCity) {
        return [];
      }
      const byCity = therapists
        .filter((item) => resolveTherapistCity(item) === selectedCity)
        .sort((a, b) => {
          if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
          const da = Number.isFinite(a.distanceFromCenter) ? a.distanceFromCenter : Number.POSITIVE_INFINITY;
          const db = Number.isFinite(b.distanceFromCenter) ? b.distanceFromCenter : Number.POSITIVE_INFINITY;
          if (da === db) return 0;
          return da < db ? -1 : 1;
        });
      return isVipMember ? byCity : byCity.slice(0, 6);
    },
    [therapists, isVipMember, selectedCity],
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} translucent />

      {/* Khối đỏ bọc đầu (full-bleed), bo góc đáy — đồng bộ app dịch vụ */}
      <View style={[styles.heroBlue, { paddingTop: Math.max(insets.top, 10) + 8 }]}>
          <View
            style={[
              styles.pageMax,
              {
                maxWidth: contentMaxWidth,
                paddingHorizontal: contentHorizontalInset,
              },
            ]}
          >
        <View style={styles.headerBar}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.avatarPlaceholder} onPress={() => router.push('/(tabs)/account')}>
              <Feather name="user" size={18} color="#FFFFFF" />
            </TouchableOpacity>
            <View>
              <TouchableOpacity style={styles.locationRow} onPress={openSelectRegion}>
                <Text style={styles.locationText} numberOfLines={1}>
                  {selectedCity ||
                    (autoLocateDone ? strings.pickRegion : strings.detectingRegion)}
                </Text>
                <Text style={styles.locationArrow}>▾</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => requireAuthTo(() => setShowNotifications(true))}>
              <Feather name="bell" size={17} color="#FFFFFF" />
              {unreadNotifCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => requireAuthTo(() => setShowChat(true))}>
              <Feather name="message-circle" size={17} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
        </View>
      </View>

      {canUseAppFeatures(user) ? (
        <View style={[styles.pageMax, { maxWidth: contentMaxWidth }]}>
        <View
          style={[
            styles.balanceOuter,
            {
              marginHorizontal: contentHorizontalInset,
            },
          ]}
        >
          <View style={[styles.balanceSection, tabletLayout.isTablet && styles.balanceSectionTablet]}>
            <View style={styles.balanceLeft}>
              <TouchableOpacity style={styles.balanceLabelRow} onPress={() => setShowWallet(true)}>
                <Text style={[styles.balanceLabel, tabletLayout.isTablet && styles.balanceLabelTablet]}>
                  {strings.balanceLabel}
                </Text>
                <Text style={styles.balanceChevron}>›</Text>
              </TouchableOpacity>
              <Text style={[styles.balanceAmount, tabletLayout.isTablet && styles.balanceAmountTablet]}>
                {balance.toLocaleString()} {strings.currency}
              </Text>
            </View>
            <TouchableOpacity style={[styles.topUpButton, tabletLayout.isTablet && styles.topUpButtonTablet]} onPress={() => setShowTopUp(true)}>
              <Text style={[styles.topUpText, tabletLayout.isTablet && styles.topUpTextTablet]}>{strings.topUp}</Text>
            </TouchableOpacity>
          </View>
        </View>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          tabletLayout.isTablet && styles.scrollContentTablet,
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
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
            <TouchableOpacity style={styles.connectedMsgBtn} onPress={() => requireAuthTo(() => setShowChat(true))}>
              <Feather name="message-circle" size={17} color={AppColors.primaryDark} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.connectedDetailBtn} onPress={() => requireAuthTo(() => setShowChat(true))}>
              <Feather name="external-link" size={15} color="#666" />
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Actions Grid */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, tabletLayout.isTablet && styles.sectionTitleTablet]}>
            {strings.services}
          </Text>
        </View>
        <View style={[styles.gridContainer, tabletLayout.isTablet && { height: gridHeight, gap: gridGap }]}>
          {/* Large card — Massage tại nhà */}
          <TouchableOpacity style={styles.gridCardLarge} activeOpacity={0.85} onPress={() => requireAuthTo(() => openMassageHomeWithService(null))}>
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
              onPress={() => requireAuthTo(() => setShowMassageLocation(true))}
            >
              <Image
                source={require('@/assets/images/promo-location-banner.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode={cardImageResizeMode}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.gridCardSmall} activeOpacity={0.85} onPress={() => requireAuthTo(() => setShowPromotions(true))}>
              <View style={[styles.gridCardBg, { backgroundColor: COLORS.primary }]}>
                <View style={[styles.gridDeco, { width: 80, height: 80, bottom: -20, left: -10 }]} />
                <View style={styles.gridCardContent}>
                  <View style={styles.gridIconBadge}>
                    <Feather name="gift" size={18} color="#FFFFFF" />
                  </View>
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
            <TouchableOpacity
              key={tag.label}
              style={[styles.tagChip, tabletLayout.isTablet && styles.tagChipTablet]}
              activeOpacity={1}
              onPress={() => requireAuthTo(() => openMassageHomeWithService(tag.label))}
            >
              <Feather
                name={tag.iconName}
                size={tabletLayout.isTablet ? 16 : 14}
                color={AppColors.primaryDark}
              />
              <Text style={[styles.tagLabel, tabletLayout.isTablet && styles.tagLabelTablet]}>{tag.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View
          style={[styles.homePromoBannerWrap, tabletLayout.isTablet && styles.homePromoBannerWrapTablet]}
          onLayout={(event) => {
            const width = Math.round(event.nativeEvent.layout.width);
            if (width > 0 && width !== homeBannerWidth) {
              setHomeBannerWidth(width);
            }
          }}
        >
          <ScrollView
            ref={homePromoScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            onMomentumScrollEnd={(event) => {
              const pageWidth = event.nativeEvent.layoutMeasurement.width || 1;
              const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
              setHomeSlideIndex(Math.max(0, Math.min(next, homeSlides.length - 1)));
            }}
          >
            {homeSlides.map((src, idx) => (
              <TouchableOpacity
                key={`home-slide-${idx}`}
                style={[styles.homePromoSlide, { width: resolvedHomeBannerWidth }]}
                activeOpacity={0.92}
                onPress={() => requireAuthTo(() => openMassageHomeWithService(null))}
              >
                <Image
                  source={src}
                  style={[styles.homePromoBannerImage, { width: resolvedHomeBannerWidth, height: homePromoBannerHeight }]}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.homePromoDots}>
            {homeSlides.map((_, idx) => (
              <View
                key={`home-dot-${idx}`}
                style={[styles.homePromoDot, idx === homeSlideIndex && styles.homePromoDotActive]}
              />
            ))}
          </View>
        </View>

        {/* Featured Therapists */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, tabletLayout.isTablet && styles.sectionTitleTablet]}>
            {strings.featuredTherapists}
          </Text>
          <TouchableOpacity onPress={handleOpenTherapists}>
            <Text style={[styles.seeAllLink, tabletLayout.isTablet && styles.seeAllLinkTablet]}>
              {strings.seeAll} ›
            </Text>
          </TouchableOpacity>
        </View>

        {loadingFeatured ? (
          <View style={styles.featuredLoading}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        ) : visibleFeaturedTherapists.length === 0 ? (
          <View style={styles.featuredEmpty}>
            <Text style={styles.therapistEmptyText}>
              {!selectedCity ? strings.selectRegionHint : strings.noTherapistsInCity}
            </Text>
          </View>
        ) : tabletLayout.isTablet ? (
          <View style={[styles.featuredGrid, { gap: gridGap }]}>
            {visibleFeaturedTherapists.map((t) => {
              const candidates = therapistDisplayImageCandidates(t);
              const attempt = therapistImageFallbackStep[t.id] ?? 0;
              const displayUri = candidates[attempt] ?? '';
              const hasImageAvatar = attempt < candidates.length && !!displayUri;
              const distText = formatDistanceLabel(t.distanceFromCenter, strings.distanceUpdating);
              const avRadius = featuredAvatarSize / 2;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.featuredCard, styles.featuredCardTablet, { width: featuredGridCardWidth }]}
                  activeOpacity={0.85}
                  onPress={() => requireAuthTo(() => openMassageHomeWithService(t.specialties?.[0] ?? null))}
                >
                  <View style={styles.featuredAvatarWrap}>
                    <View
                      style={[
                        styles.featuredAvatar,
                        { width: featuredAvatarSize, height: featuredAvatarSize, borderRadius: avRadius },
                      ]}
                    >
                      {hasImageAvatar ? (
                        <Image
                          source={{ uri: displayUri }}
                          style={[
                            styles.featuredAvatarImage,
                            { borderRadius: avRadius },
                          ]}
                          onError={() =>
                            setTherapistImageFallbackStep((prev) => ({
                              ...prev,
                              [t.id]: (prev[t.id] ?? 0) + 1,
                            }))
                          }
                        />
                      ) : (
                        <Feather
                          name="user"
                          size={tabletLayout.isTablet ? 34 : 28}
                          color={AppColors.primaryDark}
                        />
                      )}
                    </View>
                    {t.rating >= 4.8 && (
                      <View style={styles.featuredBadge}>
                        <Feather name="award" size={11} color="#D97706" />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.featuredName, styles.featuredNameTablet]} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <View style={styles.featuredRatingRow}>
                    <Feather name="star" size={12} color="#F59E0B" />
                    <Text style={[styles.featuredRating, styles.featuredRatingTablet]}>{t.rating.toFixed(1)}</Text>
                    <Text style={[styles.featuredReviews, styles.featuredReviewsTablet]}>({t.reviewCount})</Text>
                  </View>
                  <View style={styles.featuredDistanceRow}>
                    <Feather name="map-pin" size={11} color={COLORS.lightText} />
                    <Text style={[styles.featuredDistance, styles.featuredDistanceTablet]}>{distText}</Text>
                  </View>
                  <View style={[styles.featuredSpecialty, styles.featuredSpecialtyTablet]}>
                    <Text style={[styles.featuredSpecialtyText, styles.featuredSpecialtyTextTablet]} numberOfLines={1}>
                      {t.specialties?.[0] ?? 'Massage'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.featuredScrollContent, { gap: gridGap }]}
          >
            {visibleFeaturedTherapists.map((t) => {
              const candidates = therapistDisplayImageCandidates(t);
              const attempt = therapistImageFallbackStep[t.id] ?? 0;
              const displayUri = candidates[attempt] ?? '';
              const hasImageAvatar = attempt < candidates.length && !!displayUri;
              const distText = formatDistanceLabel(t.distanceFromCenter, strings.distanceUpdating);
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.featuredCard, { width: phoneFeaturedCardWidth }]}
                  activeOpacity={0.85}
                  onPress={() => requireAuthTo(() => openMassageHomeWithService(t.specialties?.[0] ?? null))}
                >
                  <View style={styles.featuredAvatarWrap}>
                    <View style={styles.featuredAvatar}>
                      {hasImageAvatar ? (
                        <Image
                          source={{ uri: displayUri }}
                          style={styles.featuredAvatarImage}
                          onError={() =>
                            setTherapistImageFallbackStep((prev) => ({
                              ...prev,
                              [t.id]: (prev[t.id] ?? 0) + 1,
                            }))
                          }
                        />
                      ) : (
                        <Feather name="user" size={28} color={AppColors.primaryDark} />
                      )}
                    </View>
                    {t.rating >= 4.8 && (
                      <View style={styles.featuredBadge}>
                        <Feather name="award" size={11} color="#D97706" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.featuredName} numberOfLines={1}>{t.name}</Text>
                  <View style={styles.featuredRatingRow}>
                    <Feather name="star" size={12} color="#F59E0B" />
                    <Text style={styles.featuredRating}>{t.rating.toFixed(1)}</Text>
                    <Text style={styles.featuredReviews}>({t.reviewCount})</Text>
                  </View>
                  <View style={styles.featuredDistanceRow}>
                    <Feather name="map-pin" size={11} color={COLORS.lightText} />
                    <Text style={styles.featuredDistance}>{distText}</Text>
                  </View>
                  <View style={styles.featuredSpecialty}>
                    <Text style={styles.featuredSpecialtyText} numberOfLines={1}>
                      {t.specialties?.[0] ?? 'Massage'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Bottom spacer: avoid featured cards being covered by tab bar */}
        <View style={{ height: bottomContentSpacer }} />
        </View>
      </ScrollView>


      <Modal visible={showTherapistModal} transparent animationType="slide" onRequestClose={() => setShowTherapistModal(false)}>
        <ModalSafeAreaProvider>
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
                <Feather name="users" size={30} color={AppColors.primaryDark} />
                <Text style={styles.therapistEmptyText}>
                  {!selectedCity ? strings.selectRegionHint : strings.noTherapistsInCity}
                </Text>
              </View>
            ) : (
              <FlatList
                data={visibleTherapists}
                keyExtractor={(item) => item.id}
                renderItem={renderTherapistCard}
                contentContainerStyle={styles.therapistListContent}
                showsVerticalScrollIndicator={false}
                initialNumToRender={8}
                maxToRenderPerBatch={10}
                windowSize={7}
                removeClippedSubviews={Platform.OS === 'android'}
              />
            )}
          </View>
        </View>
        </ModalSafeAreaProvider>
      </Modal>

      {/* Massage Home full-screen overlay */}
      <Modal
        visible={showMassageHome}
        animationType="slide"
        presentationStyle="fullScreen"
        hardwareAccelerated
        onRequestClose={() => setShowMassageHome(false)}
      >
        <View style={styles.modalContentBg}>
          <ModalSafeAreaProvider>
            <MassageHomeScreen
              reopenMassageAfterRegion
              onClose={() => setShowMassageHome(false)}
              selectedCity={selectedCity}
              onChangeCity={handleSelectCity}
              initialService={selectedHomeService ?? undefined}
            />
          </ModalSafeAreaProvider>
        </View>
      </Modal>

      {/* Notification screen */}
      <Modal visible={showNotifications} animationType="slide" onRequestClose={() => setShowNotifications(false)}>
        <ModalSafeAreaProvider>
          <NotificationScreen onClose={() => { setShowNotifications(false); refreshUnreadCount(); }} />
        </ModalSafeAreaProvider>
      </Modal>

      {/* Chat screen */}
      <Modal visible={showChat} animationType="slide" onRequestClose={() => setShowChat(false)}>
        <ModalSafeAreaProvider>
          <ChatScreen onClose={() => setShowChat(false)} />
        </ModalSafeAreaProvider>
      </Modal>

      {/* Massage Location screen */}
      <Modal visible={showMassageLocation} animationType="slide" onRequestClose={() => setShowMassageLocation(false)}>
        <ModalSafeAreaProvider>
          <MassageLocationScreen onClose={() => setShowMassageLocation(false)} />
        </ModalSafeAreaProvider>
      </Modal>

      {/* Promotions screen */}
      <Modal visible={showPromotions} animationType="slide" onRequestClose={() => setShowPromotions(false)}>
        <ModalSafeAreaProvider>
          <PromotionsScreen onClose={() => setShowPromotions(false)} />
        </ModalSafeAreaProvider>
      </Modal>

      {/* Top-up screen */}
      <Modal visible={showTopUp} animationType="slide" onRequestClose={() => setShowTopUp(false)}>
        <ModalSafeAreaProvider>
          <TherapistTopUpScreen onClose={() => { setShowTopUp(false); loadWalletBalance(); }} />
        </ModalSafeAreaProvider>
      </Modal>

      {/* Wallet screen */}
      <Modal visible={showWallet} animationType="slide" onRequestClose={() => setShowWallet(false)}>
        <ModalSafeAreaProvider>
          <WalletScreen onClose={() => { setShowWallet(false); loadWalletBalance(); }} />
        </ModalSafeAreaProvider>
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
  modalContentBg: {
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
  balanceSectionTablet: {
    paddingHorizontal: 22,
    paddingVertical: 20,
    borderRadius: 22,
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
  balanceLabelTablet: {
    fontSize: 15,
  },
  balanceChevron: {
    fontSize: 16,
    color: COLORS.lightText,
    fontWeight: '600',
  },
  balanceAmount: {
    fontSize: 22,
    fontWeight: '400',
    color: COLORS.text,
    letterSpacing: 0,
  },
  balanceAmountTablet: {
    fontSize: 26,
  },
  topUpButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  topUpButtonTablet: {
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 22,
  },
  topUpText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  topUpTextTablet: {
    fontSize: 16,
  },

  // --- Scroll Content ---
  scrollContent: {
    paddingTop: 10,
    paddingBottom: 12,
  },
  scrollContentTablet: {
    paddingBottom: 36,
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
  sectionTitleTablet: {
    fontSize: 22,
    marginBottom: 2,
  },
  seeAllLink: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  seeAllLinkTablet: {
    fontSize: 16,
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
  gridIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
    marginBottom: 16,
  },
  tagsContent: {
    gap: 10,
  },
  homePromoBannerWrap: {
    alignSelf: 'center',
    width: '96%',
    maxWidth: 520,
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#ECE8E3',
  },
  homePromoBannerWrapTablet: {
    width: '100%',
    maxWidth: 640,
  },
  homePromoBannerImage: {
    width: '100%',
  },
  homePromoSlide: {
    width: '100%',
  },
  homePromoDots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  homePromoDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  homePromoDotActive: {
    width: 18,
    backgroundColor: '#FFFFFF',
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
  tagChipTablet: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
  },
  tagLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  tagLabelTablet: {
    fontSize: 15,
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
  featuredGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  featuredCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  featuredCardTablet: {
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 20,
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
  featuredName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  featuredNameTablet: {
    fontSize: 16,
    fontWeight: '800',
  },
  featuredRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 3,
  },
  featuredRating: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F5A623',
  },
  featuredRatingTablet: {
    fontSize: 15,
  },
  featuredReviews: {
    fontSize: 11,
    color: COLORS.lightText,
  },
  featuredReviewsTablet: {
    fontSize: 12,
  },
  featuredDistance: {
    fontSize: 11,
    color: COLORS.lightText,
  },
  featuredDistanceTablet: {
    fontSize: 13,
    marginBottom: 10,
  },
  featuredDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 8,
  },
  featuredSpecialty: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  featuredSpecialtyTablet: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    maxWidth: '100%',
  },
  featuredSpecialtyText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.primary,
  },
  featuredSpecialtyTextTablet: {
    fontSize: 12,
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
  },
  therapistMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
