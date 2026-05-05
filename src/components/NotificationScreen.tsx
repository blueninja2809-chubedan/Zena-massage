import { AppColors } from '@/constants/appColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { getNotifications, markNotificationAsRead } from '@/lib/supabaseService';
import type { Notification } from '@/lib/types';
import React, { useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const translations = {
  vi: {
    title: 'Thông báo',
    markAllRead: 'Đọc tất cả',
    noNotifications: 'Không có thông báo',
    loading: 'Đang tải thông báo...',
    tabAll: 'Tất cả',
    tabBooking: 'Đặt lịch',
    tabPromo: 'Ưu đãi',
    tabJob: 'Việc mới',
  },
  en: {
    title: 'Notifications',
    markAllRead: 'Read all',
    noNotifications: 'No notifications',
    loading: 'Loading notifications...',
    tabAll: 'All',
    tabBooking: 'Bookings',
    tabPromo: 'Offers',
    tabJob: 'New Jobs',
  },
};

const COLORS = {
  bg: '#F4F5F6',
  text: '#171717',
  subText: '#60666D',
  border: '#E3E8E1',
  rowBg: '#EDF3EC',
  iconBg: '#F4F7F3',
  green: '#5F8F47',
  dot: '#5F8F47',
};

const NOTIF_ICON: Record<Notification['type'], { emoji: string; bg: string; color: string }> = {
  booking: { emoji: '📋', bg: AppColors.primarySoft, color: AppColors.primaryDark },
  promotion: { emoji: '🎁', bg: '#FFF3E0', color: '#F57C00' },
  reminder: { emoji: '⏰', bg: '#FFF8E1', color: '#FFA000' },
  review: { emoji: '⭐', bg: '#FFFDE7', color: '#F9A825' },
  support: { emoji: '💬', bg: '#E8F5E9', color: '#388E3C' },
  job: { emoji: '💼', bg: '#E8EAF6', color: '#3F51B5' },
};

type NotificationNavigateTarget = 'job' | 'booking';

export default function NotificationScreen({
  onClose,
  onOpenRelated,
}: {
  onClose: () => void;
  onOpenRelated?: (target: NotificationNavigateTarget, relatedId?: string) => void;
}) {
  const { user } = useUser();
  const { language } = useLanguage();
  const strings = translations[language as keyof typeof translations] || translations.vi;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'booking' | 'promotion' | 'job'>('all');
  const isTherapist = user?.role === 'therapist';

  useEffect(() => {
    const load = async () => {
      if (!user?.phoneNumber) {
        setNotifications([]);
        setLoading(false);
        return;
      }
      try {
        const userId = user.authUid ?? user.phoneNumber ?? '';
        const data = await getNotifications(userId);
        const sorted = [...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotifications(sorted);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.authUid, user?.phoneNumber]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications;
    if (activeTab === 'booking') return notifications.filter((n) => n.type === 'booking' || n.type === 'review' || n.type === 'reminder');
    if (activeTab === 'promotion') return notifications.filter((n) => n.type === 'promotion');
    if (activeTab === 'job') return notifications.filter((n) => n.type === 'job');
    return notifications;
  }, [notifications, activeTab]);

  const tabs = useMemo(() => {
    const base: { key: 'all' | 'booking' | 'promotion' | 'job'; label: string }[] = [
      { key: 'all', label: strings.tabAll },
      { key: 'booking', label: strings.tabBooking },
      { key: 'promotion', label: strings.tabPromo },
    ];
    if (isTherapist) {
      base.push({ key: 'job', label: strings.tabJob });
    }
    return base;
  }, [strings, isTherapist]);

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead);
    await Promise.all(unread.map((n) => markNotificationAsRead(n.id).catch(() => {})));
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleTapNotification = async (item: Notification) => {
    await markNotificationAsRead(item.id).catch(() => {});
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
    );
    if (item.type === 'job' || item.type === 'booking') {
      onOpenRelated?.(item.type, item.relatedId);
      onClose();
    }
  };

  const renderNotification = (item: Notification) => {
    const icon = NOTIF_ICON[item.type];
    const title = language === 'en' ? item.titleEn || item.title : item.title;
    const body = language === 'en' ? item.messageEn || item.message : item.message;
    const timeText = new Date(item.createdAt).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN');
    return (
      <Pressable
        key={item.id}
        style={[styles.notifCard, !item.isRead && styles.notifUnread]}
        onPress={() => handleTapNotification(item)}
      >
        <View style={[styles.notifIconWrap, { backgroundColor: icon.bg }]}>
          <Text style={styles.notifIconEmoji}>{icon.emoji}</Text>
        </View>
        <View style={styles.notifBody}>
          <View style={styles.notifTitleRow}>
            <Text style={[styles.notifTitle, !item.isRead && styles.notifTitleBold]} numberOfLines={1}>
              {title}
            </Text>
            {!item.isRead && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.notifText} numberOfLines={2}>{body}</Text>
          <Text style={styles.notifTime}>{timeText}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onClose} hitSlop={12}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{strings.title}</Text>
        {unreadCount > 0 ? (
          <Pressable onPress={handleMarkAllRead} style={styles.markReadBtn} hitSlop={8}>
            <Text style={styles.markReadText}>{strings.markAllRead}</Text>
          </Pressable>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow} contentContainerStyle={styles.tabsContent}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = tab.key === 'all'
            ? notifications.filter((n) => !n.isRead).length
            : notifications.filter((n) => {
                if (tab.key === 'booking') return (n.type === 'booking' || n.type === 'review' || n.type === 'reminder') && !n.isRead;
                return n.type === tab.key && !n.isRead;
              }).length;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tabChip, isActive && styles.tabChipActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
              {count > 0 && (
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>{count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{strings.loading}</Text>
        </View>
      ) : filteredNotifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🔔</Text>
          <Text style={styles.emptyText}>{strings.noNotifications}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderNotification(item)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
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
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 22,
    color: COLORS.text,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  markReadBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  markReadText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.green,
  },

  // List
  listContent: {
    paddingBottom: 24,
  },
  // Notification Card
  notifCard: {
    flexDirection: 'row',
    marginHorizontal: 0,
    marginTop: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.rowBg,
  },
  notifUnread: {
    backgroundColor: '#E8F0E7',
  },
  notifIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#E1E7DD',
  },
  notifIconEmoji: {
    fontSize: 17,
  },
  notifBody: {
    flex: 1,
  },
  notifTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  notifTitleBold: {
    fontWeight: '800',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.dot,
    marginLeft: 8,
  },
  notifText: {
    fontSize: 15,
    color: COLORS.subText,
    lineHeight: 20,
    marginBottom: 6,
  },
  notifTime: {
    fontSize: 13,
    color: '#7D8389',
  },

  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 16,
    opacity: 0.4,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.subText,
  },

  // Tabs
  tabsRow: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#FFFFFF',
  },
  tabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#F0F1F3',
  },
  tabChipActive: {
    backgroundColor: AppColors.primaryDark,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.subText,
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.subText,
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },
});
