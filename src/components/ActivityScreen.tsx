import { useBookings, type SharedBooking } from '@/contexts/BookingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import type { Therapist } from '@/lib/types';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BookingDetailModal from './BookingDetailModal';
import ChatScreen from './ChatScreen';
import ReviewModal from './ReviewModal';
import TherapistDetailScreen from './TherapistDetailScreen';

const COLORS = {
  primary: '#2196F3',
  dark: '#1565C0',
  light: '#90CAF9',
  bg: '#F5F9FF',
  text: '#1A1A1A',
  lightText: '#5C85B0',
  accent: '#42A5F5',
};

const translations = {
  vi: {
    activity: 'Lịch sử hoạt động',
    myBookings: 'Đặt lịch của tôi',
    noLogin: 'Vui lòng đăng nhập',
    noLoginDesc: 'Bạn cần đăng nhập để xem lịch sử đặt lịch',
    signIn: 'Đăng nhập',
    noBookings: 'Chưa có đặt lịch nào',
    noBookingsDesc: 'Hãy khám phá và đặt lịch massage ngay',
    explore: 'Khám phá dịch vụ',
    all: 'Tất cả',
    upcoming: 'Sắp tới',
    completed: 'Hoàn thành',
    cancelled: 'Đã hủy',
    pending: 'Chờ xác nhận',
    confirmed: 'Đã xác nhận',
    date: 'Ngày:',
    time: 'Giờ:',
    therapist: 'Kỹ thuật viên:',
    service: 'Dịch vụ:',
    price: 'Giá:',
    loading: 'Đang tải...',
    cancel: 'Hủy đặt lịch',
    reschedule: 'Đặt lại',
    review: 'Đánh giá',
  },
  en: {
    activity: 'Activity History',
    myBookings: 'My Bookings',
    noLogin: 'Please Sign In',
    noLoginDesc: 'Sign in to view your booking history',
    signIn: 'Sign In',
    noBookings: 'No bookings yet',
    noBookingsDesc: 'Explore and book a massage service now',
    explore: 'Explore Services',
    all: 'All',
    upcoming: 'Upcoming',
    completed: 'Completed',
    cancelled: 'Cancelled',
    pending: 'Pending',
    confirmed: 'Confirmed',
    date: 'Date:',
    time: 'Time:',
    therapist: 'Therapist:',
    service: 'Service:',
    price: 'Price:',
    loading: 'Loading...',
    cancel: 'Cancel Booking',
    reschedule: 'Reschedule',
    review: 'Review',
  },
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'confirmed':
      return '#2196F3';
    case 'pending':
      return '#A73A49';
    case 'completed':
      return '#7A4B52';
    case 'cancelled':
      return '#C4455A';
    default:
      return COLORS.primary;
  }
};

const getStatusBgColor = (status: string) => {
  switch (status) {
    case 'confirmed':
      return '#F9E9EC';
    case 'pending':
      return '#F6DEE2';
    case 'completed':
      return '#F2E8EA';
    case 'cancelled':
      return '#FBE9EC';
    default:
      return COLORS.light;
  }
};

export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { language } = useLanguage();
  const { getCustomerBookings, updateStatus, hasReviewed } = useBookings();
  const strings = translations[language as keyof typeof translations] || translations.vi;
  const userIdentifier = user?.phoneNumber || user?.email || '';

  const allBookings = useMemo(
    () => (userIdentifier ? getCustomerBookings(userIdentifier) : []),
    [getCustomerBookings, userIdentifier],
  );

  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<SharedBooking | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [rebookTherapist, setRebookTherapist] = useState<Therapist | null>(null);
  const [reviewBooking, setReviewBooking] = useState<SharedBooking | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [chatBookingId, setChatBookingId] = useState<string | null>(null);

  const filteredBookings = useMemo(() => {
    if (!selectedStatus) return allBookings;
    return allBookings.filter((b) => b.status === selectedStatus);
  }, [allBookings, selectedStatus]);

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
        setRebookTherapist(therapist);
      } else {
        Alert.alert('Lỗi', 'Không tìm thấy kỹ thuật viên này');
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể tải thông tin kỹ thuật viên');
    }
  };

  const renderBookingCard = ({ item }: { item: SharedBooking }) => (
    <TouchableOpacity style={styles.bookingCard} activeOpacity={0.8} onPress={() => handleBookingPress(item)}>
      <View style={styles.bookingHeader}>
        <View style={styles.bookingInfo}>
          <Text style={styles.bookingService}>{item.service}</Text>
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
            <Text style={styles.bookingTherapist}>{item.therapistName}</Text>
          </View>
        </View>
        <View
          style={[styles.statusBadge, { backgroundColor: getStatusBgColor(item.status) }]}
        >
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {strings[item.status as keyof typeof strings] || item.status}
          </Text>
        </View>
      </View>

      <Text style={styles.bookingDate}>
        📅 {item.date} • 🕐 {item.time}
      </Text>

      <View style={styles.bookingFooter}>
        <Text style={styles.bookingPrice}>₫ {item.price?.toLocaleString()}</Text>
        <View style={styles.actionButtons}>
          {item.status === 'confirmed' && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={() => updateStatus(item.id, 'cancelled')}
            >
              <Text style={[styles.actionBtnText, styles.cancelBtnText]}>
                {strings.cancel}
              </Text>
            </TouchableOpacity>
          )}
          {(item.status === 'cancelled' || item.status === 'completed') && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleRebook(item)}
            >
              <Text style={styles.actionBtnText}>{strings.reschedule}</Text>
            </TouchableOpacity>
          )}
          {item.status === 'completed' && !item.reviewed && !hasReviewed(item.id) && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.reviewBtn]}
              onPress={() => { setReviewBooking(item); setReviewVisible(true); }}
            >
              <Text style={[styles.actionBtnText, styles.reviewBtnText]}>{strings.review}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderStatusFilter = () => {
    const statuses = ['all', 'confirmed', 'pending', 'completed', 'cancelled'];
    return (
      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {statuses.map((item) => {
            const isActive = selectedStatus === item || (selectedStatus === null && item === 'all');
            return (
              <TouchableOpacity
                key={item}
                style={[styles.filterBtn, isActive && styles.filterBtnActive]}
                onPress={() => setSelectedStatus(item === 'all' ? null : item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterBtnText, isActive && styles.filterBtnTextActive]}>
                  {strings[item as keyof typeof strings] || item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  // Loading
  if (!user) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔐</Text>
          <Text style={styles.emptyTitle}>{strings.noLogin}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/account')}>
            <Text style={styles.primaryBtnText}>{strings.signIn}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // No bookings
  if (allBookings.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{strings.myBookings}</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyTitle}>{strings.noBookings}</Text>
          <Text style={styles.emptyDesc}>{strings.noBookingsDesc}</Text>
          <TouchableOpacity style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>{strings.explore}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Has bookings
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{strings.myBookings}</Text>
      </View>

      {renderStatusFilter()}

      <FlatList
        data={filteredBookings}
        renderItem={renderBookingCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />

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
        {chatBookingId && (
          <ChatScreen
            onClose={() => setChatBookingId(null)}
            bookingId={chatBookingId}
          />
        )}
      </Modal>

      <Modal visible={rebookTherapist !== null} animationType="slide">
        {rebookTherapist && (
          <TherapistDetailScreen
            therapist={rebookTherapist}
            onClose={() => setRebookTherapist(null)}
          />
        )}
      </Modal>

      <ReviewModal
        visible={reviewVisible}
        booking={reviewBooking}
        onClose={() => setReviewVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
  },
  filterWrapper: {
    marginBottom: 8,
  },
  filterContainer: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: COLORS.light,
    backgroundColor: '#fff',
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.lightText,
  },
  filterBtnTextActive: {
    color: '#fff',
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  bookingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.light,
    marginBottom: 8,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  bookingInfo: {
    flex: 1,
  },
  bookingService: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  bookingTherapist: {
    fontSize: 12,
    color: COLORS.lightText,
  },
  therapistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  therapistAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.light,
  },
  therapistAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  therapistAvatarFallbackText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  bookingDate: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '500',
    marginBottom: 6,
  },
  bookingClient: {
    fontSize: 12,
    color: COLORS.lightText,
    marginBottom: 10,
  },
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.light,
  },
  bookingPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  cancelBtn: {
    backgroundColor: '#FBE9EC',
  },
  cancelBtnText: {
    color: '#42A5F5',
  },
  reviewBtn: {
    backgroundColor: '#E8F5E9',
  },
  reviewBtnText: {
    color: '#2E7D32',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.lightText,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.lightText,
  },
});
