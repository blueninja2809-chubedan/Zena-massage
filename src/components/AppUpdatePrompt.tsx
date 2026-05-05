import AppNoticeModal from '@/components/AppNoticeModal';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import React from 'react';
import { Alert, AppState, AppStateStatus, Platform } from 'react-native';
import { storeNeedUpdate } from '@/lib/storeNeedUpdate';

const IOS_APP_STORE_URL = 'https://apps.apple.com/vn/app/zena-massage-t%E1%BA%A1i-nh%C3%A0-24-7/id6761297457?l=vi';

export default function AppUpdatePrompt() {
  const shownVersionRef = React.useRef<string | null>(null);
  const checkingRef = React.useRef(false);
  const lastCheckedAtRef = React.useRef(0);
  const [isVisible, setIsVisible] = React.useState(false);
  const [storeUrls, setStoreUrls] = React.useState<string[]>([]);
  const [openingStore, setOpeningStore] = React.useState(false);

  const checkStoreUpdate = React.useCallback(async () => {
    if (checkingRef.current) return;

    const now = Date.now();
    // Avoid hammering store endpoints when app toggles active/background quickly.
    if (now - lastCheckedAtRef.current < 30_000) return;
    lastCheckedAtRef.current = now;
    checkingRef.current = true;

    try {
      const res = await storeNeedUpdate({ ignoreErrors: true });
      if (!res?.latestVersion || !res.isNeeded) return;
      if (shownVersionRef.current === res.latestVersion) return;

      shownVersionRef.current = res.latestVersion;

      const fallbackStore = Platform.select({
        ios: IOS_APP_STORE_URL,
        android: `https://play.google.com/store/apps/details?id=${Constants.expoConfig?.android?.package ?? 'com.zena.massagenow'}`,
        default: IOS_APP_STORE_URL,
      });
      const primaryStoreUrl = res.storeUrl?.trim() ? res.storeUrl.trim() : fallbackStore;
      const androidPackage = Constants.expoConfig?.android?.package ?? 'com.zena.massagenow';
      const androidWebUrl = `https://play.google.com/store/apps/details?id=${androidPackage}`;
      const playMarketUri = `market://details?id=${androidPackage}`;
      const candidates =
        Platform.OS === 'android'
          ? [playMarketUri, primaryStoreUrl, androidWebUrl, fallbackStore]
          : [primaryStoreUrl, fallbackStore];
      setStoreUrls(Array.from(new Set(candidates.filter(Boolean))));
      setIsVisible(true);
    } catch {
      // Ignore transient network/store lookup errors.
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const handleOpenStore = React.useCallback(() => {
    if (openingStore) return;
    if (storeUrls.length === 0) {
      Alert.alert('Không thể mở cửa hàng ứng dụng', 'Vui lòng mở App Store/Play Store và cập nhật thủ công.');
      return;
    }

    setOpeningStore(true);
    void (async () => {
      try {
        for (const url of storeUrls) {
          try {
            await Linking.openURL(url);
            return;
          } catch {
            // Try next candidate URL.
          }
        }
        Alert.alert('Không thể mở cửa hàng ứng dụng', 'Vui lòng mở App Store/Play Store và cập nhật thủ công.');
      } finally {
        setOpeningStore(false);
      }
    })();
  }, [openingStore, storeUrls]);

  React.useEffect(() => {
    if (__DEV__) return;

    void checkStoreUpdate();

    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void checkStoreUpdate();
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [checkStoreUpdate]);

  if (__DEV__) return null;

  return (
    <AppNoticeModal
      visible={isVisible}
      title="🚀 Có bản cập nhật mới"
      message="Vui lòng cập nhật ứng dụng để tiếp tục sử dụng dịch vụ với trải nghiệm ổn định nhất."
      primaryText={openingStore ? 'Đang mở cửa hàng...' : 'Cập nhật ngay'}
      onPrimaryPress={handleOpenStore}
      dismissable={false}
      variant="default"
    />
  );
}
