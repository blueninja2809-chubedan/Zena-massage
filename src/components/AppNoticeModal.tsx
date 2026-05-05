import { ModalSafeAreaProvider } from '@/components/ModalSafeAreaProvider';
import { AppColors } from '@/constants/appColors';
import React from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AppNoticeModalProps = {
  visible: boolean;
  title: string;
  message: string;
  primaryText: string;
  onPrimaryPress: () => void;
  secondaryText?: string;
  onSecondaryPress?: () => void;
  dismissable?: boolean;
  variant?: 'default' | 'success' | 'danger';
};

export default function AppNoticeModal({
  visible,
  title,
  message,
  primaryText,
  onPrimaryPress,
  secondaryText,
  onSecondaryPress,
  dismissable = true,
  variant = 'default',
}: AppNoticeModalProps) {
  const accentColor =
    variant === 'success' ? AppColors.success : variant === 'danger' ? AppColors.danger : AppColors.primaryDark;

  const onRequestClose = dismissable
    ? onPrimaryPress
    : () => {
        /* Android hardware back: không đóng modal bắt buộc (ví dụ bắt cập nhật). */
      };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <ModalSafeAreaProvider>
        <SafeAreaView style={styles.safeRoot} edges={['top', 'right', 'left', 'bottom']}>
          <View style={styles.backdrop}>
            <View style={styles.card}>
              <Text style={[styles.title, { color: accentColor }]}>{title}</Text>
              <Text style={styles.message}>{message}</Text>

              <View style={styles.actions}>
                {secondaryText && onSecondaryPress ? (
                  <TouchableOpacity style={styles.secondaryBtn} onPress={onSecondaryPress} activeOpacity={0.85}>
                    <Text style={styles.secondaryText}>{secondaryText}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: accentColor }]}
                  onPress={onPrimaryPress}
                  activeOpacity={0.88}
                >
                  <Text style={styles.primaryText}>{primaryText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </ModalSafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: AppColors.white,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.text,
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  secondaryBtn: {
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: AppColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.textMuted,
  },
  primaryBtn: {
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
});
