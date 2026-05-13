import { AppColors } from '@/constants/appColors';
import BookingConfirmScreen from '@/components/BookingConfirmScreen';
import { useBookings, type CustomerCartSnapshotRow, type SharedBooking } from '@/contexts/BookingsContext';
import type { CancelledBookingRecord } from '@/lib/supabaseService';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { useTabletLayout } from '@/hooks/use-tablet-layout';
import { replayServicesFromBooking } from '@/lib/bookingReplay';
import type { Therapist } from '@/lib/types';
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BookingDetailModal from './BookingDetailModal';
import ChatScreen from './ChatScreen';
import { ModalSafeAreaProvider } from './ModalSafeAreaProvider';
import ReviewModal from './ReviewModal';

const COLORS = {
  primary: AppColors.primaryDark,
  dark: AppColors.primaryDark,
  light: AppColors.border,
  bg: AppColors.bg,
  text: AppColors.text,
  lightText: AppColors.textMuted,
  accent: AppColors.accent,
};

const translations = {
  vi: {
    myBookings: 'Lịch sử đặt lịch',
    noLogin: 'Vui lòng đăng nhập',
    noLoginDesc: 'Bạn cần đăng nhập để xem lịch sử đặt lịch',
    signIn: 'Đăng nhập',
    noBookingsCompleted: 'Chưa có đơn hoàn thành',
    noBookingsCompletedDesc: 'Các đơn massage đã hoàn tất sẽ xuất hiện tại đây.',
    noBookingsCancelled: 'Chưa có đơn đã huỷ',
    noBookingsCancelledDesc: 'Các đơn đã huỷ trước đây sẽ xuất hiện tại đây.',
    noBookingsActive: 'Không có đơn đang chờ',
    noBookingsActiveDesc: 'Các đơn đang chờ xác nhận hoặc đang thực hiện sẽ xuất hiện tại đây.',
    explore: 'Khám phá dịch vụ',
    active: 'Đang xử lý',
    completed: 'Đã hoàn thành',
    cancelled: 'Đã huỷ',
    chat: 'Chat',
    reschedule: 'Đặt lại',
    review: 'Đánh giá',
    previousPage: 'Trang trước',
    nextPage: 'Trang sau',
    pageLabel: 'Trang',
    latestLimitHint: 'Hiển thị 50 đơn gần nhất',
  },
  en: {
    myBookings: 'Booking history',
    noLogin: 'Please sign in',
    noLoginDesc: 'Sign in to view your booking history',
    signIn: 'Sign in',
    noBookingsCompleted: 'No completed bookings',
    noBookingsCompletedDesc: 'Completed massage bookings will appear here.',
    noBookingsCancelled: 'No cancelled bookings',
    noBookingsCancelledDesc: 'Previously cancelled bookings will appear here.',
    noBookingsActive: 'No active bookings',
    noBookingsActiveDesc: 'Bookings awaiting confirmation or in progress will appear here.',
    explore: 'Explore services',
    active: 'Active',
    completed: 'Completed',
    cancelled: 'Cancelled',
    chat: 'Chat',
    reschedule: 'Rebook',
    review: 'Review',
    previousPage: 'Previous',
    nextPage: 'Next',
    pageLabel: 'Page',
    latestLimitHint: 'Showing latest 50 bookings',
  },
};

type ActivityFilter = 'active' | 'completed' | 'cancelled';
const ACTIVITY_PAGE_SIZE = 10;
const ACTIVITY_MAX_RECENT = 50;

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return AppColors.success;
    case 'cancelled':
      return AppColors.danger;
    default:
      return AppColors.textMuted;
  }
};

const getStatusBgColor = (status: string) => {
  switch (status) {
    case 'completed':
      return AppColors.successBg;
    case 'cancelled':
      return AppColors.dangerBg;
    default:
      return AppColors.primarySoft2;
  }
};

/**
 * Chuyển 1 record từ bảng `cancelled_bookings` (Supabase) → SharedBooking để render
 * cùng UI với card đã hoàn thành. Mỗi record được gắn `status: 'cancelled'`.
 */
function cancelledRecordToSharedBooking(rec: CancelledBookingRecord): SharedBooking {
  const payload = rec.payload || {};
  const cartRaw = (payload as Record<string, unknown>).customerCartSnapshot;
  let cart: CustomerCartSnapshotRow[] | undefined;
  if (Array.isArray(cartRaw)) {
    const out: CustomerCartSnapshotRow[] = [];
    for (const row of cartRaw) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      const duration = Number(o.duration);
      const price = Number(o.price);
      if (!name || !Number.isFinite(duration) || !Number.isFinite(price)) continue;
      out.push({ name, duration, price });
    }
    if (out.length) cart = out;
  }
  return {
    id: rec.bookingId || `cancelled-${rec.id}`,
    customerUserId: rec.customerUserId,
    customerName: rec.customerName || '',
    customerPhone: rec.customerPhone || '',
    therapistId: rec.therapistId || '',
    therapistName: rec.therapistName || '',
    therapistAvatar: rec.therapistAvatar,
    service: rec.service || '',
    date: rec.date || rec.cancelledAt.slice(0, 10),
    time: rec.time || '',
    address: rec.address || '',
    price: rec.price || 0,
    status: 'cancelled',
    createdAt: rec.cancelledAt,
    customerCartSnapshot: cart,
    paymentMethod: rec.paymentMethod,
  };
}

export default function ActivityScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { language } = useLanguage();
  const {
    bookings,
    cancelledBookings,
    hasReviewed,
    refreshCancelledBookings,
  } = useBookings();
  const tabletLayout = useTabletLayout();
  const strings = translations[language as keyof typeof translations] || translations.vi;

  /**
   * Tab "Đã hoàn thành" — đọc từ bookings (table `bookings`).
   * Chỉ giữ booking thuộc về user hiện tại (theo authUid/phone/email/displayName).
   */
  const completedBookings = useMemo(() => {
    if (!user) return [] as SharedBooking[];
    const authUid = user.authUid || '';
    const phone = user.phoneNumber || '';
    const email = user.email || '';
    const displayName = user.displayName || '';

    return bookings.filter((b) => {
      if (b.status !== 'completed') return false;
      const bookingUserId = (b as SharedBooking & { customerUserId?: string }).customerUserId || '';
      return (
        (!!authUid && bookingUserId === authUid) ||
        (!!phone && b.customerPhone === phone) ||
        (!!email && b.customerPhone === email) ||
        (!!displayName && b.customerName === displayName)
      );
    });
  }, [bookings, user]);

  /** Tab "Đang xử lý" — đơn pending / confirmed / in-progress của customer hiện tại. */
  const activeBookings = useMemo(() => {
    if (!user) return [] as SharedBooking[];
    const authUid = user.authUid || '';
    const phone = user.phoneNumber || '';
    const email = user.email || '';
    const displayName = user.displayName || '';
    return bookings
      .filter((b) => {
        if (!['pending', 'confirmed', 'in-progress'].includes(b.status)) return false;
        const bookingUserId = (b as SharedBooking & { customerUserId?: string }).customerUserId || '';
        return (
          (!!authUid && bookingUserId === authUid) ||
          (!!phone && b.customerPhone === phone) ||
          (!!email && b.customerPhone === email) ||
          (!!displayName && b.customerName === displayName)
        );
      })
      .sort(sortByCreatedDesc);
  }, [bookings, user]);

  /**
   * Tab "Đã huỷ" — đọc từ bảng riêng `cancelled_bookings` qua RPC. Mỗi lần focus
   * Activity hoặc đổi tab sẽ chủy động refresh để khách thấy ngay đơn vừa huỷ.
   */
  const cancelledMapped = useMemo(
    () => cancelledBookings.map(cancelledRecordToSharedBooking),
    [cancelledBookings],
  );

  const [selectedStatus, setSelectedStatus] = useState<ActivityFilter>('active');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBooking, setSelectedBooking] = useState<SharedBooking | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [rebookTarget, setRebookTarget] = useState<{ therapist: Therapist; booking: SharedBooking } | null>(null);
  const [resumePendingTarget, setResumePendingTarget] = useState<{ therapist: Therapist; booking: SharedBooking } | null>(null);
  const [reviewBooking, setReviewBooking] = useState<SharedBooking | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [chatBookingId, setChatBookingId] = useState<string | null>(null);

  const sortByCreatedDesc = (a: SharedBooking, b: SharedBooking) => {
    const ka = a.createdAt || `${a.date} ${a.time}`;
    const kb = b.createdAt || `${b.date} ${b.time}`;
    if (ka === kb) return 0;
    return ka < kb ? 1 : -1;
  };

  // Tách 2 nguồn — lấy tối đa 50 đơn gần nhất CHO MỖI tab (Đã hoàn thành / Đã huỷ).
  const recentCompleted = useMemo(
    () => [...completedBookings].sort(sortByCreatedDesc).slice(0, ACTIVITY_MAX_RECENT),
    [completedBookings],
  );
  const recentCancelled = useMemo(
    () => [...cancelledMapped].sort(sortByCreatedDesc).slice(0, ACTIVITY_MAX_RECENT),
    [cancelledMapped],
  );

  const counts = useMemo(
    () => ({ active: activeBookings.length, completed: recentCompleted.length, cancelled: recentCancelled.length }),
    [activeBookings, recentCompleted, recentCancelled],
  );

  const filteredBookings = useMemo(() => {
    if (selectedStatus === 'active') return activeBookings;
    if (selectedStatus === 'completed') return recentCompleted;
    return recentCancelled;
  }, [activeBookings, recentCompleted, recentCancelled, selectedStatus]);
  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / ACTIVITY_PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pagedBookings = useMemo(() => {
    const start = (page - 1) * ACTIVITY_PAGE_SIZE;
    return filteredBookings.slice(start, start + ACTIVITY_PAGE_SIZE);
  }, [filteredBookings, page]);
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Mỗi lần mở Activity hoặc đổi sang tab "Đã huỷ" → kéo dữ liệu mới nhất từ
  // bảng `cancelled_bookings` (RPC). Polling nền vẫn chạy mỗi 15s ở context.
  useEffect(() => {
    void refreshCancelledBookings();
  }, [refreshCancelledBookings, selectedStatus]);

  const rebookSelectedServices = useMemo(() => {
    if (!rebookTarget) return [];
    return replayServicesFromBooking(rebookTarget.booking, rebookTarget.therapist);
  }, [rebookTarget]);

  const resumeSelectedServices = useMemo(() => {
    if (!resumePendingTarget) return [];
    return replayServicesFromBooking(resumePendingTarget.booking, resumePendingTarget.therapist);
  }, [resumePendingTarget]);

  const handleBookingPress = (booking: SharedBooking) => {
    setSelectedBooking(booking);
    setDetailVisible(true);
  };

  const handleRebook = async (booking: SharedBooking) => {
    try {
      const { getTherapistById } = await import('@/lib/supabaseService');
      const therapist = await getTherapistById(booking.therapistId);
      if (therapist) {
        setDetailVisible(false);
        setRebookTarget({ therapist, booking });
      } else {
        Alert.alert('Lỗi', 'Không tìm thấy kỹ thuật viên này');
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể tải thông tin kỹ thuật viên');
    }
  };

  const handleResumePending = async (booking: SharedBooking) => {
    try {
      const { getTherapistById } = await import('@/lib/supabaseService');
      const therapist = await getTherapistById(booking.therapistId);
      if (therapist) {
        setResumePendingTarget({ therapist, booking });
      } else {
        Alert.alert('Lỗi', 'Không tìm thấy kỹ thuật viên');
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể tải thông tin kỹ thuật viên');
    }
  };

  const renderBookingCard = ({ item }: { item: SharedBooking }) => {
    const showReview =
      item.status === 'completed' && !item.reviewed && !hasReviewed(item.id);
    return (
      <TouchableOpacity style={styles.bookingCard} activeOpacity={0.85} onPress={() => handleBookingPress(item)}>
        {/* Hàng 1: tên dịch vụ — pill trạng thái (luôn cùng baseline). */}
        <View style={styles.cardTopRow}>
          <Text style={styles.bookingService} numberOfLines={2}>
            {item.service}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusBgColor(item.status) }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]} numberOfLines={1}>
              {strings[item.status as keyof typeof strings] || item.status}
            </Text>
          </View>
        </View>

        {/* Hàng 2: avatar + tên KTV. */}
        <View style={styles.therapistRow}>
          {item.therapistAvatar ? (
            <Image source={{ uri: item.therapistAvatar }} style={styles.therapistAvatarImg} />
          ) : (
            <View style={styles.therapistAvatarFallback}>
              <Text style={styles.therapistAvatarFallbackText}>
                {item.therapistName?.charAt(0) || '?'}
              </Text>
            </View>
          )}
          <Text style={styles.bookingTherapist} numberOfLines={1}>
            {item.therapistName}
          </Text>
        </View>

        {/* Hàng 3: ngày + giờ. */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Feather name="calendar" size={14} color={COLORS.lightText} />
            <Text style={styles.metaText}>{item.date}</Text>
          </View>
          <Text style={styles.metaDot}>•</Text>
          <View style={styles.metaItem}>
            <Feather name="clock" size={14} color={COLORS.lightText} />
            <Text style={styles.metaText}>{item.time}</Text>
          </View>
        </View>

        {/* Hàng 4: giá + actions. */}
        <View style={styles.bookingFooter}>
          <Text style={styles.bookingPrice}>{(item.price ?? 0).toLocaleString('vi-VN')} ₫</Text>
          <View style={styles.actionButtons}>
            {item.status === 'pending' ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.resumeBtn]}
                onPress={(e) => { e.stopPropagation(); void handleResumePending(item); }}
              >
                <Feather name="refresh-cw" size={13} color="#fff" style={{ marginRight: 4 }} />
                <Text style={[styles.actionBtnText, styles.resumeBtnText]}>
                  {language === 'en' ? 'Resume' : 'Tiếp tục'}
                </Text>
              </TouchableOpacity>
            ) : null}
            {(item.status === 'confirmed' || item.status === 'in-progress') ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.chatBtn]}
                onPress={(e) => { e.stopPropagation(); setChatBookingId(item.id); }}
              >
                <Feather name="message-circle" size={13} color="#fff" style={{ marginRight: 4 }} />
                <Text style={[styles.actionBtnText, styles.chatBtnText]}>{strings.chat}</Text>
              </TouchableOpacity>
            ) : null}
            {showReview ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.reviewBtn]}
                onPress={() => {
                  setReviewBooking(item);
                  setReviewVisible(true);
                }}
              >
                <Text style={[styles.actionBtnText, styles.reviewBtnText]}>{strings.review}</Text>
              </TouchableOpacity>
            ) : null}
            {item.status === 'completed' || item.status === 'cancelled' ? (
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleRebook(item)}>
                <Text style={styles.actionBtnText}>{strings.reschedule}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderStatusFilter = () => {
    const items: { key: ActivityFilter; label: string; count: number }[] = [
      { key: 'active', label: strings.active, count: counts.active },
      { key: 'completed', label: strings.completed, count: counts.completed },
      { key: 'cancelled', label: strings.cancelled, count: counts.cancelled },
    ];
    return (
      <View style={[styles.filterWrapper, { paddingHorizontal: tabletLayout.horizontalPadding }]}>
        {items.map((it) => {
          const isActive = selectedStatus === it.key;
          return (
            <TouchableOpacity
              key={it.key}
              style={[styles.filterBtn, isActive && styles.filterBtnActive]}
              onPress={() => {
                setSelectedStatus(it.key);
                setCurrentPage(1);
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterBtnText, isActive && styles.filterBtnTextActive]} numberOfLines={1}>
                {it.label}
              </Text>
              <View style={[styles.filterBadge, isActive && styles.filterBadgeActive]}>
                <Text style={[styles.filterBadgeText, isActive && styles.filterBadgeTextActive]}>
                  {it.count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // Chưa đăng nhập
  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <View style={[styles.pageContent, tabletLayout.contentContainer]}>
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIllustration}>
              <Feather name="lock" size={36} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>{strings.noLogin}</Text>
            <Text style={styles.emptyDesc}>{strings.noLoginDesc}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/account')}>
              <Text style={styles.primaryBtnText}>{strings.signIn}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const isEmptyForTab = filteredBookings.length === 0;
  const emptyTitle =
    selectedStatus === 'active' ? strings.noBookingsActive :
    selectedStatus === 'completed' ? strings.noBookingsCompleted : strings.noBookingsCancelled;
  const emptyDesc =
    selectedStatus === 'active' ? strings.noBookingsActiveDesc :
    selectedStatus === 'completed' ? strings.noBookingsCompletedDesc : strings.noBookingsCancelledDesc;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={[styles.pageContent, tabletLayout.contentContainer]}>
        <View style={[styles.header, { paddingHorizontal: tabletLayout.horizontalPadding }]}>
          <Text style={styles.headerTitle}>{strings.myBookings}</Text>
        </View>

        {renderStatusFilter()}

        {isEmptyForTab ? (
          <ScrollView
            contentContainerStyle={[
              styles.emptyContainer,
              { paddingHorizontal: tabletLayout.horizontalPadding },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.emptyIllustration}>
              <Feather
                name={selectedStatus === 'active' ? 'clock' : selectedStatus === 'completed' ? 'check-circle' : 'x-circle'}
                size={40}
                color={selectedStatus === 'active' ? AppColors.primary : selectedStatus === 'completed' ? AppColors.success : AppColors.danger}
              />
            </View>
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptyDesc}>{emptyDesc}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/')}>
              <Text style={styles.primaryBtnText}>{strings.explore}</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <View style={styles.listWrap}>
            <FlatList
              data={pagedBookings}
              renderItem={renderBookingCard}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[styles.listContainer, { paddingHorizontal: tabletLayout.horizontalPadding }]}
              showsVerticalScrollIndicator={false}
            />
            <View style={[styles.pagingBar, { paddingHorizontal: tabletLayout.horizontalPadding }]}>
              <TouchableOpacity
                style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
                onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                activeOpacity={0.85}
              >
                <Text style={[styles.pageBtnText, page <= 1 && styles.pageBtnTextDisabled]}>
                  {strings.previousPage}
                </Text>
              </TouchableOpacity>
              <Text style={styles.pageText}>
                {strings.pageLabel} {page}/{totalPages}
              </Text>
              <TouchableOpacity
                style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
                onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                activeOpacity={0.85}
              >
                <Text style={[styles.pageBtnText, page >= totalPages && styles.pageBtnTextDisabled]}>
                  {strings.nextPage}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.latestHint}>{strings.latestLimitHint}</Text>
          </View>
        )}
      </View>

      <BookingDetailModal
        visible={detailVisible}
        booking={selectedBooking}
        onClose={() => setDetailVisible(false)}
        onRebook={handleRebook}
        onOpenChat={(bookingId) => {
          setDetailVisible(false);
          setChatBookingId(bookingId);
        }}
      />

      <Modal visible={chatBookingId !== null} animationType="slide" onRequestClose={() => setChatBookingId(null)}>
        <ModalSafeAreaProvider>
          {chatBookingId && (
            <ChatScreen
              onClose={() => setChatBookingId(null)}
              bookingId={chatBookingId}
            />
          )}
        </ModalSafeAreaProvider>
      </Modal>

      <Modal
        visible={rebookTarget !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        hardwareAccelerated
        onRequestClose={() => setRebookTarget(null)}
      >
        {rebookTarget ? (
          <View style={{ flex: 1, backgroundColor: AppColors.bg }}>
            <BookingConfirmScreen
              therapist={rebookTarget.therapist}
              selectedServices={rebookSelectedServices}
              totalPrice={rebookSelectedServices.reduce((acc, s) => acc + s.price, 0)}
              reopenBookingSnapshot={rebookTarget.booking}
              onClose={() => setRebookTarget(null)}
            />
          </View>
        ) : null}
      </Modal>

      <Modal
        visible={resumePendingTarget !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        hardwareAccelerated
        onRequestClose={() => setResumePendingTarget(null)}
      >
        {resumePendingTarget ? (
          <View style={{ flex: 1, backgroundColor: AppColors.bg }}>
            <BookingConfirmScreen
              therapist={resumePendingTarget.therapist}
              selectedServices={resumeSelectedServices}
              totalPrice={resumeSelectedServices.reduce((acc, s) => acc + s.price, 0)}
              reopenBookingSnapshot={resumePendingTarget.booking}
              resumeBookingId={resumePendingTarget.booking.id}
              onClose={() => setResumePendingTarget(null)}
            />
          </View>
        ) : null}
      </Modal>

      <ReviewModal
        visible={reviewVisible}
        booking={reviewBooking}
        onClose={() => setReviewVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  pageContent: {
    flex: 1,
    width: '100%',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  filterWrapper: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 20,
  },
  filterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.light,
    backgroundColor: AppColors.white,
  },
  filterBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  filterBtnTextActive: {
    color: AppColors.white,
  },
  filterBadge: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: AppColors.primarySoft2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  filterBadgeTextActive: {
    color: AppColors.white,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 12,
  },
  listWrap: {
    flex: 1,
  },
  pagingBar: {
    marginTop: 2,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pageBtn: {
    backgroundColor: AppColors.white,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pageBtnDisabled: {
    backgroundColor: AppColors.primarySoft2,
  },
  pageBtnText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 12,
  },
  pageBtnTextDisabled: {
    color: COLORS.lightText,
  },
  pageText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.text,
  },
  latestHint: {
    textAlign: 'center',
    color: COLORS.lightText,
    fontSize: 11.5,
    marginBottom: 10,
  },
  bookingCard: {
    backgroundColor: AppColors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.light,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  bookingService: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 21,
  },
  statusBadge: {
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  therapistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  therapistAvatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.light,
  },
  therapistAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  therapistAvatarFallbackText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  bookingTherapist: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12.5,
    color: COLORS.lightText,
    fontWeight: '600',
  },
  metaDot: {
    fontSize: 12,
    color: COLORS.lightText,
    opacity: 0.7,
  },
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.light,
  },
  bookingPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionBtnText: {
    color: AppColors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  chatBtn: {
    backgroundColor: AppColors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatBtnText: {
    color: '#fff',
  },
  reviewBtn: {
    backgroundColor: AppColors.successBg,
    borderWidth: 1,
    borderColor: AppColors.success,
  },
  reviewBtnText: {
    color: AppColors.success,
  },
  resumeBtn: {
    backgroundColor: '#e67e22',
    flexDirection: 'row',
    alignItems: 'center',
  },
  resumeBtnText: {
    color: '#fff',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
  },
  emptyIllustration: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: AppColors.primarySoft2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: AppColors.primarySoft,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.lightText,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 21,
    maxWidth: 320,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 14,
  },
  primaryBtnText: {
    color: AppColors.white,
    fontSize: 14,
    fontWeight: '800',
  },
});
