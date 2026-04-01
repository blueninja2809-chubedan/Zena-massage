import { useBookings } from '@/contexts/BookingsContext';
import type { Therapist } from '@/lib/types';
import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BookingConfirmScreen from './BookingConfirmScreen';

const SCREEN_HEIGHT = Dimensions.get('window').height;

function getTherapistPhotos(therapist: Therapist): string[] {
  if (therapist.photos && therapist.photos.length > 0) {
    return therapist.photos;
  }
  if (therapist.avatar && therapist.avatar.startsWith('http')) {
    return [therapist.avatar];
  }
  return [];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  green: '#C62828',
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

function generateServicesForTherapist(therapist: Therapist): ServiceItem[] {
  return therapist.specialties.map((specialty) => ({
    name: specialty,
    durations: specialty === 'Lấy ráy tai' ? [40] : [60, 90, 120],
    price: therapist.hourlyRate > 0 ? therapist.hourlyRate * 2 : 600000,
  }));
}

function generateReviews(therapist: Therapist): ReviewItem[] {
  const reviewTemplates = [
    { comment: 'Excellent Massage.', hasTranslate: true },
    { comment: 'Chưa có nội dung', hasTranslate: false },
    { comment: 'Lành mạnh, làm tốt đủ giờ', hasTranslate: true },
    { comment: 'Professional & fun to talk to', hasTranslate: true },
    { comment: 'Rất chuyên nghiệp, sẽ quay lại', hasTranslate: true },
  ];

  const count = Math.min(therapist.reviewCount, 5);
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
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={{ fontSize: size, color: i <= rating ? COLORS.gold : '#DDD' }}>
          ★
        </Text>
      ))}
    </View>
  );
}

export default function TherapistDetailScreen({
  therapist,
  onClose,
}: {
  therapist: Therapist;
  onClose: () => void;
}) {
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
      comment: r.comment || 'Chưa có nội dung',
      hasTranslate: false,
    };
  });
  const reviews = [...realReviewItems, ...generatedReviews];
  const [selectedDurations, setSelectedDurations] = useState<Record<string, number>>({});
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [showBooking, setShowBooking] = useState(false);
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

  const distanceText =
    therapist.distanceFromCenter < 1
      ? `${Math.round(therapist.distanceFromCenter * 1000)}m`
      : `${therapist.distanceFromCenter} km`;

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

  const getTag = (): string | null => {
    if (therapist.rating >= 4.8) return 'Chất lượng';
    if (therapist.experience <= 1) return 'Mới đến';
    return null;
  };

  const tag = getTag();

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
              <Text style={styles.heroEmoji}>
                {therapist.gender === 'female' ? '👩' : '👨'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Overlay top buttons */}
          <View style={styles.heroTopBar}>
            <TouchableOpacity style={styles.heroCircleBtn} onPress={onClose}>
              <Text style={styles.heroBtnText}>‹</Text>
            </TouchableOpacity>
            <View style={styles.heroTopRight}>
              <TouchableOpacity style={styles.heroCircleBtn}>
                <Text style={styles.heroBtnText}>♡</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.heroCircleBtn, { marginLeft: 10 }]}>
                <Text style={styles.heroBtnText}>⤴</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom badges */}
          <View style={styles.heroBottomBar}>
            {tag && (
              <View style={styles.qualityBadge}>
                <Text style={styles.qualityBadgeText}>{tag}</Text>
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
            <Text style={styles.metaIcon}>⊙</Text>
            <Text style={styles.metaText}>{distanceText}</Text>
            <Text style={styles.metaDivider}> | </Text>
            <Text style={styles.starIcon}>⭐</Text>
            <Text style={styles.ratingValue}>{combinedRating.toFixed(1)}</Text>
            <Text style={styles.reviewLink}>({totalReviewCount} đánh giá)</Text>
          </View>
        </View>

        {/* ===== GlowCare Box ===== */}
        <View style={styles.glowCareBox}>
          <View style={styles.glowCareLeft}>
            <View style={styles.glowCareIcon}>
              <Text style={styles.glowCareCheckBig}>✅</Text>
            </View>
            <Text style={styles.glowCareBrand}>
              glow<Text style={styles.glowCareBoldText}>Care</Text>
            </Text>
          </View>
          <View style={styles.glowCareRight}>
            <View style={styles.glowCareRow}>
              <Text style={styles.glowCareCheck}>☑️</Text>
              <Text style={styles.glowCareText}>Không mất tiền tip, không phí di chuyển</Text>
            </View>
            <View style={styles.glowCareRow}>
              <Text style={styles.glowCareCheck}>☑️</Text>
              <Text style={styles.glowCareText}>Bồi thường nếu không đúng người</Text>
            </View>
          </View>
        </View>

        {/* ===== Bio ===== */}
        <View style={styles.bioSection}>
          <Text style={styles.bioText}>{therapist.bio}</Text>
        </View>

        {/* ===== Services ===== */}
        <View style={styles.servicesSection}>
          <Text style={styles.sectionTitle}>Dịch vụ của tôi</Text>
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
                        {d} phút
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
                      <Text style={styles.checkCircleIcon}>✓</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.bookBtnSmall}
                      onPress={() => toggleService(svc.name)}
                    >
                      <Text style={styles.bookBtnSmallText}>Đặt</Text>
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
            <Text style={styles.sectionTitle}>Đánh giá</Text>
            <TouchableOpacity>
              <Text style={styles.viewAllLink}>Xem tất cả</Text>
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
                ({totalReviewCount} đánh giá)
              </Text>
            </View>
            <View style={styles.ratingBars}>
              {breakdown.map((b) => (
                <View key={b.stars} style={styles.barRow}>
                  <Text style={styles.barStarNum}>{b.stars}</Text>
                  <Text style={styles.barStarIcon}>⭐</Text>
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
                  <Text style={styles.reviewAvatarEmoji}>{review.avatar}</Text>
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
                  <Text style={styles.translateIcon}>🔄</Text>
                  <Text style={styles.translateLabel}>Đang hiển thị bản gốc </Text>
                  <Text style={styles.translateLink}>Dịch</Text>
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
              Tổng: <Text style={styles.bottomCount}>{selectedServices.size}</Text> dịch vụ
            </Text>
            <Text style={styles.bottomPrice}>
              {totalPrice.toLocaleString('vi-VN')} đ
            </Text>
          </View>
          <TouchableOpacity style={styles.bottomBookBtn} activeOpacity={0.8} onPress={() => setShowBooking(true)}>
            <Text style={styles.bottomBookBtnText}>Đặt ngay</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Photo Viewer Modal */}
      <Modal visible={showPhotoViewer} transparent animationType="fade">
        <View style={styles.photoViewerBg}>
          <StatusBar barStyle="light-content" />
          <TouchableOpacity
            style={styles.photoViewerCloseBtn}
            onPress={() => setShowPhotoViewer(false)}
          >
            <Text style={styles.photoViewerCloseIcon}>✕</Text>
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
              <Text style={styles.photoViewerEmoji}>
                {therapist.gender === 'female' ? '👩' : '👨'}
              </Text>
              <Text style={styles.photoViewerNoPhoto}>Chưa có ảnh</Text>
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
      <Modal visible={showBooking} animationType="slide">
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
        />
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
  photoViewerCloseIcon: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
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
  photoViewerEmoji: {
    fontSize: 120,
  },
  photoViewerNoPhoto: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    marginTop: 16,
  },
  heroEmoji: {
    fontSize: 120,
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
  heroBtnText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  heroBottomBar: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  qualityBadge: {
    backgroundColor: COLORS.green,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  qualityBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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

  // GlowCare
  glowCareBox: {
    marginHorizontal: 20,
    borderWidth: 1.5,
    borderColor: COLORS.greenBorder,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  glowCareLeft: {
    alignItems: 'center',
    marginRight: 14,
  },
  glowCareIcon: {
    marginBottom: 4,
  },
  glowCareCheckBig: {
    fontSize: 28,
  },
  glowCareBrand: {
    fontSize: 12,
    color: COLORS.subText,
  },
  glowCareBoldText: {
    fontWeight: '800',
    color: COLORS.text,
  },
  glowCareRight: {
    flex: 1,
  },
  glowCareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  glowCareCheck: {
    fontSize: 14,
    marginRight: 6,
  },
  glowCareText: {
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
  checkCircleIcon: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.green,
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
  reviewAvatarEmoji: {
    fontSize: 20,
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
