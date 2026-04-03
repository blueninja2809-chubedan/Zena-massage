import { useLanguage } from '@/contexts/LanguageContext';
import {
    type AdminChatRoom,
    type ChatMessage,
    adminGetChatRooms,
    adminToggleChatRoom,
    getChatMessages,
} from '@/lib/supabaseService';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { AppColors } from '@/constants/appColors';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  bg: AppColors.bg,
  white: AppColors.white,
  primary: AppColors.primaryDark,
  danger: AppColors.danger,
  success: '#43A047',
  text: '#1A1A1A',
  subText: '#6B7280',
  border: '#E5E7EB',
  warning: '#F59E0B',
};

const translations = {
  vi: {
    title: 'Quản lý Chat',
    totalRooms: 'Tổng phòng chat',
    customer: 'Khách:',
    therapist: 'KTV:',
    lastMsg: 'Tin nhắn cuối:',
    unread: 'chưa đọc',
    messages: 'tin nhắn',
    noRooms: 'Chưa có phòng chat nào',
    viewMessages: 'Xem tin nhắn',
    deactivate: 'Vô hiệu hóa',
    activate: 'Kích hoạt',
    active: 'Đang hoạt động',
    inactive: 'Đã khóa',
    bookingId: 'Mã đặt lịch:',
    back: '← Quay lại',
    chatHistory: 'Lịch sử chat',
    loading: 'Đang tải...',
    confirmDeactivate: 'Xác nhận vô hiệu hóa phòng chat này?',
    confirmActivate: 'Xác nhận kích hoạt phòng chat này?',
    confirm: 'Xác nhận',
    cancel: 'Hủy',
    system: 'Hệ thống',
    noMessages: 'Chưa có tin nhắn',
  },
  en: {
    title: 'Chat Management',
    totalRooms: 'Total chat rooms',
    customer: 'Customer:',
    therapist: 'Therapist:',
    lastMsg: 'Last message:',
    unread: 'unread',
    messages: 'messages',
    noRooms: 'No chat rooms yet',
    viewMessages: 'View Messages',
    deactivate: 'Deactivate',
    activate: 'Activate',
    active: 'Active',
    inactive: 'Inactive',
    bookingId: 'Booking ID:',
    back: '← Back',
    chatHistory: 'Chat History',
    loading: 'Loading...',
    confirmDeactivate: 'Confirm deactivating this chat room?',
    confirmActivate: 'Confirm activating this chat room?',
    confirm: 'Confirm',
    cancel: 'Cancel',
    system: 'System',
    noMessages: 'No messages yet',
  },
};

export default function AdminChatPanel({ onClose }: { onClose: () => void }) {
  const { language } = useLanguage();
  const strings = translations[language as keyof typeof translations] || translations.vi;
  const [rooms, setRooms] = useState<AdminChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<AdminChatRoom | null>(null);
  const [roomMessages, setRoomMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminGetChatRooms(100, 0);
      setRooms(data);
    } catch {
      setRooms([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleToggleRoom = (room: AdminChatRoom) => {
    const msg = room.isActive ? strings.confirmDeactivate : strings.confirmActivate;
    Alert.alert('', msg, [
      { text: strings.cancel, style: 'cancel' },
      {
        text: strings.confirm,
        style: room.isActive ? 'destructive' : 'default',
        onPress: async () => {
          await adminToggleChatRoom(room.id, !room.isActive);
          loadRooms();
        },
      },
    ]);
  };

  const handleViewMessages = async (room: AdminChatRoom) => {
    setSelectedRoom(room);
    setLoadingMessages(true);
    try {
      const msgs = await getChatMessages(room.id, 200);
      setRoomMessages(msgs);
    } catch {
      setRoomMessages([]);
    }
    setLoadingMessages(false);
  };

  const formatTime = (isoStr: string | null) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  // View messages for a specific room
  if (selectedRoom) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setSelectedRoom(null)} style={s.backBtn}>
            <Text style={s.backText}>{strings.back}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{strings.chatHistory}</Text>
          <View style={{ width: 80 }} />
        </View>

        {/* Room info */}
        <View style={s.roomInfoBar}>
          <Text style={s.roomInfoText}>
            {strings.customer} {selectedRoom.customerName || selectedRoom.customerId}
          </Text>
          <Text style={s.roomInfoText}>
            {strings.therapist} {selectedRoom.therapistName || selectedRoom.therapistId}
          </Text>
        </View>

        {loadingMessages ? (
          <View style={s.centerBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : roomMessages.length === 0 ? (
          <View style={s.centerBox}>
            <Text style={s.emptyText}>{strings.noMessages}</Text>
          </View>
        ) : (
          <ScrollView style={s.msgScrollView} contentContainerStyle={s.msgScrollContent}>
            {roomMessages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  s.msgBubble,
                  msg.senderRole === 'system' ? s.msgSystem :
                  msg.senderRole === 'customer' ? s.msgCustomer : s.msgTherapist,
                ]}
              >
                <View style={s.msgHeader}>
                  <Text style={s.msgSender}>
                    {msg.senderRole === 'system' ? `🤖 ${strings.system}` :
                     msg.senderRole === 'customer' ? `👤 ${selectedRoom.customerName || strings.customer}` :
                     `💆 ${selectedRoom.therapistName || strings.therapist}`}
                  </Text>
                  <Text style={s.msgTime}>{formatTime(msg.createdAt)}</Text>
                </View>
                <Text style={s.msgContent}>{msg.content}</Text>
                {!msg.isRead && msg.senderRole !== 'system' && (
                  <Text style={s.unreadTag}>● {strings.unread}</Text>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // Room list
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={onClose} style={s.backBtn}>
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{strings.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary */}
      <View style={s.summaryBar}>
        <Text style={s.summaryText}>{strings.totalRooms}: {rooms.length}</Text>
      </View>

      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ marginTop: 8, color: COLORS.subText }}>{strings.loading}</Text>
        </View>
      ) : rooms.length === 0 ? (
        <View style={s.centerBox}>
          <Text style={s.emptyEmoji}>💬</Text>
          <Text style={s.emptyText}>{strings.noRooms}</Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <View style={s.roomCard}>
              <View style={s.roomHeader}>
                <View style={[s.statusDot, { backgroundColor: item.isActive ? COLORS.success : COLORS.danger }]} />
                <Text style={s.statusLabel}>
                  {item.isActive ? strings.active : strings.inactive}
                </Text>
                {item.unreadCount > 0 && (
                  <View style={s.unreadBadge}>
                    <Text style={s.unreadBadgeText}>{item.unreadCount} {strings.unread}</Text>
                  </View>
                )}
              </View>

              <Text style={s.roomField}>
                {strings.customer} <Text style={s.roomValue}>{item.customerName || item.customerId}</Text>
              </Text>
              <Text style={s.roomField}>
                {strings.therapist} <Text style={s.roomValue}>{item.therapistName || item.therapistId}</Text>
              </Text>
              <Text style={s.roomField}>
                {strings.bookingId} <Text style={s.roomValue}>{item.bookingId.substring(0, 16)}...</Text>
              </Text>

              {item.lastMessage && (
                <Text style={s.lastMsg} numberOfLines={1}>
                  {strings.lastMsg} {item.lastMessage}
                </Text>
              )}

              <Text style={s.roomMeta}>
                {item.totalMessages} {strings.messages} · {formatTime(item.updatedAt)}
              </Text>

              <View style={s.roomActions}>
                <TouchableOpacity
                  style={s.viewBtn}
                  onPress={() => handleViewMessages(item)}
                >
                  <Text style={s.viewBtnText}>{strings.viewMessages}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.toggleBtn, { backgroundColor: item.isActive ? COLORS.danger : COLORS.success }]}
                  onPress={() => handleToggleRoom(item)}
                >
                  <Text style={s.toggleBtnText}>
                    {item.isActive ? strings.deactivate : strings.activate}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 8 },
  backText: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  summaryBar: {
    padding: 12, paddingHorizontal: 16, backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  summaryText: { fontSize: 14, color: COLORS.subText, fontWeight: '600' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12, opacity: 0.4 },
  emptyText: { fontSize: 16, color: COLORS.subText },
  listContent: { padding: 12 },
  roomCard: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  roomHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 12, fontWeight: '700', color: COLORS.subText },
  unreadBadge: {
    marginLeft: 'auto', backgroundColor: '#EF4444', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  unreadBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  roomField: { fontSize: 13, color: COLORS.subText, marginBottom: 4 },
  roomValue: { fontWeight: '600', color: COLORS.text },
  lastMsg: { fontSize: 12, color: COLORS.subText, fontStyle: 'italic', marginTop: 4, marginBottom: 4 },
  roomMeta: { fontSize: 11, color: COLORS.subText, marginTop: 4 },
  roomActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  viewBtn: {
    flex: 1, backgroundColor: COLORS.primary, borderRadius: 8,
    paddingVertical: 8, alignItems: 'center',
  },
  viewBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  toggleBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  toggleBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Message view
  roomInfoBar: {
    padding: 12, paddingHorizontal: 16, backgroundColor: '#EBF5FB',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  roomInfoText: { fontSize: 13, color: COLORS.text, fontWeight: '600', marginBottom: 2 },
  msgScrollView: { flex: 1 },
  msgScrollContent: { padding: 12, paddingBottom: 30 },
  msgBubble: { borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1 },
  msgSystem: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' },
  msgCustomer: { backgroundColor: '#EBF5FB', borderColor: '#BFDBFE' },
  msgTherapist: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  msgHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  msgSender: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  msgTime: { fontSize: 11, color: COLORS.subText },
  msgContent: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  unreadTag: { fontSize: 11, color: COLORS.warning, marginTop: 4, fontWeight: '600' },
});
