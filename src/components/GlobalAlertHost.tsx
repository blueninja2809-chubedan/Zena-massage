import { AppColors } from '@/constants/appColors';
import { installAppAlertOverride, subscribeAppAlert, type AppAlertPayload } from '@/lib/appAlert';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type QueuedAlert = Required<Pick<AppAlertPayload, 'title'>> &
  Pick<AppAlertPayload, 'message' | 'buttons' | 'options'>;

export default function GlobalAlertHost() {
  const [queue, setQueue] = React.useState<QueuedAlert[]>([]);

  React.useEffect(() => {
    installAppAlertOverride();
    return subscribeAppAlert((payload) => {
      setQueue((prev) => [...prev, { title: payload.title, message: payload.message, buttons: payload.buttons, options: payload.options }]);
    });
  }, []);

  const current = queue[0];
  const visible = Boolean(current);
  const buttons = React.useMemo(() => {
    if (!current) return [{ text: 'Đóng' }];
    const raw =
      !current.buttons || current.buttons.length === 0
        ? [{ text: 'Đóng' }]
        : current.buttons.slice(0, 3);
    // Đưa nút `cancel` xuống cuối → nút primary (vd. "Đăng nhập") luôn nằm phía trên nút "Huỷ".
    // Sort stable: chỉ đẩy cancel về cuối, các nút khác giữ nguyên thứ tự gọi.
    return [...raw].sort((a, b) => {
      const aCancel = a.style === 'cancel' ? 1 : 0;
      const bCancel = b.style === 'cancel' ? 1 : 0;
      return aCancel - bCancel;
    });
  }, [current]);

  const closeCurrent = React.useCallback((idx: number) => {
    if (!current) return;
    const btn = buttons[idx];
    setQueue((prev) => prev.slice(1));
    btn?.onPress?.();
  }, [buttons, current]);

  if (!current) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (current.options?.cancelable) closeCurrent(buttons.length - 1);
      }}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          if (current.options?.cancelable) closeCurrent(buttons.length - 1);
        }}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}

          <View style={styles.actions}>
            {buttons.map((btn, idx) => {
              // Primary = bất kỳ nút nào KHÔNG phải `cancel` (đã được đẩy xuống cuối ở trên).
              // Cách này đảm bảo trong cặp 2 nút (Huỷ + Đăng nhập), Đăng nhập nằm trên & là primary.
              const isPrimary = btn.style !== 'cancel';
              const isDestructive = btn.style === 'destructive';
              return (
                <Pressable
                  key={`${btn.text ?? 'button'}-${idx}`}
                  style={[
                    styles.button,
                    isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
                    isDestructive ? styles.buttonDanger : null,
                  ]}
                  onPress={() => closeCurrent(idx)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isPrimary ? styles.buttonTextPrimary : styles.buttonTextSecondary,
                    ]}
                  >
                    {btn.text ?? 'Đóng'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(22, 16, 10, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: AppColors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: AppColors.primarySoft,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: {
    color: AppColors.primaryDark,
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 8,
  },
  message: {
    color: AppColors.text,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  actions: {
    gap: 10,
  },
  button: {
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  buttonPrimary: {
    backgroundColor: AppColors.primary,
  },
  buttonSecondary: {
    backgroundColor: AppColors.primarySoft2,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  buttonDanger: {
    backgroundColor: AppColors.danger,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  buttonTextPrimary: {
    color: AppColors.white,
  },
  buttonTextSecondary: {
    color: AppColors.text,
  },
});
