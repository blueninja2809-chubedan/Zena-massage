import React from 'react';
import { AppState } from 'react-native';

import { useUser } from '@/contexts/UserContext';
import { refreshCustomerLocation, requestForegroundLocationPermission } from '@/lib/location';
import { updateTherapistLiveLocation } from '@/lib/supabaseService';

/**
 * Không chặn UI: Apple từ chối khi ép cấp vị trí mới được dùng app.
 *
 * - Lúc mount & mỗi lần app vào foreground: nếu quyền còn `undetermined` thì gọi prompt hệ thống;
 *   khi đã granted → đồng bộ vị trí KTV (server validate role).
 * - Không modal full-screen — người dùng có thể từ chối và vẫn dùng app (km/sort có thể kém chính xác hơn).
 */
export default function AppLocationBootstrap() {
  const { user } = useUser();
  const userId = user?.authUid;

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

  const syncIfGranted = React.useCallback(async () => {
    await requestForegroundLocationPermission();
    await syncTherapistLocation();
  }, [syncTherapistLocation]);

  React.useEffect(() => {
    void syncIfGranted();
  }, [syncIfGranted]);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void syncIfGranted();
    });
    return () => sub.remove();
  }, [syncIfGranted]);

  return null;
}
