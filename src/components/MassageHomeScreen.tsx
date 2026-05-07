import { ModalSafeAreaProvider } from '@/components/ModalSafeAreaProvider';
import { SERVICE_TYPES, VIETNAM_PROVINCES } from '@/constants/bookingFilters';
import { AppColors } from '@/constants/appColors';
import {
  FILTER_THERAPIST_TAGS,
  THERAPIST_TAG_QUALITY,
  THERAPIST_TAG_UPDATED,
  THERAPIST_TAG_VISUAL,
  getTherapistDisplayTag,
  isQualityTherapist,
  isRecentlyJoinedTherapist,
} from '@/constants/therapistTags';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReviewMode } from '@/contexts/ReviewModeContext';
import { useUser } from '@/contexts/UserContext';
import { useTabletLayout } from '@/hooks/use-tablet-layout';
import {
  applyCustomerDistanceToTherapists,
  getStoredCustomerLocation,
  refreshCustomerLocation,
  resolveCustomerLocationForDistance,
} from '@/lib/location';
import {
  persistHomeSelectedCity,
  setReopenMassageAfterRegion,
  loadPersistedHomeSelectedCity,
} from '@/lib/homeSelectedRegionStorage';
import { inferVietnamProvinceFromCoordinates } from '@/lib/vietnamProvinceFromGps';
import { canUseAppFeatures } from '@/lib/session';
import { getTherapists, therapistDisplayImageCandidates } from '@/lib/supabaseService';
import type { Therapist } from '@/lib/types';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import TherapistDetailScreen from './TherapistDetailScreen';

const TAGS = [...FILTER_THERAPIST_TAGS];

const COLORS = {
  green: AppColors.primaryDark,
  greenLight: AppColors.primarySoft,
  bg: AppColors.bg,
  white: '#fff',
  text: AppColors.text,
  subText: AppColors.textMuted,
  border: '#E0E0E0',
  gold: '#F5A623',
  goldBg: '#FFF8E1',
};

function formatDistanceLabel(distanceKm: number, updatingText: string): string {
  // Infinity = không có cả live GPS lẫn tâm tỉnh hợp lệ → fallback text.
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return updatingText;
  }
  if (distanceKm < 0.05) {
    // Khách & KTV gần như cùng tọa độ (vd. cùng tâm tỉnh, fallback) → hiện "<50m" thay vì "0m".
    return '< 50 m';
  }
  if (distanceKm < 1) {
    return `${Math.max(1, Math.round(distanceKm * 1000))} m`;
  }
  return `${Math.round(distanceKm * 10) / 10} km`;
}

export default function MassageHomeScreen({
  onClose,
  selectedCity: selectedCityProp,
  onChangeCity,
  initialService,
  /** Chỉ bật khi `MassageHome` nằm trong modal trên Home: đóng modal rồi mở lại sau khi chọn vùng. */
  reopenMassageAfterRegion = false,
}: {
  onClose?: () => void;
  selectedCity?: string;
  onChangeCity?: (city: string) => void | Promise<void>;
  initialService?: string;
  reopenMassageAfterRegion?: boolean;
} = {}) {
  const router = useRouter();
  const { user, setUser } = useUser();
  const { hideVipSubscription } = useReviewMode();
  const { language } = useLanguage();
  const tabletLayout = useTabletLayout();
  const insets = useSafeAreaInsets();
  const baseInsets = initialWindowMetrics?.insets;
  const safeTop = Math.max(insets.top, baseInsets?.top ?? 0);
  const safeBottom = Math.max(insets.bottom, baseInsets?.bottom ?? 0);
  const safeLeft = Math.max(insets.left, baseInsets?.left ?? 0);
  const safeRight = Math.max(insets.right, baseInsets?.right ?? 0);
  const isVipMember = !!user?.isVipMember;
  const isEn = language === 'en';

  const [baseTherapists, setBaseTherapists] = useState<Therapist[]>([]);
  const [customerCoords, setCustomerCoords] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'nearby' | 'popular' | null>('nearby');

  // Filter modal state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterGender, setFilterGender] = useState<'all' | 'male' | 'female'>('all');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'rest'>('all');

  // Applied filters
  const [appliedGender, setAppliedGender] = useState<'all' | 'male' | 'female'>('all');
  const [appliedTags, setAppliedTags] = useState<string[]>([]);
  const [appliedStatus, setAppliedStatus] = useState<'all' | 'available' | 'rest'>('all');

  // Service type modal
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [selectedService, setSelectedService] = useState('Tất cả');
  const [selectedCity, setSelectedCity] = useState(
    () => selectedCityProp || user?.selectedCity || '',
  );
  const [autoLocateDone, setAutoLocateDone] = useState(false);

  // Therapist detail
  const [selectedTherapist, setSelectedTherapist] = useState<Therapist | null>(null);
  /** Bước fallback khi URI ảnh (avatar/album) lỗi tải — thử candidate tiếp theo. */
  const [therapistImageFallbackStep, setTherapistImageFallbackStep] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const loadTherapists = async () => {
      try {
        const data = await getTherapists({ bypassCache: true });
        // Bắt buộc xin quyền (`askPermissionIfNeeded: true`) để mọi user có distance chính xác.
        // Nếu user denied, vẫn cho dùng app; chỗ này re-prompt khi còn `undetermined`.
        const live = await refreshCustomerLocation({ askPermissionIfNeeded: true });
        const fallback = live ?? (await getStoredCustomerLocation());
        if (cancelled) return;
        setBaseTherapists(data);
        setCustomerCoords(fallback);
      } catch (error) {
        console.error('Error loading therapists:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadTherapists();
    return () => {
      cancelled = true;
    };
  }, []);

  const distanceAnchor = React.useMemo(
    () => resolveCustomerLocationForDistance(customerCoords, selectedCity),
    [customerCoords, selectedCity],
  );

  const therapists = React.useMemo(
    () => applyCustomerDistanceToTherapists(baseTherapists, distanceAnchor),
    [baseTherapists, distanceAnchor],
  );

  useEffect(() => {
    if (selectedCityProp) {
      setSelectedCity(selectedCityProp);
      setAutoLocateDone(true);
    }
  }, [selectedCityProp]);

  const didMassageHomeGps = React.useRef(false);
  useEffect(() => {
    if (selectedCityProp || user?.selectedCity) {
      setAutoLocateDone(true);
      return;
    }
    if (didMassageHomeGps.current) {
      setAutoLocateDone(true);
      return;
    }
    didMassageHomeGps.current = true;
    const snapshotUser = user;
    let cancelled = false;

    void (async () => {
      try {
        const coords = await refreshCustomerLocation({ askPermissionIfNeeded: false });
        const inferred = coords ? await inferVietnamProvinceFromCoordinates(coords) : null;
        if (cancelled || !inferred) {
          return;
        }
        setSelectedCity(inferred);
        await persistHomeSelectedCity(inferred);
        if (snapshotUser && canUseAppFeatures(snapshotUser)) {
          await setUser({ ...snapshotUser, selectedCity: inferred });
        }
        if (onChangeCity) {
          await onChangeCity(inferred);
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
  }, [selectedCityProp, user?.selectedCity, user?.authUid, onChangeCity, setUser, user]);

  useFocusEffect(
    React.useCallback(() => {
      if (selectedCityProp || user?.selectedCity) {
        return;
      }
      let cancelled = false;
      void (async () => {
        const stored = await loadPersistedHomeSelectedCity();
        if (!cancelled && stored) {
          setSelectedCity(stored);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [selectedCityProp, user?.selectedCity]),
  );

  const openSelectRegion = useCallback(() => {
    void (async () => {
      if (reopenMassageAfterRegion && onClose) {
        await setReopenMassageAfterRegion();
      }
      router.push({
        pathname: '/select-region',
        params: { current: selectedCity || '' },
      });
      if (reopenMassageAfterRegion && onClose) {
        onClose();
      }
    })();
  }, [onClose, reopenMassageAfterRegion, router, selectedCity]);

  useEffect(() => {
    if (!initialService) {
      setSelectedService('Tất cả');
      return;
    }
    const matched = SERVICE_TYPES.find(
      (svc) => svc.toLowerCase() === initialService.toLowerCase(),
    );
    setSelectedService(matched ?? initialService);
  }, [initialService]);

  const resolveTherapistCity = useCallback(
    (item: Therapist) => {
      if (item.workingCity?.trim()) {
        return item.workingCity.trim();
      }
      const hash = item.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      return VIETNAM_PROVINCES[hash % VIETNAM_PROVINCES.length];
    },
    [],
  );

  const filteredTherapists = React.useMemo(() => {
    let list = [...therapists];

    if (selectedCity) {
      list = list.filter((t) => resolveTherapistCity(t) === selectedCity);
    } else {
      list = [];
    }

    // Gender filter
    if (appliedGender !== 'all') {
      list = list.filter((t) => t.gender === appliedGender);
    }

    // Tag filter — cùng rule với badge (therapistTags.ts)
    if (appliedTags.length > 0) {
      list = list.filter((t) => {
        return appliedTags.some((tag) => {
          if (tag === THERAPIST_TAG_QUALITY) return isQualityTherapist(t);
          if (tag === THERAPIST_TAG_UPDATED) return isRecentlyJoinedTherapist(t);
          return false;
        });
      });
    }

    // Status filter
    if (appliedStatus === 'available') {
      list = list.filter((t) => t.isAvailable);
    } else if (appliedStatus === 'rest') {
      list = list.filter((t) => !t.isAvailable);
    }

    // Service filter
    if (selectedService !== 'Tất cả') {
      list = list.filter((t) =>
        (t.specialties ?? []).some((s) => s.toLowerCase().includes(selectedService.toLowerCase())),
      );
    }

    // Search
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }

    // Sort — luôn ưu tiên KTV bật "sẵn sàng nhận lịch" (is_available) lên trước
    if (sortBy === 'nearby') {
      // An toàn với Infinity / NaN: KTV không có cả live GPS lẫn tâm tỉnh → đẩy xuống cuối.
      list.sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        const da = Number.isFinite(a.distanceFromCenter) ? a.distanceFromCenter : Number.POSITIVE_INFINITY;
        const db = Number.isFinite(b.distanceFromCenter) ? b.distanceFromCenter : Number.POSITIVE_INFINITY;
        if (da === db) return 0;
        return da < db ? -1 : 1;
      });
    } else if (sortBy === 'popular') {
      list.sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        return b.reviewCount - a.reviewCount;
      });
    } else {
      list.sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        return 0;
      });
    }

    if (!isVipMember) {
      return list.slice(0, 6);
    }
    return list;
  }, [
    therapists,
    selectedCity,
    appliedGender,
    appliedTags,
    appliedStatus,
    selectedService,
    searchText,
    sortBy,
    isVipMember,
    resolveTherapistCity,
  ]);

  const openFilterModal = () => {
    setFilterGender(appliedGender);
    setFilterTags([...appliedTags]);
    setFilterStatus(appliedStatus);
    setShowFilterModal(true);
  };

  const applyFilters = () => {
    setAppliedGender(filterGender);
    setAppliedTags([...filterTags]);
    setAppliedStatus(filterStatus);
    setShowFilterModal(false);
  };

  const resetFilters = () => {
    setFilterGender('all');
    setFilterTags([]);
    setFilterStatus('all');
  };

  const toggleTag = (tag: string) => {
    setFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const hasActiveFilters =
    appliedGender !== 'all' || appliedTags.length > 0 || appliedStatus !== 'all';

  const renderTherapist = ({ item }: { item: Therapist }) => {
    const tag = getTherapistDisplayTag(item);
    const tagVisual = tag ? THERAPIST_TAG_VISUAL[tag] : null;
    const distanceText = formatDistanceLabel(
      item.distanceFromCenter,
      isEn ? 'Updating' : 'Đang cập nhật',
    );

    const candidates = therapistDisplayImageCandidates(item);
    const attempt = therapistImageFallbackStep[item.id] ?? 0;
    const displayUri = candidates[attempt] ?? '';
    const hasImageAvatar = attempt < candidates.length && !!displayUri;
    const isWorking = item.isAvailable;

    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.cardTouchArea} onPress={() => setSelectedTherapist(item)} activeOpacity={0.7}>
          {/* Avatar + tag dưới ảnh (không đè mặt) */}
          <View style={styles.avatarColumn}>
            <View style={styles.avatarCircle}>
              {hasImageAvatar ? (
                <Image
                  source={{ uri: displayUri }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                  onError={() => {
                    setTherapistImageFallbackStep((prev) => ({
                      ...prev,
                      [item.id]: (prev[item.id] ?? 0) + 1,
                    }));
                  }}
                />
              ) : (
                <Text style={styles.avatarText}>
                  {item.gender === 'female' ? '👩' : '👨'}
                </Text>
              )}
            </View>
            {tag && tagVisual ? (
              <View style={styles.tagChipBelowOuter} pointerEvents="none">
                <View
                  style={[
                    styles.tagChipBelowPill,
                    {
                      backgroundColor: tagVisual.bg,
                      borderColor: tagVisual.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.tagChipBelowText, { color: tagVisual.text }]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.15}
                  >
                    {tag}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Info */}
          <View style={styles.cardInfo}>
            <View style={styles.cardRow}>
              <Text style={styles.therapistName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.earliestTime}>Sớm nhất 12:00</Text>
            </View>
            <View style={styles.ratingRow}>
              <Text style={styles.starIcon}>⭐</Text>
              <Text style={styles.ratingValue}>{item.rating.toFixed(1)}</Text>
              <Text style={styles.reviewCount}>({item.reviewCount} {isEn ? 'reviews' : 'đánh giá'})</Text>
            </View>
            {isVipMember ? (
              <Text style={styles.vipAgeText}>{isEn ? 'Age' : 'Tuổi'}: {estimateAge(item)}</Text>
            ) : null}
            <View style={styles.distanceRow}>
              <Text style={styles.distanceIcon}>📍</Text>
              <Text style={styles.distanceText}>{distanceText}</Text>
            </View>
            <Text style={[styles.statusText, isWorking ? styles.statusTextAvailable : styles.statusTextRest]}>
              {isWorking ? 'Sẵn sàng nhận lịch' : 'Nghỉ ngơi'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Book button */}
        <TouchableOpacity
          style={[styles.bookButton, !isWorking && styles.bookButtonDisabled]}
          onPress={() => setSelectedTherapist(item)}
        >
          <Text style={styles.bookButtonText}>{isWorking ? 'Đặt' : 'Nghỉ'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: safeTop,
          paddingBottom: safeBottom,
          paddingLeft: safeLeft,
          paddingRight: safeRight,
        },
      ]}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={tabletLayout.contentContainer}>

      <View style={styles.screenTop}>
      <View style={[styles.header, { paddingHorizontal: tabletLayout.horizontalPadding - 4 }]}>
        <TouchableOpacity
          onPress={() => onClose ? onClose() : router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          pressRetentionOffset={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.locationBtn} onPress={openSelectRegion}>
          <Text style={styles.locationText} numberOfLines={1}>
            {selectedCity ||
              (autoLocateDone
                ? isEn
                  ? 'Choose area'
                  : 'Chọn khu vực'
                : isEn
                  ? 'Detecting…'
                  : 'Đang xác định…')}
          </Text>
          <Text style={styles.locationArrow}>▾</Text>
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm..."
            placeholderTextColor="#999"
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
        </View>
        <TouchableOpacity style={styles.heartBtn}>
          <Text style={styles.heartIcon}>♡</Text>
        </TouchableOpacity>
      </View>

      {/* VIP Banner */}
      {!isVipMember && !hideVipSubscription ? (
        <View style={[styles.vipBanner, { marginHorizontal: tabletLayout.horizontalPadding - 4 }]}>
          <Text style={styles.vipCrown}>👑</Text>
          <Text style={styles.vipText}>{isEn ? 'Enjoy exclusive benefits' : 'Tận hưởng những quyền lợi đặc biệt'}</Text>
          <TouchableOpacity style={styles.upgradeBtn}>
            <Text style={styles.upgradeBtnText}>{isEn ? 'Upgrade →' : 'Nâng cấp →'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      </View>

      {/* Filter chips */}
      <View style={[styles.filterRow, { paddingHorizontal: tabletLayout.horizontalPadding - 4 }]}>
        {/* Filter icon chip */}
        <TouchableOpacity
          style={[styles.filterIconChip, hasActiveFilters && styles.filterChipActive]}
          onPress={openFilterModal}
        >
          <Text style={[styles.filterIconText, hasActiveFilters && styles.filterChipActiveText]}>⚙</Text>
        </TouchableOpacity>

        {/* Gần tôi / Đặt nhiều */}
        <TouchableOpacity
          style={[styles.filterChip, sortBy === 'nearby' && styles.filterChipActive]}
          onPress={() => setSortBy(sortBy === 'nearby' ? null : 'nearby')}
        >
          <Text style={[styles.filterChipText, sortBy === 'nearby' && styles.filterChipActiveText]}>
            Gần tôi
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, sortBy === 'popular' && styles.filterChipActive]}
          onPress={() => setSortBy(sortBy === 'popular' ? null : 'popular')}
        >
          <Text style={[styles.filterChipText, sortBy === 'popular' && styles.filterChipActiveText]}>
            Đặt nhiều
          </Text>
        </TouchableOpacity>

        {/* Service type chip */}
        <TouchableOpacity
          style={[styles.filterChip, selectedService !== 'Tất cả' && styles.filterChipActive]}
          onPress={() => setShowServiceModal(true)}
        >
          <Text style={[styles.filterChipText, selectedService !== 'Tất cả' && styles.filterChipActiveText]}>
            {selectedService === 'Tất cả' ? 'Loại dịch vụ ▾' : selectedService}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.green} />
            <Text style={styles.loadingText}>{isEn ? 'Loading...' : 'Đang tải...'}</Text>
        </View>
      ) : !selectedCity ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyEmoji}>📍</Text>
          <Text style={styles.emptyText}>
            {isEn
              ? 'Choose a province/city in the header to see therapists.'
              : 'Chọn tỉnh/thành phố ở thanh trên để xem kỹ thuật viên.'}
          </Text>
        </View>
      ) : filteredTherapists.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyEmoji}>💆</Text>
          <Text style={styles.emptyText}>{isEn ? 'No matching therapists found' : 'Không có kỹ thuật viên nào phù hợp'}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTherapists}
          keyExtractor={(item) => item.id}
          renderItem={renderTherapist}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingHorizontal: tabletLayout.isTablet
                ? tabletLayout.horizontalPadding - 4
                : Math.max(6, tabletLayout.horizontalPadding - 10),
            },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
      </View>

      {/* ===== Filter Modal ===== */}
      <Modal visible={showFilterModal} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilterModal(false)}>
          <Pressable style={[styles.modalSheet, tabletLayout.isTablet && styles.tabletModalSheet]} onPress={() => {}}>
            {/* Handle */}
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{isEn ? 'Filters' : 'Bộ lọc'}</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Giới tính */}
              <Text style={styles.sectionLabel}>{isEn ? 'Gender' : 'Giới tính'}</Text>
              <View style={styles.chipRow}>
                {(['all', 'female', 'male'] as const).map((g) => {
                  const label = g === 'all' ? (isEn ? 'All' : 'Tất cả') : g === 'female' ? (isEn ? 'Female' : 'Nữ') : (isEn ? 'Male' : 'Nam');
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[styles.radioChip, filterGender === g && styles.radioChipActive]}
                      onPress={() => setFilterGender(g)}
                    >
                      <Text style={[styles.radioChipText, filterGender === g && styles.radioChipActiveText]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Tag */}
              <Text style={styles.sectionLabel}>{isEn ? 'Tags' : 'Tag'}</Text>
              <View style={styles.chipRow}>
                {TAGS.map((tagOpt) => {
                  const selected = filterTags.includes(tagOpt);
                  const tv = THERAPIST_TAG_VISUAL[tagOpt];
                  return (
                    <TouchableOpacity
                      key={tagOpt}
                      style={[
                        styles.radioChip,
                        selected && tv
                          ? {
                              backgroundColor: tv.chipBg,
                              borderColor: tv.chipBorder,
                              borderWidth: 2,
                            }
                          : undefined,
                        selected && !tv && styles.radioChipActive,
                      ]}
                      onPress={() => toggleTag(tagOpt)}
                    >
                      <Text
                        style={[
                          styles.radioChipText,
                          selected && styles.radioChipActiveText,
                          selected && tv && styles.tagFilterChipTextOn,
                        ]}
                      >
                        {tagOpt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Trạng thái */}
              <Text style={styles.sectionLabel}>{isEn ? 'Status' : 'Trạng thái'}</Text>
              <View style={styles.chipRow}>
                {(['all', 'available', 'rest'] as const).map((s) => {
                  const label = s === 'all' ? (isEn ? 'All' : 'Tất cả') : s === 'available' ? (isEn ? 'Available' : 'Sẵn sàng') : (isEn ? 'Resting' : 'Nghỉ ngơi');
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.radioChip, filterStatus === s && styles.radioChipActive]}
                      onPress={() => setFilterStatus(s)}
                    >
                      <Text style={[styles.radioChipText, filterStatus === s && styles.radioChipActiveText]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {isVipMember ? (
                <>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionLabel}>{isEn ? 'Age' : 'Độ tuổi'}</Text>
                    <View style={styles.vipTag}>
                      <Text style={styles.vipTagText}>VIP</Text>
                    </View>
                  </View>
                  <Text style={styles.vipHint}>
                    {isEn ? 'Therapist age is unlocked for VIP accounts.' : 'Tuổi kỹ thuật viên được mở khóa cho tài khoản VIP.'}
                  </Text>
                  <View style={{ height: 20 }} />
                </>
              ) : null}
            </ScrollView>

            {/* Bottom buttons */}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
                <Text style={styles.resetBtnText}>{isEn ? 'Reset' : 'Đặt lại'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
                <Text style={styles.applyBtnText}>{isEn ? 'Apply' : 'Áp dụng'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== Service Type Modal ===== */}
      <Modal visible={showServiceModal} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowServiceModal(false)}>
          <Pressable style={[styles.modalSheet, tabletLayout.isTablet && styles.tabletModalSheet]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{isEn ? 'Service type' : 'Loại dịch vụ'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {SERVICE_TYPES.map((svc) => (
                <TouchableOpacity
                  key={svc}
                  style={styles.serviceRow}
                  onPress={() => {
                    setSelectedService(svc);
                    setShowServiceModal(false);
                  }}
                >
                  <Text style={[
                    styles.serviceRowText,
                    selectedService === svc && styles.serviceRowTextActive,
                  ]}>
                    {svc}
                  </Text>
                  {selectedService === svc && (
                    <View style={styles.serviceCheck}>
                      <Text style={styles.serviceCheckIcon}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
              <View style={{ height: 30 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== Therapist Detail Modal ===== */}
      <Modal
        visible={selectedTherapist !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        hardwareAccelerated
        onRequestClose={() => setSelectedTherapist(null)}
      >
        <View style={styles.modalContentBg}>
          {selectedTherapist ? (
            <ModalSafeAreaProvider>
              <TherapistDetailScreen
                therapist={selectedTherapist}
                onClose={() => setSelectedTherapist(null)}
              />
            </ModalSafeAreaProvider>
          ) : null}
        </View>
      </Modal>
    </View>
  );
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

  screenTop: {
    paddingBottom: 10,
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 18,
    color: COLORS.text,
  },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  locationText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  locationArrow: {
    fontSize: 12,
    color: COLORS.subText,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    padding: 0,
  },
  heartBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartIcon: {
    fontSize: 20,
    color: COLORS.text,
  },

  // VIP Banner
  vipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.goldBg,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  vipCrown: {
    fontSize: 18,
  },
  vipText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#7A5400',
  },
  upgradeBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  upgradeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },

  // Filter chips
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: COLORS.white,
  },
  filterIconChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  filterIconText: {
    fontSize: 16,
    color: COLORS.subText,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  filterChipActive: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  filterChipActiveText: {
    color: '#fff',
    fontWeight: '600',
  },

  // List
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 30,
  },

  // Therapist Card (roomier rows + wider list inset via FlatList padding override)
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 14,
    minHeight: 112,
  },
  cardTouchArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarColumn: {
    width: 88,
    alignItems: 'center',
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 14,
    backgroundColor: '#EEE',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 38,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  tagChipBelowOuter: {
    marginTop: 6,
    width: '100%',
    alignItems: 'center',
  },
  tagChipBelowPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: '100%',
    alignSelf: 'center',
  },
  tagChipBelowText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.12,
    textAlign: 'center',
  },
  tagFilterChipTextOn: {
    fontWeight: '700',
  },
  cardInfo: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    minHeight: 78,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  therapistName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  earliestTime: {
    fontSize: 12,
    color: COLORS.subText,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  starIcon: {
    fontSize: 13,
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  reviewCount: {
    fontSize: 13,
    color: COLORS.subText,
  },
  vipAgeText: {
    fontSize: 13,
    color: '#7A5400',
    fontWeight: '600',
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  distanceIcon: {
    fontSize: 13,
  },
  distanceText: {
    fontSize: 13,
    color: COLORS.subText,
  },
  statusText: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
  },
  statusTextAvailable: {
    color: AppColors.success,
  },
  statusTextRest: {
    color: AppColors.danger,
  },
  bookButton: {
    backgroundColor: COLORS.green,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 10,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookButtonDisabled: {
    backgroundColor: '#A8A8A8',
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // States
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.subText,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.subText,
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  tabletModalSheet: {
    width: '70%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 18,
  },

  // Filter modal sections
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.subText,
    marginBottom: 10,
    marginTop: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  radioChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#DDD',
    backgroundColor: COLORS.white,
  },
  radioChipActive: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  radioChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  radioChipActiveText: {
    color: '#fff',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  checkLabel: {
    fontSize: 14,
    color: COLORS.text,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  vipTag: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
  },
  vipTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  vipHint: {
    fontSize: 12,
    color: COLORS.subText,
    lineHeight: 18,
  },
  vipLink: {
    fontSize: 13,
    color: COLORS.green,
    fontWeight: '600',
    marginTop: 4,
  },

  // Modal footer
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  resetBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  applyBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.green,
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // Service type modal
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  serviceRowText: {
    fontSize: 15,
    color: COLORS.text,
  },
  serviceRowTextActive: {
    color: COLORS.green,
    fontWeight: '600',
  },
  serviceCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCheckIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

function estimateAge(item: Therapist) {
  const base = 21 + item.experience;
  const hash = item.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return base + (hash % 5);
}
