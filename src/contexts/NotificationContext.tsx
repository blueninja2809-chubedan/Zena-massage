import {
  checkTherapistMinBalance,
  getSharedBookingRecordById,
  markNotificationAsRead,
  therapistApplyToBroadcastBooking,
  therapistPrimaryAcceptBooking,
  therapistPrimaryDeclineBooking,
  therapistSkipBroadcastBooking,
} from '@/lib/supabaseService';
import {
  sendPushNotification,
  sendPushToUser,
  sendPushToUsers,
} from '@/lib/pushNotifications';
import { supabase } from '@/lib/supabase';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBookings } from './BookingsContext';
import { useLanguage } from './LanguageContext';
import { useUser } from './UserContext';

// Conditionally import native-only modules
let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;
let Constants: typeof import('expo-constants').default | null = null;

if (Platform.OS !== 'web') {
  /* eslint-disable @typescript-eslint/no-require-imports -- native-only optional deps */
  Notifications = require('expo-notifications');
  Device = require('expo-device');
  Constants = require('expo-constants').default;
  /* eslint-enable @typescript-eslint/no-require-imports */

  // ─── Configure notification behavior (native only) ──────────────────
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ─── Types ────────────────────────────────────────────────────────────
interface InAppBanner {
  title: string;
  body: string;
  type?: string;
}

interface NotificationContextType {
  expoPushToken: string | null;
  /** Total unread count – updated every time a notification arrives */
  unreadCount: number;
  /** Manually refresh the unread count */
  refreshUnreadCount: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  expoPushToken: null,
  unreadCount: 0,
  refreshUnreadCount: () => {},
});

type IncomingNotificationRow = {
  id: string;
  user_id: string;
  is_read: boolean;
  payload?: {
    title?: string;
    message?: string;
    type?: string;
    relatedId?: string;
  } | null;
};

type JobOfferState = {
  bookingId: string;
  title: string;
  body: string;
  notificationId?: string;
};

// ─── Therapist job offer (đơn mới — ứng tuyển / không ứng tuyển) ─────
function TherapistJobOfferModal({
  visible,
  offer,
  language,
  busy,
  onDismiss,
  onApply,
  onDecline,
}: {
  visible: boolean;
  offer: JobOfferState | null;
  language: 'vi' | 'en';
  busy: boolean;
  onDismiss: () => void;
  onApply: () => void;
  onDecline: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isEn = language === 'en';
  if (!offer) {
    return null;
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={jobModalStyles.backdrop}>
        <View style={[jobModalStyles.card, { marginTop: Math.max(insets.top, 12) + 24 }]}>
          <Text style={jobModalStyles.kicker}>{isEn ? 'New booking' : 'Đơn mới'}</Text>
          <Text style={jobModalStyles.title} numberOfLines={3}>
            {offer.title}
          </Text>
          <ScrollView style={jobModalStyles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={jobModalStyles.body}>{offer.body}</Text>
          </ScrollView>
          <View style={jobModalStyles.row}>
            <TouchableOpacity
              style={[jobModalStyles.btn, jobModalStyles.btnGhost]}
              onPress={onDecline}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Text style={jobModalStyles.btnGhostText}>{isEn ? 'Not applying' : 'Không ứng tuyển'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[jobModalStyles.btn, jobModalStyles.btnPrimary]}
              onPress={onApply}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={jobModalStyles.btnPrimaryText}>{isEn ? 'Apply' : 'Ứng tuyển'}</Text>
              )}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={jobModalStyles.closeHint} onPress={onDismiss} disabled={busy}>
            <Text style={jobModalStyles.closeHintText}>{isEn ? 'Close' : 'Đóng'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const jobModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
    maxHeight: '82%',
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B8C5B',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#171717', marginBottom: 10 },
  scroll: { maxHeight: 220, marginBottom: 16 },
  body: { fontSize: 14, color: '#60666D', lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnGhost: {
    backgroundColor: '#F1F3F0',
    borderWidth: 1,
    borderColor: '#D9DED6',
  },
  btnGhostText: { fontSize: 15, fontWeight: '700', color: '#3D4A38' },
  btnPrimary: { backgroundColor: '#5F8F47' },
  btnPrimaryText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  closeHint: { marginTop: 12, alignItems: 'center', paddingVertical: 6 },
  closeHintText: { fontSize: 14, color: '#9AA0A6', fontWeight: '600' },
});

// ─── Helper: register for push notifications (native only) ───────────
async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications || !Device || !Constants) {
    return null;
  }

  if (!Device.isDevice) {
    console.log('[Notifications] Must use a physical device for push notifications');
    return null;
  }

  // Android requires notification channels (IDs must match Expo push payload channelId).
  if (Platform.OS === 'android') {
    const channel = (id: string, name: string) =>
      Notifications.setNotificationChannelAsync(id, {
        name,
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#5F8F47',
        sound: 'default',
      });
    await channel('default', 'Mặc định');
    await channel('booking', 'Đặt lịch & việc mới');
    await channel('promotion', 'Ưu đãi & thông báo');
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission not granted');
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    console.warn('[Notifications] No projectId found – cannot get push token');
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data; // e.g. "ExponentPushToken[xxx]"
}

// ─── Helper: save token to Supabase profiles ─────────────────────────
async function savePushTokenToProfile(uid: string, token: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', uid);
  if (error) {
    console.warn('[Notifications] Failed to save push token:', error.message);
  }
}

export { sendPushNotification, sendPushToUser, sendPushToUsers };

// ─── In-App Notification Banner ──────────────────────────────────────
function InAppBannerView({
  banner,
  onDismiss,
}: {
  banner: InAppBanner;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(translateY, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start(() => onDismiss());
    }, 4000);

    return () => clearTimeout(timer);
  }, [translateY, onDismiss]);

  return (
    <Animated.View
      style={[
        bannerStyles.container,
        { paddingTop: Math.max(insets.top, 8) + 4, transform: [{ translateY }] },
      ]}
    >
      <TouchableOpacity
        style={bannerStyles.content}
        activeOpacity={0.9}
        onPress={onDismiss}
      >
        <Text style={bannerStyles.icon}>🔔</Text>
        <View style={bannerStyles.textWrap}>
          <Text style={bannerStyles.title} numberOfLines={1}>
            {banner.title}
          </Text>
          <Text style={bannerStyles.body} numberOfLines={2}>
            {banner.body}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E3E8E1',
  },
  icon: {
    fontSize: 24,
    marginRight: 12,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#171717',
    marginBottom: 2,
  },
  body: {
    fontSize: 13,
    color: '#60666D',
    lineHeight: 18,
  },
});

// ─── Provider ─────────────────────────────────────────────────────────
export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const { language } = useLanguage();
  const langUi = language === 'en' ? 'en' : 'vi';
  const { refreshBookings, updateStatus } = useBookings();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [banner, setBanner] = useState<InAppBanner | null>(null);
  const [jobOffer, setJobOffer] = useState<JobOfferState | null>(null);
  const [jobOfferBusy, setJobOfferBusy] = useState(false);

  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);
  const seenNotificationIds = useRef<Set<string>>(new Set());

  // Fetch unread count from Supabase (user_id column expects auth UUID — skip bad ids to avoid query errors)
  const refreshUnreadCount = useCallback(async () => {
    const raw = user?.authUid ?? '';
    const userId = typeof raw === 'string' ? raw.trim() : '';
    if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      setUnreadCount(0);
      if (Platform.OS === 'ios' && Notifications) {
        void Notifications.setBadgeCountAsync(0);
      }
      return;
    }
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) {
      return;
    }
    if (count != null) {
      setUnreadCount(count);
      if (Platform.OS === 'ios' && Notifications) {
        void Notifications.setBadgeCountAsync(count);
      }
    }
  }, [user?.authUid]);

  const dismissJobOffer = useCallback(() => {
    setJobOffer(null);
  }, []);

  const finalizeJobOffer = useCallback(
    async (notificationId?: string) => {
      if (notificationId) {
        await markNotificationAsRead(notificationId).catch(() => {});
      }
      await refreshBookings();
      await refreshUnreadCount();
      setJobOffer(null);
    },
    [refreshBookings, refreshUnreadCount],
  );

  const handleJobApply = useCallback(async () => {
    if (!jobOffer || !user?.authUid) return;
    setJobOfferBusy(true);
    try {
      const okWallet = await checkTherapistMinBalance(user.authUid, 0);
      if (!okWallet) {
        Alert.alert(
          langUi === 'en' ? 'Cannot accept job' : 'Chưa thể nhận đơn',
          langUi === 'en'
            ? 'Check connection fee and minimum balance. Use Top up.'
            : 'Kiểm tra phí kết nối và số dư tối thiểu. Vào Nạp tiền.',
        );
        return;
      }
      const row = await getSharedBookingRecordById(jobOffer.bookingId);
      if (!row) {
        Alert.alert(
          langUi === 'en' ? 'Error' : 'Lỗi',
          langUi === 'en' ? 'Booking not found.' : 'Không tìm thấy đơn.',
        );
        return;
      }
      const status = String(row.status ?? '');
      if (status === 'cancelled') {
        Alert.alert(
          langUi === 'en' ? 'Closed' : 'Đã đóng',
          langUi === 'en' ? 'This booking is no longer available.' : 'Đơn này không còn hiệu lực.',
        );
        return;
      }
      const flow = String(row.assignmentFlow ?? '');
      const requested = String(row.requestedTherapistId ?? row.therapistId ?? '');
      const uid = user.authUid;
      if (flow === 'nominated_city_broadcast' && requested === uid) {
        const r = await therapistPrimaryAcceptBooking(jobOffer.bookingId, uid);
        if (!r.ok) {
          Alert.alert(
            langUi === 'en' ? 'Action failed' : 'Thao tác không thành công',
            r.reason ?? '',
          );
          return;
        }
      } else if (flow === 'nominated_city_broadcast') {
        const r = await therapistApplyToBroadcastBooking(
          jobOffer.bookingId,
          uid,
          user?.displayName || user?.phoneNumber || 'KTV',
          user?.avatarUri,
        );
        if (!r.ok) {
          Alert.alert(
            langUi === 'en' ? 'Action failed' : 'Thao tác không thành công',
            r.reason ?? '',
          );
          return;
        }
      } else {
        updateStatus(jobOffer.bookingId, 'confirmed');
      }
      await finalizeJobOffer(jobOffer.notificationId);
    } finally {
      setJobOfferBusy(false);
    }
  }, [jobOffer, user, langUi, updateStatus, finalizeJobOffer]);

  const handleJobDecline = useCallback(async () => {
    if (!jobOffer || !user?.authUid) return;
    setJobOfferBusy(true);
    try {
      const row = await getSharedBookingRecordById(jobOffer.bookingId);
      if (row) {
        const flow = String(row.assignmentFlow ?? '');
        const requested = String(row.requestedTherapistId ?? row.therapistId ?? '');
        const uid = user.authUid;
        if (flow === 'nominated_city_broadcast' && requested === uid) {
          await therapistPrimaryDeclineBooking(jobOffer.bookingId, uid);
        } else if (flow === 'nominated_city_broadcast') {
          await therapistSkipBroadcastBooking(jobOffer.bookingId, uid);
        }
      }
      await finalizeJobOffer(jobOffer.notificationId);
    } finally {
      setJobOfferBusy(false);
    }
  }, [jobOffer, user, finalizeJobOffer]);

  useEffect(() => {
    setJobOffer(null);
  }, [user?.authUid]);

  // Register push token when user logs in
  useEffect(() => {
    if (!user?.authUid) {
      setExpoPushToken(null);
      return;
    }

    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        setExpoPushToken(token);
        savePushTokenToProfile(user.authUid!, token);
      }
    });
  }, [user?.authUid]);

  // Listen for incoming notifications (foreground, native only)
  useEffect(() => {
    if (Platform.OS === 'web' || !Notifications) return;

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const { title, body } = notification.request.content;
        const data = notification.request.content.data as Record<string, unknown> | undefined;
        const relatedId = typeof data?.relatedId === 'string' ? data.relatedId.trim() : '';
        const isJobPayload = data?.type === 'job' && relatedId.length > 0;

        if (user?.role === 'therapist' && isJobPayload) {
          setJobOffer({
            bookingId: relatedId,
            title: title ?? '',
            body: body ?? '',
          });
          void refreshUnreadCount();
          return;
        }

        if (title || body) {
          setBanner({
            title: title ?? '',
            body: body ?? '',
          });
        }
        void refreshUnreadCount();
      });

    // Listen for user tapping on notification
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((_response) => {
        // You can navigate to specific screens based on notification data here
        void refreshUnreadCount();
      });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [refreshUnreadCount, user?.role]);

  // Initial unread count load
  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  // Realtime: when a notification row is inserted for this user, show banner + sound immediately.
  useEffect(() => {
    const uid = user?.authUid?.trim();
    if (!uid) return;

    const channel = supabase
      .channel(`notifications:${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.new as IncomingNotificationRow;
          if (!row?.id || seenNotificationIds.current.has(row.id)) return;
          seenNotificationIds.current.add(row.id);

          const title = row.payload?.title ?? 'Thông báo mới';
          const body = row.payload?.message ?? '';
          const relatedId =
            typeof row.payload?.relatedId === 'string' ? row.payload.relatedId.trim() : '';
          const isTherapistJob =
            user?.role === 'therapist' &&
            row.payload?.type === 'job' &&
            relatedId.length > 0;

          void refreshUnreadCount();

          if (isTherapistJob) {
            setJobOffer({
              bookingId: relatedId,
              title,
              body,
              notificationId: row.id,
            });
            return;
          }

          setBanner({ title, body, type: row.payload?.type });

          if (
            Platform.OS !== 'web' &&
            Notifications &&
            (row.payload?.type === 'job' || row.payload?.type === 'booking')
          ) {
            void Notifications.scheduleNotificationAsync({
              content: {
                title,
                body,
                sound: 'default',
                data: { type: row.payload?.type ?? 'booking', relatedId: row.payload?.relatedId },
              },
              trigger: null,
            }).catch(() => {});
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshUnreadCount, user?.authUid, user?.role]);

  // Khi mở lại app (từ nền / sau khi xem thông báo hệ thống), cập nhật badge chuông trên màn hình chính
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshUnreadCount();
      }
    });
    return () => sub.remove();
  }, [refreshUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{ expoPushToken, unreadCount, refreshUnreadCount }}
    >
      {children}
      {banner && !jobOffer ? (
        <InAppBannerView
          banner={banner}
          onDismiss={() => setBanner(null)}
        />
      ) : null}
      <TherapistJobOfferModal
        visible={!!jobOffer && user?.role === 'therapist'}
        offer={jobOffer}
        language={langUi}
        busy={jobOfferBusy}
        onDismiss={dismissJobOffer}
        onApply={() => void handleJobApply()}
        onDecline={() => void handleJobDecline()}
      />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
