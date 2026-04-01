import type { SharedBooking } from '@/contexts/BookingsContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import Feather from '@expo/vector-icons/Feather';
import React, { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const COLORS = {
  primary: '#E53935',
  text: '#1A1A1A',
  lightText: '#4B5563',
  bg: '#F5F5F5',
  cardBg: '#FFFBFB',
  white: '#FFFFFF',
  divider: '#E8E8E8',
  gold: '#FFA000',
  goldBg: '#FFF8E1',
  green: '#3E6B47',
  greenLight: '#E8F5E9',
  successBg: '#E8F5E9',
};

const translations = {
  vi: {
    title: 'Đánh giá dịch vụ',
    ratePrompt: 'Bạn đánh giá dịch vụ này thế nào?',
    commentPlaceholder: 'Chia sẻ trải nghiệm của bạn về dịch vụ, kỹ thuật viên...',
    submit: 'Gửi đánh giá',
    cancel: 'Huỷ',
    success: 'Cảm ơn bạn!',
    successMsg: 'Đánh giá của bạn đã được gửi thành công.',
    errorNoRating: 'Vui lòng chọn số sao đánh giá',
    starLabels: ['Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Tuyệt vời'],
    minutes: 'phút',
    totalServices: 'Tổng',
    service: 'dịch vụ',
    reviews: 'đánh giá',
  },
  en: {
    title: 'Rate Service',
    ratePrompt: 'How was your experience?',
    commentPlaceholder: 'Share your experience about the service, therapist...',
    submit: 'Submit Review',
    cancel: 'Cancel',
    success: 'Thank you!',
    successMsg: 'Your review has been submitted successfully.',
    errorNoRating: 'Please select a star rating',
    starLabels: ['Terrible', 'Bad', 'Average', 'Good', 'Excellent'],
    minutes: 'min',
    totalServices: 'Total',
    service: 'service',
    reviews: 'reviews',
  },
};

interface ReviewModalProps {
  visible: boolean;
  booking: SharedBooking | null;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

export default function ReviewModal({ visible, booking, onClose }: ReviewModalProps) {
  const { language } = useLanguage();
  const { addReview } = useBookings();
  const strings = translations[language as keyof typeof translations] || translations.vi;

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const handleSubmit = () => {
    if (rating === 0) {
      Alert.alert('', strings.errorNoRating);
      return;
    }
    if (!booking) return;

    addReview({
      bookingId: booking.id,
      therapistId: booking.therapistId,
      therapistName: booking.therapistName,
      customerPhone: booking.customerPhone,
      customerName: booking.customerName,
      rating,
      comment: comment.trim(),
      service: booking.service,
    });

    Alert.alert(strings.success, strings.successMsg);
    setRating(0);
    setComment('');
    onClose();
  };

  const handleClose = () => {
    setRating(0);
    setComment('');
    onClose();
  };

  if (!booking) return null;

  // Estimate duration from time range
  let durationMinutes = 60;
  const timeParts = booking.time.split(' - ');
  if (timeParts.length === 2) {
    const [startH, startM] = timeParts[0].split(':').map(Number);
    const [endH, endM] = timeParts[1].split(':').map(Number);
    durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (durationMinutes <= 0) durationMinutes = 60;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.backBtn}>
            <Feather name="arrow-left" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{strings.title}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Star Illustration Area */}
          <View style={styles.illustrationArea}>
            <View style={styles.starCircle}>
              <Feather name="star" size={50} color="#FFF" />
            </View>
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
                <Text style={styles.therapistName}>{booking.therapistName}</Text>
                <Text style={styles.dateInfo}>
                  📅 {formatDate(booking.date)} • 🕐 {booking.time}
                </Text>
              </View>
            </View>
          </View>

          {/* Rating Card */}
          <View style={styles.card}>
            <Text style={styles.ratePrompt}>{strings.ratePrompt}</Text>

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => {
                const isActive = star <= rating;
                return (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRating(star)}
                    activeOpacity={0.7}
                    style={[styles.starBtn, isActive && styles.starBtnActive]}
                  >
                    <Text style={[styles.starIcon, isActive && styles.starActive]}>
                      ★
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {rating > 0 && (
              <View style={styles.starLabelContainer}>
                <Text style={styles.starLabel}>{strings.starLabels[rating - 1]}</Text>
              </View>
            )}
          </View>

          {/* Comment Card */}
          <View style={styles.card}>
            <TextInput
              style={styles.commentInput}
              placeholder={strings.commentPlaceholder}
              placeholderTextColor={COLORS.lightText}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        {/* Bottom Action */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={[styles.submitBtn, rating === 0 && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.8}
          >
            <Feather name="send" size={18} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.submitBtnText}>{strings.submit}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
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
  illustrationArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    backgroundColor: COLORS.goldBg,
  },
  starCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
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
    color: COLORS.primary,
  },

  // Therapist
  therapistRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  therapistAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarEmoji: {
    fontSize: 26,
  },
  therapistInfo: {
    flex: 1,
  },
  therapistName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 3,
  },
  dateInfo: {
    fontSize: 12,
    color: COLORS.lightText,
  },

  // Rating
  ratePrompt: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  starBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  starBtnActive: {
    backgroundColor: COLORS.goldBg,
  },
  starIcon: {
    fontSize: 28,
    color: '#CCC',
  },
  starActive: {
    color: COLORS.gold,
  },
  starLabelContainer: {
    alignItems: 'center',
  },
  starLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gold,
    backgroundColor: COLORS.goldBg,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Comment
  commentInput: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 110,
    borderWidth: 1,
    borderColor: COLORS.divider,
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
  submitBtn: {
    backgroundColor: COLORS.green,
    borderRadius: 28,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
