import Feather from '@expo/vector-icons/Feather';
import { AppColors } from '@/constants/appColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { canUseAppFeatures } from '@/lib/session';
import { getServices } from '@/lib/supabaseService';
import type { Service } from '@/lib/types';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    Linking,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const translations = {
  vi: {
    title: 'Địa điểm tập luyện & spa',
    search: 'Tìm kiếm dịch vụ...',
    filterNearby: 'Gần tôi',
    filterPopular: 'Đặt nhiều',
    filterTopRated: 'Chất lượng',
    book: 'Đặt',
    noServices: 'Không có dịch vụ nào',
    km: 'km',
    filter: 'Bộ lọc',
    tag: 'Tag',
    reset: 'Đặt lại',
    apply: 'Áp dụng',
    price: 'Giá',
    openingHours: 'Thời gian mở cửa',
    reviews: 'Đánh giá',
    viewAll: 'Xem tất cả',
    totalPayment: 'Tổng tiền thanh toán',
    contact: 'Liên hệ',
    bookNow: 'Đặt ngay',
    mon: 'Thứ 2',
    tue: 'Thứ 3',
    wed: 'Thứ 4',
    thu: 'Thứ 5',
    fri: 'Thứ 6',
    sat: 'Thứ 7',
    sun: 'Chủ nhật',
    atmosphere: 'Không gian đẹp, thoải mái?',
    cleanliness: 'Cơ sở vật chất sạch sẽ?',
    serviceQuality: 'Chất lượng dịch vụ?',
    fairPrice: 'Giá cả hợp lý?',
    showOriginal: 'Đang hiển thị bản gốc',
    translate: 'Dịch',
    reviewCount: 'đánh giá',
    // Booking search screen
    waitingTitle: 'Đang chờ {name} xác nhận...',
    waitingRejected: '{name} chưa nhận cuốc. Bạn có thể chọn KTV khác.',
    autoCancel: 'Đơn đặt sẽ tự động hủy trong vòng',
    cancelOrder: 'Hủy đơn',
    ktvCount: '{count} KTV đang muốn phục vụ bạn',
    replaceFor: 'thay cho {name}',
    ready: 'Sẵn sàng',
    choose: 'Chọn',
    noWaitTitle: 'Không cần chờ lâu',
    noWaitDesc: 'Các kỹ thuật viên dưới đây thấy bạn có nhu cầu đặt dịch vụ và sẵn sàng phục vụ bạn ngay lập tức',
    viewKtvList: 'Xem danh sách KTV',
    searchingNearby: 'Đang tìm kỹ thuật viên gần bạn...',
  },
  en: {
    title: 'Training & spa locations',
    search: 'Search services...',
    filterNearby: 'Nearby',
    filterPopular: 'Popular',
    filterTopRated: 'Top Rated',
    book: 'Book',
    noServices: 'No services found',
    km: 'km',
    filter: 'Filter',
    tag: 'Tag',
    reset: 'Reset',
    apply: 'Apply',
    price: 'Price',
    openingHours: 'Opening Hours',
    reviews: 'Reviews',
    viewAll: 'View all',
    totalPayment: 'Total payment',
    contact: 'Contact',
    bookNow: 'Book now',
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
    atmosphere: 'Nice atmosphere?',
    cleanliness: 'Clean facilities?',
    serviceQuality: 'Service quality?',
    fairPrice: 'Fair price?',
    showOriginal: 'Showing original',
    translate: 'Translate',
    reviewCount: 'reviews',
    // Booking search screen
    waitingTitle: 'Waiting for {name} to confirm...',
    waitingRejected: '{name} did not accept. You can choose another therapist.',
    autoCancel: 'Order will auto-cancel in',
    cancelOrder: 'Cancel Order',
    ktvCount: '{count} therapists want to serve you',
    replaceFor: 'instead of {name}',
    ready: 'Ready',
    choose: 'Choose',
    noWaitTitle: 'No need to wait long',
    noWaitDesc: 'The therapists below see your booking request and are ready to serve you right away',
    viewKtvList: 'View therapist list',
    searchingNearby: 'Searching for nearby therapists...',
  },
};

// Đồng bộ palette với MassageHomeScreen để 2 màn cùng "ngôn ngữ" UI.
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
  red: AppColors.danger,
};

interface LocationService {
  id: string;
  name: string;
  image: string;
  photos: string[];
  rating: number;
  distance: number;
  duration: number;
  price: number;
  tags: string[];
  description: string;
  address: string;
  phone: string;
  openingHours: string;
  reviewCount: number;
  reviews: {
    avatar: string;
    phone: string;
    date: string;
    rating: number;
    text: string;
    scores: { atmosphere: number; cleanliness: number; service: number; price: number };
  }[];
}

const FILTER_TAGS = ['Ưu đãi lần đầu', 'Giờ cao điểm', 'Giờ thấp điểm'];

/** VI vẫn là canonical key (dùng để filter, match trong service.tags). */
const FILTER_TAG_LABEL_EN: Record<string, string> = {
  'Ưu đãi lần đầu': 'First-time offer',
  'Giờ cao điểm': 'Peak hours',
  'Giờ thấp điểm': 'Off-peak hours',
};

function getFilterTagLabel(tag: string, isEn: boolean): string {
  if (!isEn) return tag;
  return FILTER_TAG_LABEL_EN[tag] ?? tag;
}

const { width: SCREEN_W } = Dimensions.get('window');

function toLocationService(item: Service): LocationService {
  return {
    id: item.id,
    name: item.name,
    image: item.image || 'https://picsum.photos/seed/service-default/600/400',
    photos: item.image ? [item.image] : [],
    rating: item.rating ?? 5,
    distance: 2 + Math.floor(Math.random() * 8),
    duration: item.duration ?? 60,
    price: item.basePrice ?? 0,
    tags: [],
    description: item.description || '',
    address: 'Địa chỉ sẽ cập nhật từ quản trị',
    phone: '',
    openingHours: '08:00 - 22:00',
    reviewCount: item.reviewCount ?? 0,
    reviews: [],
  };
}

type SortType = 'nearby' | 'popular' | 'topRated';

export default function MassageLocationScreen({ onClose }: { onClose?: () => void } = {}) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const router = useRouter();
  const strings = translations[language as keyof typeof translations] || translations.vi;

  const [searchText, setSearchText] = useState('');
  const [activeSort, setActiveSort] = useState<SortType>('nearby');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Record<string, boolean>>({});
  const [appliedTags, setAppliedTags] = useState<Record<string, boolean>>({});
  const [selectedService, setSelectedService] = useState<LocationService | null>(null);
  const [services, setServices] = useState<LocationService[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const serviceRows = await getServices();
        setServices(serviceRows.map(toLocationService));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const hasActiveFilter = Object.values(appliedTags).some(Boolean);

  const filteredServices = React.useMemo(() => {
    let list = [...services];

    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }

    // Apply tag filters
    const activeTags = Object.entries(appliedTags).filter(([, v]) => v).map(([k]) => k);
    if (activeTags.length > 0) {
      list = list.filter((s) => activeTags.some((tag) => s.tags.includes(tag)));
    }

    switch (activeSort) {
      case 'popular':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'topRated':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'nearby':
        list.sort((a, b) => a.distance - b.distance);
        break;
    }

    return list;
  }, [searchText, activeSort, appliedTags, services]);

  const sorts: { key: SortType; label: string }[] = [
    { key: 'nearby', label: strings.filterNearby },
    { key: 'popular', label: strings.filterPopular },
    { key: 'topRated', label: strings.filterTopRated },
  ];

  const renderServiceCard = ({ item }: { item: LocationService }) => {
    const firstTag = item.tags[0];
    const tagBg =
      firstTag === 'Giờ thấp điểm'
        ? COLORS.green
        : firstTag === 'Giờ cao điểm'
          ? COLORS.red
          : '#E67E22';

    return (
      <View style={styles.card}>
        {/* Touch area: ảnh + thông tin (mở chi tiết) */}
        <TouchableOpacity
          style={styles.cardTouchArea}
          activeOpacity={0.85}
          onPress={() => setSelectedService(item)}
        >
          {/* Ảnh vuông bo góc nhẹ + badge banner đè trên */}
          <View style={styles.avatarColumn}>
            <View style={styles.avatarCircle}>
              <Image source={{ uri: item.image }} style={styles.avatarImage} resizeMode="cover" />
              {firstTag ? (
                <View style={styles.tagChipBelowOuter} pointerEvents="none">
                  <View style={[styles.tagChipBelowPill, { backgroundColor: tagBg }]}>
                    <Text style={styles.tagChipBelowText} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                      {getFilterTagLabel(firstTag, isEn)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {/* Info: tên + rating + khoảng cách + giá */}
          <View style={styles.cardInfo}>
            <View style={styles.cardRow}>
              <Text style={styles.therapistName} numberOfLines={1}>{item.name}</Text>
            </View>
            <View style={styles.ratingRow}>
              <Feather name="star" size={13} color={COLORS.gold} />
              <Text style={styles.ratingValue}>{item.rating.toFixed(1)}</Text>
              <Text style={styles.reviewCount}>({item.reviewCount} {strings.reviewCount})</Text>
            </View>
            <View style={styles.distanceRow}>
              <Feather name="map-pin" size={13} color={COLORS.subText} />
              <Text style={styles.distanceText}>{item.distance} {strings.km}</Text>
            </View>
            <Text style={styles.priceText}>{item.price.toLocaleString('vi-VN')} đ</Text>
          </View>
        </TouchableOpacity>

        {/* Nút Đặt — match MassageHomeScreen (bo tròn, ngang dòng khoảng cách) */}
        <TouchableOpacity style={styles.bookButton} onPress={() => setSelectedService(item)}>
          <Text style={styles.bookButtonText}>{strings.book}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const handleApplyFilter = () => {
    setAppliedTags({ ...selectedTags });
    setShowFilterModal(false);
  };

  const handleResetFilter = () => {
    setSelectedTags({});
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      <View style={styles.screenTop}>
        {/* Header — mirror MassageHomeScreen: back / search / heart */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => (onClose ? onClose() : router.back())}
            style={styles.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="arrow-left" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.searchBar}>
            <Feather name="search" size={16} color={COLORS.subText} />
            <TextInput
              style={styles.searchInput}
              placeholder={strings.search}
              placeholderTextColor="#999"
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
          </View>
          <TouchableOpacity style={styles.heartBtn}>
            <Feather name="heart" size={20} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter chips — mirror MassageHomeScreen */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterIconChip, hasActiveFilter && styles.filterChipActive]}
          onPress={() => {
            setSelectedTags({ ...appliedTags });
            setShowFilterModal(true);
          }}
        >
          <Feather
            name="sliders"
            size={16}
            color={hasActiveFilter ? '#fff' : COLORS.subText}
          />
        </TouchableOpacity>
        {sorts.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.filterChip, activeSort === s.key && styles.filterChipActive]}
            onPress={() => setActiveSort(s.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                activeSort === s.key && styles.filterChipActiveText,
              ]}
            >
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.green} />
        </View>
      ) : filteredServices.length === 0 ? (
        <View style={styles.centerContainer}>
          <Feather name="map-pin" size={48} color={COLORS.subText} style={styles.emptyIcon} />
          <Text style={styles.emptyText}>{strings.noServices}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredServices}
          keyExtractor={(item) => item.id}
          renderItem={renderServiceCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Filter Modal */}
      <Modal visible={showFilterModal} transparent animationType="slide" onRequestClose={() => setShowFilterModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowFilterModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>{strings.filter}</Text>
              <Text style={styles.modalSubtitle}>{strings.tag}</Text>

              {FILTER_TAGS.map((tag) => (
                <View key={tag} style={styles.tagRow}>
                  <Text style={styles.tagRowLabel}>{getFilterTagLabel(tag, isEn)}</Text>
                  <Switch
                    value={!!selectedTags[tag]}
                    onValueChange={(val: boolean) => setSelectedTags((prev) => ({ ...prev, [tag]: val }))}
                    trackColor={{ false: '#E5E7EB', true: COLORS.green }}
                    thumbColor="#fff"
                  />
                </View>
              ))}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.resetBtn} onPress={handleResetFilter}>
                  <Text style={styles.resetBtnText}>{strings.reset}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.applyBtn} onPress={handleApplyFilter}>
                  <Text style={styles.applyBtnText}>{strings.apply}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Service Detail Modal */}
      {selectedService && (
        <ServiceDetailModal
          service={selectedService}
          strings={strings}
          onClose={() => setSelectedService(null)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Service Detail Modal ───────────────────────────────────
function ServiceDetailModal({
  service,
  strings,
  onClose,
}: {
  service: LocationService;
  strings: Record<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user } = useUser();
  const [activePhoto, setActivePhoto] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const photos = service.photos.length > 0 ? service.photos : [service.image];

  const avgScores = React.useMemo(() => {
    if (service.reviews.length === 0) return { atmosphere: 0, cleanliness: 0, service: 0, price: 0 };
    const totals = service.reviews.reduce(
      (acc, r) => ({
        atmosphere: acc.atmosphere + r.scores.atmosphere,
        cleanliness: acc.cleanliness + r.scores.cleanliness,
        service: acc.service + r.scores.service,
        price: acc.price + r.scores.price,
      }),
      { atmosphere: 0, cleanliness: 0, service: 0, price: 0 }
    );
    const n = service.reviews.length;
    return {
      atmosphere: totals.atmosphere / n,
      cleanliness: totals.cleanliness / n,
      service: totals.service / n,
      price: totals.price / n,
    };
  }, [service.reviews]);

  const days = [
    strings.mon, strings.tue, strings.wed, strings.thu,
    strings.fri, strings.sat, strings.sun,
  ];

  const handleCall = () => {
    Linking.openURL(`tel:${service.phone}`);
  };

  const onPhotoScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActivePhoto(idx);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={detailStyles.container}>
        <StatusBar barStyle="light-content" />
        <ScrollView style={detailStyles.scrollView} bounces={false}>
          {/* Photo Carousel */}
          <View style={detailStyles.photoWrap}>
            <FlatList
              ref={flatListRef}
              data={photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onPhotoScroll}
              scrollEventThrottle={16}
              keyExtractor={(_, i) => `photo-${i}`}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={detailStyles.photo} resizeMode="cover" />
              )}
            />
            {/* Counter */}
            <View style={detailStyles.photoCounter}>
              <Text style={detailStyles.photoCounterText}>
                {activePhoto + 1}/{photos.length}
              </Text>
            </View>
            {/* Back button */}
            <TouchableOpacity style={detailStyles.backBtn} onPress={onClose}>
              <Text style={detailStyles.backBtnText}>‹</Text>
            </TouchableOpacity>
            {/* Share button */}
            <TouchableOpacity style={detailStyles.shareBtn}>
              <Text style={detailStyles.shareBtnText}>⤴</Text>
            </TouchableOpacity>
          </View>

          {/* Info */}
          <View style={detailStyles.infoSection}>
            <Text style={detailStyles.serviceName}>{service.name}</Text>
            <View style={detailStyles.metaRow}>
              <Text style={detailStyles.starIcon}>⭐</Text>
              <Text style={detailStyles.ratingText}>{service.rating.toFixed(1)}</Text>
              <Text style={detailStyles.metaSep}>|</Text>
              <Text style={detailStyles.metaText}>⊙ {service.distance} {strings.km}</Text>
            </View>
            <Text style={detailStyles.priceLabel}>
              {strings.price} <Text style={detailStyles.priceValue}>{service.price.toLocaleString('vi-VN')} đ</Text>
            </Text>
          </View>

          {/* Address Card */}
          <View style={detailStyles.addressCard}>
            <View style={detailStyles.addressLeft}>
              <Text style={detailStyles.addressPin}>📍</Text>
              <Text style={detailStyles.addressText} numberOfLines={2}>{service.address}</Text>
            </View>
            <View style={detailStyles.mapIcon}>
              <Text style={detailStyles.mapIconText}>📍</Text>
            </View>
          </View>

          {/* Description */}
          <View style={detailStyles.section}>
            <Text style={detailStyles.descText}>{service.description}</Text>
          </View>

          <View style={detailStyles.divider} />

          {/* Opening Hours */}
          <View style={detailStyles.section}>
            <Text style={detailStyles.sectionTitle}>{strings.openingHours}</Text>
            {days.map((day) => (
              <View key={day} style={detailStyles.hoursRow}>
                <Text style={detailStyles.dayText}>{day}</Text>
                <Text style={detailStyles.hoursText}>{service.openingHours}</Text>
              </View>
            ))}
          </View>

          <View style={detailStyles.divider} />

          {/* Reviews */}
          <View style={detailStyles.section}>
            <View style={detailStyles.reviewHeader}>
              <Text style={detailStyles.sectionTitle}>{strings.reviews}</Text>
              <TouchableOpacity>
                <Text style={detailStyles.viewAllText}>{strings.viewAll}</Text>
              </TouchableOpacity>
            </View>

            {/* Rating Summary Card */}
            <View style={detailStyles.ratingSummaryCard}>
              <View style={detailStyles.ratingSummaryLeft}>
                <Text style={detailStyles.ratingBig}>{service.rating.toFixed(1)} / 5</Text>
                <View style={detailStyles.starsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Text key={s} style={[detailStyles.starChar, s <= Math.round(service.rating) && detailStyles.starActive]}>★</Text>
                  ))}
                </View>
                <Text style={detailStyles.reviewCountText}>({service.reviewCount} {strings.reviewCount})</Text>
              </View>
              <View style={detailStyles.ratingSummaryRight}>
                {[
                  { label: strings.atmosphere, score: avgScores.atmosphere },
                  { label: strings.cleanliness, score: avgScores.cleanliness },
                  { label: strings.serviceQuality, score: avgScores.service },
                  { label: strings.fairPrice, score: avgScores.price },
                ].map((item) => (
                  <View key={item.label} style={detailStyles.barRow}>
                    <Text style={detailStyles.barLabel}>{item.label}</Text>
                    <View style={detailStyles.barTrack}>
                      <View style={[detailStyles.barFill, { width: `${(item.score / 5) * 100}%` }]} />
                    </View>
                    <Text style={detailStyles.barPercent}>{Math.round((item.score / 5) * 100)}%</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Individual Reviews */}
            {service.reviews.map((review, idx) => (
              <View key={idx} style={detailStyles.reviewItem}>
                <View style={detailStyles.reviewTop}>
                  <Image source={{ uri: review.avatar }} style={detailStyles.reviewAvatar} />
                  <View style={detailStyles.reviewMeta}>
                    <Text style={detailStyles.reviewPhone}>{review.phone}</Text>
                    <View style={detailStyles.reviewStars}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Text key={s} style={[detailStyles.reviewStarChar, s <= review.rating && detailStyles.starActive]}>★</Text>
                      ))}
                    </View>
                  </View>
                  <Text style={detailStyles.reviewDate}>{review.date}</Text>
                </View>
                <Text style={detailStyles.reviewText}>{review.text}</Text>
                <View style={detailStyles.reviewTranslate}>
                  <Text style={detailStyles.translateIcon}>🌐</Text>
                  <Text style={detailStyles.translateText}>{strings.showOriginal}</Text>
                  <TouchableOpacity>
                    <Text style={detailStyles.translateLink}> {strings.translate}</Text>
                  </TouchableOpacity>
                </View>
                <View style={detailStyles.reviewDivider} />
              </View>
            ))}
          </View>

          {/* Spacer for bottom bar */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom Action Bar */}
        <View style={detailStyles.bottomBar}>
          <View style={detailStyles.bottomLeft}>
            <Text style={detailStyles.totalLabel}>{strings.totalPayment}</Text>
          </View>
          <Text style={detailStyles.totalPrice}>{service.price.toLocaleString('vi-VN')} đ</Text>
        </View>
        <View style={detailStyles.bottomActions}>
          <TouchableOpacity style={detailStyles.contactBtn} onPress={handleCall}>
            <Text style={detailStyles.contactIcon}>📞</Text>
            <Text style={detailStyles.contactText}>{strings.contact}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={detailStyles.bookNowBtn}
            onPress={() => {
              if (!canUseAppFeatures(user)) {
                Alert.alert(
                  'Đăng nhập',
                  'Vui lòng đăng nhập để đặt lịch dịch vụ.',
                  [
                    { text: 'Huỷ', style: 'cancel' },
                    {
                      text: 'Đăng nhập',
                      onPress: () => {
                        onClose();
                        router.push('/(tabs)/account');
                      },
                    },
                  ],
                );
                return;
              }
              onClose();
              router.push({
                pathname: '/service-booking',
                params: {
                  serviceId: service.id,
                  name: encodeURIComponent(service.name),
                  price: String(service.price),
                  duration: String(service.duration),
                  distance: String(service.distance),
                  rating: String(service.rating),
                  image: encodeURIComponent(service.image),
                  address: encodeURIComponent(service.address),
                },
              });
            }}
          >
            <Text style={detailStyles.bookNowText}>{strings.bookNow}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Detail Styles ──────────────────────────────────────────
const detailStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scrollView: {
    flex: 1,
  },
  // Photo carousel
  photoWrap: {
    width: SCREEN_W,
    height: SCREEN_W * 0.75,
    backgroundColor: '#000',
    position: 'relative',
  },
  photo: {
    width: SCREEN_W,
    height: SCREEN_W * 0.75,
  },
  photoCounter: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  photoCounterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  backBtn: {
    position: 'absolute',
    top: 50,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: '#fff',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '600',
  },
  shareBtn: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    color: '#fff',
    fontSize: 18,
  },
  // Info
  infoSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  serviceName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  starIcon: {
    fontSize: 15,
  },
  ratingText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.gold,
  },
  metaSep: {
    fontSize: 13,
    color: COLORS.border,
    marginHorizontal: 6,
  },
  metaText: {
    fontSize: 14,
    color: COLORS.subText,
  },
  priceLabel: {
    fontSize: 14,
    color: COLORS.subText,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.green,
  },
  // Address
  addressCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#FFFBFB',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressPin: {
    fontSize: 20,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 19,
  },
  mapIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  mapIconText: {
    fontSize: 20,
  },
  // Sections
  section: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 14,
  },
  descText: {
    fontSize: 14,
    color: COLORS.subText,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginHorizontal: 20,
  },
  // Opening hours
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  dayText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  hoursText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '700',
  },
  // Reviews
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  viewAllText: {
    fontSize: 14,
    color: COLORS.green,
    fontWeight: '600',
  },
  ratingSummaryCard: {
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    marginBottom: 20,
  },
  ratingSummaryLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 16,
    borderRightWidth: 1,
    borderRightColor: '#E8E8E8',
    minWidth: 90,
  },
  ratingBig: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  starsRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 2,
  },
  starChar: {
    fontSize: 16,
    color: '#D1D5DB',
  },
  starActive: {
    color: COLORS.gold,
  },
  reviewCountText: {
    fontSize: 12,
    color: COLORS.subText,
    marginTop: 4,
  },
  ratingSummaryRight: {
    flex: 1,
    paddingLeft: 16,
    gap: 8,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    fontSize: 11,
    color: COLORS.subText,
    width: 100,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#E8E8E8',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    backgroundColor: COLORS.green,
    borderRadius: 4,
  },
  barPercent: {
    fontSize: 11,
    color: COLORS.subText,
    width: 36,
    textAlign: 'right',
  },
  // Individual review
  reviewItem: {
    marginBottom: 8,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  reviewMeta: {
    flex: 1,
  },
  reviewPhone: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  reviewStars: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 1,
  },
  reviewStarChar: {
    fontSize: 14,
    color: '#D1D5DB',
  },
  reviewDate: {
    fontSize: 12,
    color: COLORS.subText,
  },
  reviewText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  reviewTranslate: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  translateIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  translateText: {
    fontSize: 12,
    color: COLORS.subText,
  },
  translateLink: {
    fontSize: 12,
    color: COLORS.green,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  reviewDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginTop: 8,
  },
  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    backgroundColor: COLORS.white,
  },
  bottomLeft: {},
  totalLabel: {
    fontSize: 13,
    color: COLORS.subText,
  },
  totalPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    gap: 12,
    backgroundColor: COLORS.white,
  },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.green,
    gap: 6,
  },
  contactIcon: {
    fontSize: 18,
  },
  contactText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.green,
  },
  bookNowBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.green,
  },
  bookNowText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

// ─── List Styles ────────────────────────────────────────────
// Style mirror với MassageHomeScreen để 2 màn có cùng layout / bố cục:
// background xám nhạt, header trắng bo dưới, filter chip pill nâu,
// card avatar 96×96 + banner tag + nút Đặt bo tròn ngang dòng khoảng cách.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  screenTop: {
    paddingBottom: 10,
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },

  // Header (back · search · heart)
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

  // Card (mirror MassageHomeScreen)
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
    width: 96,
    alignItems: 'center',
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: '#EEE',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  // Banner tag overlay mép trên ảnh, clip theo bo góc của avatarCircle.
  tagChipBelowOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  tagChipBelowPill: {
    width: '100%',
    paddingHorizontal: 4,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagChipBelowText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'center',
    color: '#fff',
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
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
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
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  distanceText: {
    fontSize: 13,
    color: COLORS.subText,
  },
  priceText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.green,
  },
  bookButton: {
    backgroundColor: COLORS.green,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 18,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginBottom: 2,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // States
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.subText,
    textAlign: 'center',
  },

  // Filter Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 34,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 16,
  },
  modalSubtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 14,
  },
  tagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  tagRowLabel: {
    fontSize: 15,
    color: COLORS.text,
  },
  tagSwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagSwitchActive: {
    backgroundColor: COLORS.green,
  },
  tagSwitchCheck: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.green,
    alignItems: 'center',
  },
  resetBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.green,
  },
  applyBtn: {
    flex: 1.5,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: COLORS.green,
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});
