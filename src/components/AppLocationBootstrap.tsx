import React from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/appColors';
import { useUser } from '@/contexts/UserContext';
import {
  getLocationPermissionStatus,
  refreshCustomerLocation,
  requestForegroundLocationPermission,
  type LocationPermissionStatus,
} from '@/lib/location';
import { updateTherapistLiveLocation } from '@/lib/supabaseService';

/**
 * Bắt buộc cấp quyền truy cập vị trí trước khi sử dụng app:
 * - Lúc mount & mỗi lần app trở lại foreground, kiểm tra trạng thái permission.
 * - `undetermined` → tự động prompt.
 * - `denied` → hiển thị Modal CHẶN toàn app, có nút mở Cài đặt + Thử lại.
 * - `granted` → ẩn modal, đồng bộ vị trí KTV (server-side validate role).
 */
export default function AppLocationBootstrap() {
  const { user } = useUser();
  const userId = user?.authUid;

  const [permission, setPermission] = React.useState<LocationPermissionStatus | null>(null);
  const [requesting, setRequesting] = React.useState(false);

  const syncTherapistLocation = React.useCallback(async () => {
    const coords = await refreshCustomerLocation({ askPermissionIfNeeded: false });
    if (!coords || !userId) {
      return;
    }
    try {
      await updateTherapistLiveLocation(userId, coords);
    } catch {
      // Non-blocking sync.
    }
  }, [userId]);

  const ensurePermission = React.useCallback(async (): Promise<LocationPermissionStatus> => {
    setRequesting(true);
    try {
      const current = await getLocationPermissionStatus();
      if (current === 'granted') {
        setPermission('granted');
        return 'granted';
      }
      const next = await requestForegroundLocationPermission();
      setPermission(next);
      return next;
    } finally {
      setRequesting(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await ensurePermission();
      if (cancelled) return;
      if (status === 'granted') {
        await syncTherapistLocation();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ensurePermission, syncTherapistLocation]);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void (async () => {
        // Khi user trở lại từ Settings, re-check permission.
        const current = await getLocationPermissionStatus();
        setPermission(current);
        if (current === 'granted') {
          await syncTherapistLocation();
        }
      })();
    });
    return () => sub.remove();
  }, [syncTherapistLocation]);

  const handleRetry = React.useCallback(async () => {
    const status = await ensurePermission();
    if (status === 'granted') {
      await syncTherapistLocation();
    }
  }, [ensurePermission, syncTherapistLocation]);

  const handleOpenSettings = React.useCallback(() => {
    void Linking.openSettings().catch(() => {
      // Best effort — nếu OS không mở được Settings, user sẽ thấy nút "Thử lại".
    });
  }, []);

  // Chỉ render Modal khi đã xác định trạng thái và KHÔNG phải granted.
  // (granted = ẩn hoàn toàn để không che UI app.)
  const blocking = permission !== null && permission !== 'granted';

  return (
    <Modal
      visible={blocking}
      transparent
      animationType="fade"
      // Không cho dismiss bằng back/swipe — bắt buộc bấm 1 trong 2 nút.
      onRequestClose={() => {}}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Cần quyền truy cập vị trí</Text>
          <Text style={styles.message}>
            Zena cần quyền truy cập vị trí để hiển thị khoảng cách chính xác đến kỹ thuật viên,
            đặt lịch tận nơi và sắp xếp KTV gần bạn nhất. Vui lòng cấp quyền để tiếp tục sử dụng app.
          </Text>

          {requesting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={AppColors.primaryDark} />
              <Text style={styles.loadingText}>Đang kiểm tra quyền…</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
            onPress={handleOpenSettings}
            disabled={requesting}
          >
            <Text style={styles.primaryBtnText}>Mở Cài đặt</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
            onPress={handleRetry}
            disabled={requesting}
          >
            <Text style={styles.secondaryBtnText}>Thử lại</Text>
          </Pressable>

          <Text style={styles.hint}>
            Sau khi bật quyền &quot;Vị trí&quot; trong Cài đặt, quay lại app — màn hình này sẽ tự ẩn.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(22, 16, 10, 0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: AppColors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: AppColors.primarySoft,
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 12,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  title: {
    color: AppColors.primaryDark,
    fontSize: 20,
    fontWeight: '800',
  },
  message: {
    color: AppColors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  loadingText: {
    color: AppColors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  primaryBtn: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: AppColors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryBtn: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: AppColors.primarySoft2,
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: AppColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  btnPressed: {
    opacity: 0.85,
  },
  hint: {
    color: AppColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});
