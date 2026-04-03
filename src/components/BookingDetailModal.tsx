import type { SharedBooking } from '@/contexts/BookingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { AppColors } from '@/constants/appColors';

const COLORS = {
  primary: AppColors.primary,
  dark: AppColors.primaryDark,
  bg: AppColors.bg,
  text: AppColors.text,
  lightText: AppColors.textMuted,
  success: AppColors.success,
  successBg: AppColors.successBg,
  cancel: AppColors.danger,
  cancelBg: AppColors.dangerBg,
  pending: '#E65100',
  pendingBg: '#FFF3E0',
  confirmed: AppColors.primaryDark,
  confirmedBg: AppColors.accentSoft,
  divider: AppColors.border,
  white: AppColors.white,
  grey: AppColors.primarySoft2,
};

const translations = {
  vi: {
    title: 'Chi tiết đơn',
    code: 'Mã:',
    workTime: 'Giờ làm việc:',
    paymentMethod: 'Phương thức thanh toán:',
    cash: 'Tiền mặt',
    cancelReason: 'Lý do huỷ:',
    noReason: 'Không có lý do',
    totalServices: 'Tổng',
    service: 'dịch vụ',
    minutes: 'phút',
    rebook: 'Đặt lại',
    complain: 'Khiếu nại',
    cancelled: 'Đã huỷ',
    completed: 'Hoàn thành',
    confirmed: 'Đã xác nhận',
    pending: 'Chờ xác nhận',
    'in-progress': 'Đang thực hiện',
    reviews: 'đánh giá',
    therapist: 'Kỹ thuật viên',
  },
  en: {
    title: 'Order Detail',
    code: 'Code:',
    workTime: 'Work time:',
    paymentMethod: 'Payment method:',
    cash: 'Cash',
    cancelReason: 'Cancellation reason:',
    noReason: 'No reason provided',
    totalServices: 'Total',
    service: 'service',
    minutes: 'min',
    rebook: 'Rebook',
    complain: 'Complain',
    cancelled: 'Cancelled',
    completed: 'Completed',
    confirmed: 'Confirmed',
    pending: 'Pending',
    'in-progress': 'In Progress',
    reviews: 'reviews',
    therapist: 'Therapist',
  },
};

interface BookingDetailModalProps {
  visible: boolean;
  booking: SharedBooking | null;
  onClose: () => void;
  onRebook?: (booking: SharedBooking) => void;
  onOpenChat?: (bookingId: string) => void;
}

function StatusIllustration({ status }: { status: string }) {
  const isSuccess = status === 'completed';
  const isCancelled = status === 'cancelled';
  const isPending = status === 'pending';
  const isConfirmed = status === 'confirmed' || status === 'in-progress';

  let iconName: keyof typeof Feather.glyphMap = 'check-circle';
  let bgColor = '#E8F5E9';

  if (isCancelled) {
    iconName = 'x-circle';
    bgColor = AppColors.dangerBg;
  } else if (isPending) {
    iconName = 'clock';
    bgColor = '#FFF3E0';
  } else if (isConfirmed) {
    iconName = 'check-circle';
    bgColor = AppColors.accentSoft;
  } else if (isSuccess) {
    iconName = 'check-circle';
    bgColor = '#E8F5E9';
  }

  return (
    <View style={[styles.illustrationContainer, { backgroundColor: bgColor }]}>
      <View style={styles.cloudRow}>
        <View style={[styles.cloud, styles.cloudSmall]} />
        <View style={[styles.cloud, styles.cloudMedium]} />
        <View style={[styles.cloud, styles.cloudSmall, { marginLeft: 20 }]} />
      </View>
      <View style={[styles.iconCircle, { backgroundColor: isCancelled ? AppColors.danger : isSuccess ? '#43A047' : isPending ? '#EF6C00' : AppColors.accent }]}>
        <Feather name={iconName} size={60} color="#FFFFFF" />
      </View>
    </View>
  );
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function getStatusLabel(status: string, strings: Record<string, string>): string {
  return strings[status] || status;
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'cancelled':
      return { color: COLORS.cancel, bg: COLORS.cancelBg };
    case 'completed':
      return { color: COLORS.success, bg: COLORS.successBg };
    case 'confirmed':
    case 'in-progress':
      return { color: COLORS.confirmed, bg: COLORS.confirmedBg };
    case 'pending':
      return { color: COLORS.pending, bg: COLORS.pendingBg };
    default:
      return { color: COLORS.text, bg: COLORS.grey };
  }
}

export default function BookingDetailModal({
  visible,
  booking,
  onClose,
  onRebook,
  onOpenChat,
}: BookingDetailModalProps) {
  const { language } = useLanguage();
  const strings = translations[language as keyof typeof translations] || translations.vi;

  if (!booking) return null;

  const statusStyle = getStatusStyle(booking.status);
  const isCancelled = booking.status === 'cancelled';
  const isCompleted = booking.status === 'completed';
  const shortId = booking.id.toUpperCase().replace(/-/g, '');

  // Extract time from booking
  const timeDisplay = booking.time;
  const dateDisplay = formatDate(booking.date);

  // Estimate duration from time range (e.g., "14:00 - 15:30" = 90 min)
  let durationMinutes = 60;
  const timeParts = booking.time.split(' - ');
  if (timeParts.length === 2) {
    const left = timeParts[0].trim();
    const right = timeParts[1].trim();

    // Support both "14:00 - 15:30" and "08h - 10h" formats.
    if (left.includes(':') && right.includes(':')) {
      const [startH, startM] = left.split(':').map(Number);
      const [endH, endM] = right.split(':').map(Number);
      durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    } else {
      const leftMatch = left.match(/(\d+)\s*h/i);
      const rightMatch = right.match(/(\d+)\s*h/i);
      const startH = leftMatch ? Number(leftMatch[1]) : NaN;
      const endH = rightMatch ? Number(rightMatch[1]) : NaN;
      if (!Number.isNaN(startH) && !Number.isNaN(endH)) {
        // Handle wrap-around like "22h - 0h".
        const diffHours = endH >= startH ? endH - startH : endH + 24 - startH;
        durationMinutes = diffHours * 60;
      }
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) durationMinutes = 60;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Feather name="arrow-left" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{strings.title}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Status Illustration */}
          <StatusIllustration status={booking.status} />

          {/* Order Info Card */}
          <View style={styles.card}>
            {/* Code + Status */}
            <View style={styles.codeRow}>
              <View style={styles.codeInfo}>
                <Text style={styles.codeLabel}>{strings.code} {shortId}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusText, { color: statusStyle.color }]}>
                  {getStatusLabel(booking.status, strings)}
                </Text>
              </View>
            </View>

            {/* Work time */}
            <View style={styles.infoRow}>
              <Feather name="clock" size={16} color={COLORS.lightText} />
              <Text style={styles.infoLabel}>{strings.workTime}</Text>
              <Text style={styles.infoValue}>
                {timeDisplay.split(' - ')[0]} {dateDisplay}
              </Text>
            </View>

            {/* Payment method */}
            <View style={styles.infoRow}>
              <Feather name="credit-card" size={16} color={COLORS.lightText} />
              <Text style={styles.infoLabel}>{strings.paymentMethod}</Text>
              <Text style={styles.infoValue}>{strings.cash}</Text>
            </View>

            {/* Cancel reason (only for cancelled bookings) */}
            {isCancelled && (
              <View style={styles.infoRow}>
                <Feather name="message-circle" size={16} color={COLORS.lightText} />
                <Text style={styles.infoLabel}>{strings.cancelReason}</Text>
              </View>
            )}
          </View>

          {/* Service Card */}
          <View style={styles.card}>
            <View style={styles.serviceRow}>
              <Text style={styles.serviceName}>{booking.service}</Text>
              <View style={styles.durationRow}>
                <Feather name="clock" size={14} color={COLORS.lightText} />
                <Text style={styles.durationText}>
                  {durationMinutes} {strings.minutes}
                </Text>
              </View>
            </View>

            <View style={styles.dashedDivider} />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {strings.totalServices} 1 {strings.service}
              </Text>
              <Text style={styles.totalPrice}>
                {booking.price?.toLocaleString('vi-VN')} đ
              </Text>
            </View>
          </View>

          {/* Therapist Card */}
          <View style={styles.card}>
            <View style={styles.therapistRow}>
              <View style={styles.therapistAvatar}>
                <Text style={styles.avatarEmoji}>💆‍♀️</Text>
              </View>
              <View style={styles.therapistInfo}>
                <View style={styles.therapistNameRow}>
                  <Text style={styles.therapistName}>{booking.therapistName}</Text>
                  <Feather name="chevron-right" size={18} color={COLORS.lightText} />
                </View>
                <View style={styles.ratingRow}>
                  <Text style={styles.ratingStar}>⭐</Text>
                  <Text style={styles.ratingText}>5.0</Text>
                  <Text style={styles.reviewCount}>(151 {strings.reviews})</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.heartBtn}>
                <Feather name="heart" size={22} color={COLORS.lightText} />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Bottom Actions */}
        <View style={styles.bottomActions}>
          {(booking.status === 'confirmed' || booking.status === 'in-progress' || booking.status === 'pending') && onOpenChat && (
            <TouchableOpacity
              style={[styles.rebookBtn, { backgroundColor: '#5F8F47' }]}
              onPress={() => onOpenChat(booking.id)}
              activeOpacity={0.8}
            >
              <Feather name="message-circle" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.rebookBtnText}>
                {language === 'en' ? 'Chat with Therapist' : 'Chat với KTV'}
              </Text>
            </TouchableOpacity>
          )}
          {(isCancelled || isCompleted) && (
            <>
              <TouchableOpacity
                style={styles.rebookBtn}
                onPress={() => onRebook?.(booking)}
                activeOpacity={0.8}
              >
                <Text style={styles.rebookBtnText}>{strings.rebook}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.complainBtn} activeOpacity={0.8}>
                <Text style={styles.complainBtnText}>{strings.complain}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 14,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Illustration
  illustrationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    marginBottom: 0,
  },
  cloudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cloud: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 20,
  },
  cloudSmall: {
    width: 40,
    height: 18,
    borderRadius: 9,
  },
  cloudMedium: {
    width: 60,
    height: 24,
    borderRadius: 12,
    marginHorizontal: 10,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },

  // Cards
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  // Code row
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  codeInfo: {
    flex: 1,
  },
  codeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: COLORS.lightText,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },

  // Service
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    fontSize: 13,
    color: COLORS.lightText,
  },
  dashedDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    borderStyle: 'dashed',
    marginBottom: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  totalPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.cancel,
  },

  // Therapist
  therapistRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  therapistAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.grey,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarEmoji: {
    fontSize: 28,
  },
  therapistInfo: {
    flex: 1,
  },
  therapistNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  therapistName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingStar: {
    fontSize: 13,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  reviewCount: {
    fontSize: 12,
    color: COLORS.lightText,
  },
  heartBtn: {
    padding: 8,
  },

  // Bottom Actions
  bottomActions: {
    paddingHorizontal: 16,
    paddingBottom: 34,
    paddingTop: 12,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  rebookBtn: {
    backgroundColor: '#3E6B47',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  rebookBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  complainBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  complainBtnText: {
    color: '#3E6B47',
    fontSize: 15,
    fontWeight: '700',
  },
});
