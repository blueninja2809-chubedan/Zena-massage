import Feather from '@expo/vector-icons/Feather';
import { useBookings } from '@/contexts/BookingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getGeneratedReviewItemCount,
  isVirtualTherapistId,
  VIRTUAL_REVIEW_TEMPLATES,
} from '@/lib/virtualTherapistsMock';
import {
  getTherapistDisplayTag,
  getTherapistTagLabel,
  THERAPIST_TAG_VISUAL,
} from '@/constants/therapistTags';
import { isRenderableTherapistImageUri } from '@/lib/supabaseService';
import type { Therapist } from '@/lib/types';
import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors } from '@/constants/appColors';
import BookingConfirmScreen from './BookingConfirmScreen';

const SCREEN_HEIGHT = Dimensions.get('window').height;

function getTherapistPhotos(therapist: Therapist): string[] {
  if (therapist.photos && therapist.photos.length > 0) {
    return therapist.photos;
  }
  if (therapist.avatar && isRenderableTherapistImageUri(therapist.avatar)) {
    return [therapist.avatar];
  }
  return [];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function formatDistanceLabel(distanceKm: number, isEn: boolean = false): string {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return isEn ? 'Updating' : 'Đang cập nhật';
  }
  if (distanceKm < 1) {
    return `${Math.max(1, Math.round(distanceKm * 1000))}m`;
  }
  return `${Math.round(distanceKm * 10) / 10} km`;
}

const DETAIL_T = {
  vi: {
    services: 'Dịch vụ của tôi',
    book: 'Đặt',
    bookNow: 'Đặt ngay',
    reviewsTitle: 'Đánh giá',
    viewAll: 'Xem tất cả',
    reviewCount: 'đánh giá',
    minutes: 'phút',
    currency: 'đ',
    noContent: 'Chưa có nội dung',
    noPhoto: 'Chưa có ảnh',
    careNoTip: 'Không mất tiền tip, không phí di chuyển',
    careRefund: 'Bồi thường nếu không đúng người',
    showingOriginal: 'Đang hiển thị bản gốc',
    translate: 'Dịch',
    totalPrefix: 'Tổng:',
    totalSuffix: 'dịch vụ',
  },
  en: {
    services: 'My services',
    book: 'Book',
    bookNow: 'Book now',
    reviewsTitle: 'Reviews',
    viewAll: 'View all',
    reviewCount: 'reviews',
    minutes: 'min',
    currency: 'đ',
    noContent: 'No content',
    noPhoto: 'No photos yet',
    careNoTip: 'No tipping, no travel fees',
    careRefund: 'Refund if therapist mismatched',
    showingOriginal: 'Showing original',
    translate: 'Translate',
    totalPrefix: 'Total:',
    totalSuffix: 'services',
  },
} as const;

const COLORS = {
  green: AppColors.primaryDark,
  greenLight: '#E8F5EE',
  greenBorder: '#A8D5BA',
  bg: '#F5F5F5',
  white: '#fff',
  text: '#1A1A1A',
  subText: '#666',
  border: '#E8E8E8',
  gold: '#F5A623',
  starBg: '#FFF8E1',
};

// Each therapist has services from their specialties
interface ServiceItem {
  name: string;
  durations: number[];
  price: number;
}

// Mock reviews
interface ReviewItem {
  id: string;
  userLabel: string;
  avatar: string;
  rating: number;
  date: string;
  comment: string;
  hasTranslate: boolean;
}

function normalizeServiceName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isMassageServiceName(value: string): boolean {
  const normalized = normalizeServiceName(value);
  return normalized.includes('massage') || normalized.includes('mat xa') || normalized.includes('xoa bop');
}

function generateServicesForTherapist(therapist: Therapist): ServiceItem[] {
  const specs = therapist.specialties ?? [];
  if (specs.length === 0) {
    return [
      {
        name: 'Massage',
        durations: [60, 90, 120],
        price: therapist.hourlyRate > 0 ? therapist.hourlyRate * 2 : 600000,
      },
    ];
  }
  const sortedSpecs = [...specs].sort((a, b) => {
    const aPriority = isMassageServiceName(a) ? 0 : 1;
    const bPriority = isMassageServiceName(b) ? 0 : 1;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    return a.localeCompare(b, 'vi');
  });
  return sortedSpecs.map((specialty) => ({
    name: specialty,
    durations: specialty === 'Lấy ráy tai' ? [40] : [60, 90, 120],
    price: therapist.hourlyRate > 0 ? therapist.hourlyRate * 2 : 600000,
  }));
}

function generateReviews(therapist: Therapist): ReviewItem[] {
  const defaultTemplates = [
    { comment: 'Excellent Massage.', hasTranslate: true },
    { comment: 'Chưa có nội dung', hasTranslate: false },
    { comment: 'Lành mạnh, làm tốt đủ giờ', hasTranslate: true },
    { comment: 'Professional & fun to talk to', hasTranslate: true },
    { comment: 'Rất chuyên nghiệp, sẽ quay lại', hasTranslate: true },
  ];

  const reviewTemplates = isVirtualTherapistId(therapist.id)
    ? VIRTUAL_REVIEW_TEMPLATES
    : defaultTemplates;
  const count = getGeneratedReviewItemCount(therapist);
  return Array.from({ length: count }, (_, i) => {
    const tpl = reviewTemplates[i % reviewTemplates.length];
    const day = 12 - i * 3;
    const month = day > 0 ? '03' : '02';
    const d = day > 0 ? day : 28 + day;
    return {
      id: `review-${i}`,
      userLabel: `•••••${String(10 + i * 22).padStart(2, '0')}`,
      avatar: i === 0 ? '🧔' : '👤',
      rating: i < 4 ? 5 : 4,
      date: `${12 + i}:${String(Math.round(Math.random() * 59)).padStart(2, '0')} ${String(d).padStart(2, '0')}/${month}/2026`,
      comment: tpl.comment,
      hasTranslate: tpl.hasTranslate,
    };
  });
}

function StarDisplay({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Feather
          key={i}
          name="star"
          size={size}
          color={i <= rating ? COLORS.gold : '#DDD'}
        />
      ))}
    </View>
  );
}

export default function TherapistDetailScreen({
  therapist,
  onClose,
  resumeOpenBookingToken = '',
}: {
  therapist: Therapist;
  onClose: () => void;
  /** Mỗi lần đổi (vd. từ banner đơn chờ) → tự mở màn đặt lịch. */
  resumeOpenBookingToken?: string;
}) {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const isEn = language === 'en';
  const t = DETAIL_T[isEn ? 'en' : 'vi'];
  const { getReviewsForTherapist } = useBookings();
  const services = generateServicesForTherapist(therapist);
  const generatedReviews = generateReviews(therapist);

  // Convert real reviews to ReviewItem format and prepend
  const realReviews = getReviewsForTherapist(therapist.id);
  const realReviewItems: ReviewItem[] = realReviews.map((r) => {
    const d = new Date(r.createdAt);
    const phone = r.customerPhone || '';
    const maskedPhone = phone.length > 2 ? `•••••${phone.slice(-2)}` : '👤';
    return {
      id: r.id,
      userLabel: maskedPhone,
      avatar: '👤',
      rating: r.rating,
      date: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
      comment: r.comment || t.noContent,
      hasTranslate: false,
    };
  });
  const reviews = [...realReviewItems, ...generatedReviews];
  const [selectedDurations, setSelectedDurations] = useState<Record<string, number>>({});
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [showBooking, setShowBooking] = useState(false);
  const lastResumeTokenRef = useRef('');
  useEffect(() => {
    lastResumeTokenRef.current = '';
  }, [therapist.id]);

  useEffect(() => {
    if (!resumeOpenBookingToken) {
      return;
    }
    if (resumeOpenBookingToken === lastResumeTokenRef.current) {
      return;
    }
    lastResumeTokenRef.current = resumeOpenBookingToken;
    setShowBooking(true);
  }, [resumeOpenBookingToken]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const photos = getTherapistPhotos(therapist);
  const hasPhotos = photos.length > 0;
  const heroFlatListRef = useRef<FlatList>(null);
  const viewerFlatListRef = useRef<FlatList>(null);

  const onHeroScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setPhotoIndex(idx);
  };

  const onViewerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setPhotoIndex(idx);
  };

  const openPhotoViewer = (idx: number) => {
    setPhotoIndex(idx);
    setShowPhotoViewer(true);
  };

  const toggleService = (name: string) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const totalPrice = services
    .filter((svc) => selectedServices.has(svc.name))
    .reduce((sum, svc) => sum + svc.price, 0);

  const distanceText = formatDistanceLabel(therapist.distanceFromCenter, isEn);

  // Rating breakdown (include real reviews)
  const totalReviewCount = therapist.reviewCount + realReviews.length;
  const realRatingSum = realReviews.reduce((s, r) => s + r.rating, 0);
  const baseRatingSum = therapist.rating * therapist.reviewCount;
  const combinedRating = totalReviewCount > 0
    ? (baseRatingSum + realRatingSum) / totalReviewCount
    : therapist.rating;

  const baseFive = Math.round(therapist.reviewCount * 0.95);
  const baseFour = therapist.reviewCount - baseFive;
  const realFive = realReviews.filter(r => r.rating === 5).length;
  const realFour = realReviews.filter(r => r.rating === 4).length;
  const realThree = realReviews.filter(r => r.rating === 3).length;
  const realTwo = realReviews.filter(r => r.rating === 2).length;
  const realOne = realReviews.filter(r => r.rating <= 1).length;

  const total = totalReviewCount || 1;
  const breakdown = [
    { stars: 5, count: baseFive + realFive, pct: Math.round(((baseFive + realFive) / total) * 100) },
    { stars: 4, count: baseFour + realFour, pct: Math.round(((baseFour + realFour) / total) * 100) },
    { stars: 3, count: realThree, pct: Math.round((realThree / total) * 100) },
    { stars: 2, count: realTwo, pct: Math.round((realTwo / total) * 100) },
    { stars: 1, count: realOne, pct: Math.round((realOne / total) * 100) },
  ];

  const tag = getTherapistDisplayTag(therapist);
  const tagVisual = tag ? THERAPIST_TAG_VISUAL[tag] : null;
  const modalTopFallback = Platform.OS === 'ios' ? 44 : 12;
  const heroTopOffset = insets.top > 0 ? 10 : modalTopFallback;
  const photoViewerCloseTop = (insets.top > 0 ? insets.top : modalTopFallback) + 6;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ===== Hero Photo ===== */}
        <View style={styles.heroSection}>
          {hasPhotos ? (
            <FlatList
              ref={heroFlatListRef}
              data={photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onHeroScroll}
              scrollEventThrottle={16}
              keyExtractor={(_, i) => `hero-${i}`}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => openPhotoViewer(index)}
                  style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.95 }}
                >
                  <Image
                    source={{ uri: item }}
                    style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.95 }}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              )}
            />
          ) : (
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.heroPlaceholder}
              onPress={() => openPhotoViewer(0)}
            >
              <Feather name="user" size={96} color={COLORS.green} />
            </TouchableOpacity>
          )}

          {/* Overlay top buttons */}
          <View style={[styles.heroTopBar, { top: heroTopOffset }]}>
            <TouchableOpacity style={styles.heroCircleBtn} onPress={onClose}>
              <Feather name="chevron-left" size={26} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.heroTopRight}>
              <TouchableOpacity style={styles.heroCircleBtn}>
                <Feather name="heart" size={23} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom badges */}
          <View style={styles.heroBottomBar}>
            {tag && tagVisual && (
              <View
                style={[
                  styles.heroTagPill,
                  {
                    backgroundColor: tagVisual.bg,
                    borderColor: tagVisual.border,
                    shadowColor: tagVisual.bg,
                  },
                ]}
              >
                <Text style={[styles.heroTagPillText, { color: tagVisual.text }]}>
                  {getTherapistTagLabel(tag, isEn)}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            {hasPhotos && photos.length > 1 && (
              <View style={styles.photoCounter}>
                <Text style={styles.photoCounterText}>
                  {photoIndex + 1}/{photos.length}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ===== Name & Info ===== */}
        <View style={styles.infoSection}>
          <Text style={styles.therapistName}>{therapist.name}</Text>
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={13} color={COLORS.subText} style={styles.metaIcon} />
            <Text style={styles.metaText}>{distanceText}</Text>
            <Text style={styles.metaDivider}> | </Text>
            <Feather name="star" size={14} color={COLORS.gold} style={styles.starIcon} />
            <Text style={styles.ratingValue}>{combinedRating.toFixed(1)}</Text>
            <Text style={styles.reviewLink}>({totalReviewCount} {t.reviewCount})</Text>
          </View>
        </View>

        {/* ===== Zena Care promo ===== */}
        <View style={styles.zenaCareBox}>
          <View style={styles.zenaCareLeft}>
            <View style={styles.zenaCareIcon}>
              <Feather name="check-circle" size={30} color={COLORS.green} />
            </View>
            <Text style={styles.zenaCareBrand}>
              zena<Text style={styles.zenaCareBoldText}>Care</Text>
            </Text>
          </View>
          <View style={styles.zenaCareRight}>
            <View style={styles.zenaCareRow}>
              <Feather name="check-square" size={17} color={COLORS.subText} style={styles.zenaCareCheck} />
              <Text style={styles.zenaCareText}>{t.careNoTip}</Text>
            </View>
            <View style={styles.zenaCareRow}>
              <Feather name="check-square" size={17} color={COLORS.subText} style={styles.zenaCareCheck} />
              <Text style={styles.zenaCareText}>{t.careRefund}</Text>
            </View>
          </View>
        </View>

        {/* ===== Bio ===== */}
        <View style={styles.bioSection}>
          <Text style={styles.bioText}>{therapist.bio}</Text>
        </View>

        {/* ===== Services ===== */}
        <View style={styles.servicesSection}>
          <Text style={styles.sectionTitle}>{t.services}</Text>
          {services.map((svc) => {
            const selDuration = selectedDurations[svc.name] ?? svc.durations[0];
            const isSelected = selectedServices.has(svc.name);
            return (
              <View
                key={svc.name}
                style={[
                  styles.serviceCard,
                  isSelected && styles.serviceCardSelected,
                ]}
              >
                <Text style={styles.serviceName}>{svc.name}</Text>
                <View style={styles.durationRow}>
                  {svc.durations.map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.durationChip,
                        selDuration === d && styles.durationChipActive,
                      ]}
                      onPress={() =>
                        setSelectedDurations((prev) => ({ ...prev, [svc.name]: d }))
                      }
                    >
                      <Text
                        style={[
                          styles.durationChipText,
                          selDuration === d && styles.durationChipTextActive,
                        ]}
                      >
                        {d} {t.minutes}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.servicePriceRow}>
                  <Text style={styles.servicePrice}>
                    {svc.price.toLocaleString('vi-VN')} đ
                  </Text>
                  {isSelected ? (
                    <TouchableOpacity
                      style={styles.checkCircle}
                      onPress={() => toggleService(svc.name)}
                    >
                      <Feather name="check" size={22} color={COLORS.green} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.bookBtnSmall}
                      onPress={() => toggleService(svc.name)}
                    >
                      <Text style={styles.bookBtnSmallText}>{t.book}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* ===== Reviews ===== */}
        <View style={styles.reviewsSection}>
          <View style={styles.reviewsHeader}>
            <Text style={styles.sectionTitle}>{t.reviewsTitle}</Text>
            <TouchableOpacity>
              <Text style={styles.viewAllLink}>{t.viewAll}</Text>
            </TouchableOpacity>
          </View>

          {/* Rating breakdown */}
          <View style={styles.ratingBreakdown}>
            <View style={styles.ratingLeft}>
              <Text style={styles.ratingBig}>
                {combinedRating.toFixed(1)} / 5
              </Text>
              <StarDisplay rating={Math.round(combinedRating)} size={16} />
              <Text style={styles.ratingTotal}>
                ({totalReviewCount} {t.reviewCount})
              </Text>
            </View>
            <View style={styles.ratingBars}>
              {breakdown.map((b) => (
                <View key={b.stars} style={styles.barRow}>
                  <Text style={styles.barStarNum}>{b.stars}</Text>
                  <Feather name="star" size={10} color={COLORS.gold} style={styles.barStarIcon} />
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${b.pct}%`,
                          backgroundColor: b.pct > 0 ? COLORS.green : '#E0E0E0',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barPct}>{b.pct}%</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Review items */}
          {reviews.map((review) => (
            <View key={review.id} style={styles.reviewItem}>
              <View style={styles.reviewTop}>
                <View style={styles.reviewAvatarCircle}>
                  <Feather name="user" size={20} color={COLORS.green} />
                </View>
                <View style={styles.reviewMeta}>
                  <Text style={styles.reviewUser}>{review.userLabel}</Text>
                  <StarDisplay rating={review.rating} size={12} />
                </View>
                <Text style={styles.reviewDate}>{review.date}</Text>
              </View>
              <Text style={styles.reviewComment}>{review.comment}</Text>
              {review.hasTranslate && (
                <View style={styles.translateRow}>
                  <Feather name="refresh-cw" size={12} color={COLORS.subText} style={styles.translateIcon} />
                  <Text style={styles.translateLabel}>{t.showingOriginal} </Text>
                  <Text style={styles.translateLink}>{t.translate}</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        <View style={{ height: selectedServices.size > 0 ? 140 : 40 }} />
      </ScrollView>

      {/* Bottom bar */}
      {selectedServices.size > 0 && (
        <View style={styles.bottomBar}>
          <View style={styles.bottomInfo}>
            <Text style={styles.bottomLabel}>
              {t.totalPrefix} <Text style={styles.bottomCount}>{selectedServices.size}</Text> {t.totalSuffix}
            </Text>
            <Text style={styles.bottomPrice}>
              {totalPrice.toLocaleString('vi-VN')} đ
            </Text>
          </View>
          <TouchableOpacity style={styles.bottomBookBtn} activeOpacity={0.8} onPress={() => setShowBooking(true)}>
            <Text style={styles.bottomBookBtnText}>{t.bookNow}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Photo Viewer Modal */}
      <Modal visible={showPhotoViewer} transparent animationType="fade">
        <View style={styles.photoViewerBg}>
          <StatusBar barStyle="light-content" />
          <TouchableOpacity
            style={[styles.photoViewerCloseBtn, { top: photoViewerCloseTop }]}
            onPress={() => setShowPhotoViewer(false)}
          >
            <Feather name="x" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {hasPhotos ? (
            <FlatList
              ref={viewerFlatListRef}
              data={photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onViewerScroll}
              scrollEventThrottle={16}
              initialScrollIndex={photoIndex}
              getItemLayout={(_, index) => ({
                length: SCREEN_WIDTH,
                offset: SCREEN_WIDTH * index,
                index,
              })}
              keyExtractor={(_, i) => `viewer-${i}`}
              renderItem={({ item }) => (
                <View style={styles.photoViewerSlide}>
                  <Image
                    source={{ uri: item }}
                    style={styles.photoViewerImage}
                    resizeMode="contain"
                  />
                </View>
              )}
            />
          ) : (
            <View style={styles.photoViewerSlide}>
              <Feather name="user" size={112} color="rgba(255,255,255,0.75)" />
              <Text style={styles.photoViewerNoPhoto}>{t.noPhoto}</Text>
            </View>
          )}
          {hasPhotos && photos.length > 1 && (
            <View style={styles.photoViewerCounter}>
              <Text style={styles.photoViewerCounterText}>
                {photoIndex + 1} / {photos.length}
              </Text>
            </View>
          )}
        </View>
      </Modal>

      {/* Booking Confirm Modal */}
      <Modal
        visible={showBooking}
        animationType="slide"
        presentationStyle="fullScreen"
        hardwareAccelerated
        onRequestClose={() => setShowBooking(false)}
      >
        <View style={{ flex: 1, backgroundColor: AppColors.bg }}>
          <BookingConfirmScreen
            therapist={therapist}
            selectedServices={services
              .filter((svc) => selectedServices.has(svc.name))
              .map((svc) => ({
                name: svc.name,
                duration: selectedDurations[svc.name] ?? svc.durations[0],
                price: svc.price,
              }))}
            totalPrice={totalPrice}
            onClose={() => setShowBooking(false)}
            onChatClose={() => { setShowBooking(false); onClose(); }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scroll: {
    flex: 1,
  },

  // Hero
  heroSection: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.95,
    backgroundColor: '#E8E8E8',
    position: 'relative',
  },
  heroPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D4E6DC',
  },
  // Photo viewer
  photoViewerBg: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  photoViewerCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoViewerSlide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoViewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
  photoViewerCounter: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  photoViewerCounterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  photoViewerNoPhoto: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    marginTop: 16,
  },
  heroTopBar: {
    position: 'absolute',
    top: 10,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTopRight: {
    flexDirection: 'row',
  },
  heroCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBottomBar: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  heroTagPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  heroTagPillText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  photoCounter: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  photoCounterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Info
  infoSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  therapistName: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: {
    fontSize: 14,
    color: COLORS.subText,
    marginRight: 4,
  },
  metaText: {
    fontSize: 14,
    color: COLORS.subText,
  },
  metaDivider: {
    fontSize: 14,
    color: COLORS.subText,
    marginHorizontal: 4,
  },
  starIcon: {
    fontSize: 14,
    marginRight: 2,
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gold,
    marginRight: 4,
  },
  reviewLink: {
    fontSize: 14,
    color: COLORS.subText,
    textDecorationLine: 'underline',
  },

  // Zena Care promo block styles
  zenaCareBox: {
    marginHorizontal: 20,
    borderWidth: 1.5,
    borderColor: COLORS.greenBorder,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  zenaCareLeft: {
    alignItems: 'center',
    marginRight: 14,
  },
  zenaCareIcon: {
    marginBottom: 4,
  },
  zenaCareBrand: {
    fontSize: 12,
    color: COLORS.subText,
  },
  zenaCareBoldText: {
    fontWeight: '800',
    color: COLORS.text,
  },
  zenaCareRight: {
    flex: 1,
  },
  zenaCareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  zenaCareCheck: {
    fontSize: 14,
    marginRight: 6,
  },
  zenaCareText: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },

  // Bio
  bioSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  bioText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },

  // Services
  servicesSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 14,
  },
  serviceCard: {
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  serviceCardSelected: {
    borderColor: COLORS.green,
    backgroundColor: COLORS.white,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },
  durationRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  durationChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: COLORS.white,
  },
  durationChipActive: {
    borderColor: COLORS.green,
    backgroundColor: '#E8F5EE',
  },
  durationChipText: {
    fontSize: 13,
    color: COLORS.subText,
  },
  durationChipTextActive: {
    color: COLORS.green,
    fontWeight: '600',
  },
  servicePriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  servicePrice: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  bookBtnSmall: {
    backgroundColor: COLORS.green,
    borderRadius: 22,
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
  bookBtnSmallText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  checkCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: COLORS.green,
    backgroundColor: COLORS.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Reviews
  reviewsSection: {
    paddingHorizontal: 20,
  },
  reviewsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  viewAllLink: {
    fontSize: 14,
    color: COLORS.green,
    fontWeight: '600',
  },
  ratingBreakdown: {
    flexDirection: 'row',
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  ratingLeft: {
    alignItems: 'center',
    marginRight: 16,
    minWidth: 80,
  },
  ratingBig: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  ratingTotal: {
    fontSize: 12,
    color: COLORS.subText,
    marginTop: 4,
  },
  ratingBars: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barStarNum: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
    width: 12,
    textAlign: 'right',
  },
  barStarIcon: {
    fontSize: 10,
    marginHorizontal: 4,
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#E8E8E8',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  barPct: {
    fontSize: 12,
    color: COLORS.subText,
    width: 36,
    textAlign: 'right',
  },

  // Review items
  reviewItem: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 16,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  reviewAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  reviewMeta: {
    flex: 1,
  },
  reviewUser: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  reviewDate: {
    fontSize: 12,
    color: COLORS.subText,
  },
  reviewComment: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: 6,
  },
  translateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  translateIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  translateLabel: {
    fontSize: 13,
    color: COLORS.subText,
  },
  translateLink: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    textDecorationLine: 'underline',
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  bottomInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bottomLabel: {
    fontSize: 15,
    color: COLORS.subText,
  },
  bottomCount: {
    fontWeight: '700',
    color: COLORS.text,
  },
  bottomPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  bottomBookBtn: {
    backgroundColor: COLORS.green,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  bottomBookBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
});
