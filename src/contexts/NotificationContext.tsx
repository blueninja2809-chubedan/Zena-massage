import { supabase } from '@/lib/supabase';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useUser } from './UserContext';

// Conditionally import native-only modules
let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;
let Constants: typeof import('expo-constants').default | null = null;

if (Platform.OS !== 'web') {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
  Constants = require('expo-constants').default;

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

// ─── Helper: register for push notifications (native only) ───────────
async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications || !Device || !Constants) {
    return null;
  }

  if (!Device.isDevice) {
    console.log('[Notifications] Must use a physical device for push notifications');
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Mặc định',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#5F8F47',
      sound: 'default',
    });
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

// ─── Helper: send push via Expo Push API ──────────────────────────────
export async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data: data ?? {},
    }),
  });
}

// ─── Helper: send push to a user by their user_id ────────────────────
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  // Look up the push token from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.push_token) {
    await sendPushNotification(profile.push_token, title, body, data);
  }
}

// ─── Helper: send push to multiple users by IDs ──────────────────────
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  if (userIds.length === 0) return;
  const { data: profiles } = await supabase
    .from('profiles')
    .select('push_token')
    .in('id', userIds)
    .not('push_token', 'is', null);

  if (!profiles || profiles.length === 0) return;

  const tokens = profiles
    .map((p) => p.push_token)
    .filter((t): t is string => !!t);

  // Expo accepts batch push (up to 100 per request)
  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default' as const,
    title,
    body,
    data: data ?? {},
  }));

  // Send in chunks of 100
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });
  }
}

// ─── In-App Notification Banner ──────────────────────────────────────
function InAppBannerView({
  banner,
  onDismiss,
}: {
  banner: InAppBanner;
  onDismiss: () => void;
}) {
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
      style={[bannerStyles.container, { transform: [{ translateY }] }]}
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
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
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
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [banner, setBanner] = useState<InAppBanner | null>(null);

  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);

  // Fetch unread count from Supabase (user_id column expects auth UUID — skip bad ids to avoid query errors)
  const refreshUnreadCount = useCallback(async () => {
    const raw = user?.authUid ?? '';
    const userId = typeof raw === 'string' ? raw.trim() : '';
    if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      setUnreadCount(0);
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
    }
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
        // Show in-app banner
        if (title || body) {
          setBanner({
            title: title ?? '',
            body: body ?? '',
          });
        }
        // Bump unread count
        refreshUnreadCount();
      });

    // Listen for user tapping on notification
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((_response) => {
        // You can navigate to specific screens based on notification data here
        refreshUnreadCount();
      });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [refreshUnreadCount]);

  // Initial unread count load
  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{ expoPushToken, unreadCount, refreshUnreadCount }}
    >
      {children}
      {banner && (
        <InAppBannerView
          banner={banner}
          onDismiss={() => setBanner(null)}
        />
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
