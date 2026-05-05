/**
 * Header overlay màn tìm KTV — palette Zena (AppColors).
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/appColors';

export type BookingFindingHeaderOverlayProps = {
  topInset: number;
  /** Khi không truyền → ẩn nút back. Màn chờ KTV chỉ cho phép thoát qua Huỷ đơn / KTV xác nhận / hết hạn. */
  onBack?: () => void;
  onCancel: () => void;
  cancelLabel: string;
  cityLabel: string;
  mainTitle: string;
  subTitle: string;
  statusPillText: string;
  /** Bản đồ: một khối gọn, ít chữ — giống overlay app đặt xe */
  variant?: 'default' | 'compact';
};

export default function BookingFindingHeaderOverlay({
  topInset,
  onBack,
  onCancel,
  cancelLabel,
  cityLabel,
  mainTitle,
  subTitle,
  statusPillText,
  variant = 'default',
}: BookingFindingHeaderOverlayProps) {
  if (variant === 'compact') {
    return (
      <View style={[styles.topOverlay, { top: topInset + 4 }]} pointerEvents="box-none">
        <View style={[styles.topRow, !onBack && styles.topRowEnd]}>
          {onBack ? (
            <Pressable style={styles.iconButton} onPress={onBack}>
              <Ionicons name="chevron-back" size={24} color={AppColors.text} />
            </Pressable>
          ) : null}
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.topOverlay, { top: topInset + 4 }]} pointerEvents="box-none">
      <View style={[styles.topRow, !onBack && styles.topRowEnd]}>
        {onBack ? (
          <Pressable style={styles.iconButton} onPress={onBack}>
            <Ionicons name="chevron-back" size={24} color={AppColors.text} />
          </Pressable>
        ) : null}
        <Pressable style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelText}>{cancelLabel}</Text>
        </Pressable>
      </View>

      <View style={styles.centerTopBox}>
        <LinearGradient
          colors={[AppColors.white, AppColors.bgAlt]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cityBadge}
        >
          <Ionicons name="location" size={16} color={AppColors.accent} />
          <Text style={[styles.cityBadgeText, styles.cityBadgeTextSpaced]}>{cityLabel}</Text>
        </LinearGradient>
        <Text style={styles.mainTitle}>{mainTitle}</Text>
        <Text style={styles.subTitle}>{subTitle}</Text>
      </View>

      <LinearGradient
        colors={[AppColors.accentSoft2, AppColors.white]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.statusPill}
      >
        <View style={styles.statusIconWrap}>
          <Ionicons name="sparkles" size={17} color={AppColors.accent} />
        </View>
        <Text style={styles.statusText} numberOfLines={2}>
          {statusPillText}
        </Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  topOverlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topRowEnd: {
    justifyContent: 'flex-end',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: AppColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cancelButton: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: AppColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: AppColors.primary,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cancelText: {
    color: AppColors.primaryDark,
    fontWeight: '800',
    fontSize: 15,
  },
  centerTopBox: {
    alignItems: 'center',
    marginTop: 14,
  },
  cityBadge: {
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cityBadgeText: {
    color: AppColors.primaryDark,
    fontWeight: '800',
    fontSize: 15,
  },
  cityBadgeTextSpaced: { marginLeft: 8 },
  mainTitle: {
    marginTop: 12,
    fontSize: 21,
    fontWeight: '800',
    color: AppColors.text,
    textAlign: 'center',
    letterSpacing: -0.4,
    paddingHorizontal: 12,
  },
  subTitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 19,
  },
  statusPill: {
    marginTop: 14,
    alignSelf: 'center',
    maxWidth: '94%',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(13, 180, 108, 0.22)',
    shadowColor: AppColors.accent,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  statusIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: AppColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  statusText: {
    color: AppColors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    lineHeight: 18,
  },
});
