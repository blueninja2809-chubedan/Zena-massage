import { AppColors } from '@/constants/appColors';
import { useActiveBooking } from '@/contexts/ActiveBookingContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import {
  broadcastChatMessage,
  getBookingById,
  getChatMessages,
  getChatRoomByBooking,
  getChatRoomsForUser,
  getOrCreateChatRoom,
  getTherapistById,
  getUserProfileByUid,
  markChatMessagesRead,
  normalizeTherapistMediaUrl,
  resolveTherapistImageUriForUi,
  sendChatMessage,
  subscribeToChatMessages,
  type ChatMessage,
  type ChatRoom,
} from '@/lib/supabaseService';
import Feather from '@expo/vector-icons/Feather';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const translations = {
  vi: {
    title: 'Tin nhắn',
    search: 'Tìm kiếm cuộc trò chuyện...',
    online: 'Đang hoạt động',
    noChats: 'Chưa có cuộc trò chuyện nào',
    noChatsDesc: 'Bạn cần đặt và kết nối với KTV trước khi nhắn tin. Chat sẽ tự xoá khi đơn hoàn tất.',
  },
  en: {
    title: 'Messages',
    search: 'Search conversations...',
    online: 'Active',
    noChats: 'No conversations yet',
    noChatsDesc: 'Connect with a therapist by booking to start chatting. Chats are cleared once the booking is completed.',
  },
};

const COLORS = {
  bg: AppColors.bg,
  text: AppColors.text,
  subText: AppColors.textMuted,
  lightText: '#9A9088',
  border: AppColors.border,
  green: AppColors.primaryDark,
  greenOnline: AppColors.success,
  blue: AppColors.accent,
  unreadBg: AppColors.primarySoft,
};

type BookingChatFields = {
  customerName?: unknown;
  customerUserId?: unknown;
  therapistName?: unknown;
  userId?: unknown;
  therapistId?: unknown;
};

function resolveProfileAvatarUri(profile: Record<string, unknown> | null | undefined): string {
  const direct = normalizeTherapistMediaUrl(String(profile?.avatarUri ?? '').trim());
  if (direct) return direct;
  const serviceImages = Array.isArray(profile?.serviceImages) ? profile.serviceImages : [];
  const firstServiceImage = serviceImages.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return firstServiceImage ? normalizeTherapistMediaUrl(firstServiceImage.trim()) : '';
}

export default function ChatScreen({ onClose, bookingId }: { onClose: () => void; bookingId?: string }) {
  const { language } = useLanguage();
  const strings = translations[language as keyof typeof translations] || translations.vi;
  const { activeBooking, clearActiveBooking } = useActiveBooking();
  const { user } = useUser();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [bookingChatStatus, setBookingChatStatus] = useState<'ready' | 'pending' | 'done' | null>(null);
  const [bookingTherapistName, setBookingTherapistName] = useState('');
  const [userDismissedRoom, setUserDismissedRoom] = useState(false);


  const userId = user?.authUid || user?.phoneNumber || '';

  useEffect(() => {
    setUserDismissedRoom(false);
  }, [bookingId]);

  // If a specific bookingId is provided, open that chat directly
  useEffect(() => {
    if (bookingId) {
      setLoadingRooms(true);
      // Look for existing room for this booking
      (async () => {
        try {
          const booking = await getBookingById(bookingId);
          const bookingFields = booking as BookingChatFields | null;
          const bookingStatus = String(booking?.status ?? '');
          const therapistName = typeof bookingFields?.therapistName === 'string' ? bookingFields.therapistName : '';
          setBookingTherapistName(therapistName);

          if (bookingStatus === 'completed' || bookingStatus === 'cancelled') {
            setBookingChatStatus('done');
            setChatRooms([]);
            setSelectedRoom(null);
            return;
          }

          if (bookingStatus !== 'confirmed' && bookingStatus !== 'in-progress') {
            setBookingChatStatus('pending');
            setChatRooms([]);
            setSelectedRoom(null);
            return;
          }

          const room = userId ? (await getChatRoomsForUser(userId)).find((r) => r.bookingId === bookingId) : null;
          let resolvedRoom = room ?? (await getChatRoomByBooking(bookingId));
          if (!resolvedRoom && booking) {
            const customerId = String(bookingFields?.customerUserId ?? bookingFields?.userId ?? userId ?? '');
            const therapistId = String(bookingFields?.therapistId ?? '');
            if (customerId && therapistId) {
              await getOrCreateChatRoom(
                bookingId,
                customerId,
                therapistId,
                String(bookingFields?.customerName ?? ''),
                therapistName,
              );
              resolvedRoom = await getChatRoomByBooking(bookingId);
            }
          }
          setBookingChatStatus(resolvedRoom ? 'ready' : 'pending');
          if (resolvedRoom) setSelectedRoom(resolvedRoom);
          setChatRooms(resolvedRoom ? [resolvedRoom] : []);
        } catch {
          setBookingChatStatus('pending');
          setChatRooms([]);
        } finally {
          setLoadingRooms(false);
        }
      })();
      return;
    }
  }, [bookingId, userId]);

  useEffect(() => {
    const targetBookingId = bookingId || selectedRoom?.bookingId || activeBooking?.bookingId;
    if (!targetBookingId) return;

    let cancelled = false;
    const syncBookingStatus = async () => {
      try {
        const booking = await getBookingById(targetBookingId);
        const status = String(booking?.status ?? '');
        if (cancelled || !status) return;

        if (status === 'completed' || status === 'cancelled') {
          clearActiveBooking();
          setSelectedRoom((prev) => (prev?.bookingId === targetBookingId ? null : prev));
          setChatRooms((prev) => prev.filter((room) => room.bookingId !== targetBookingId));
          setBookingChatStatus('done');
          if (bookingId) {
            onClose();
          }
          return;
        }

        if (status === 'confirmed' || status === 'in-progress') {
          setBookingChatStatus('ready');
        } else if (bookingId) {
          setBookingChatStatus('pending');
        }
      } catch {
        // Best-effort sync only.
      }
    };

    void syncBookingStatus();
    const intervalId = setInterval(() => {
      void syncBookingStatus();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [activeBooking?.bookingId, bookingId, clearActiveBooking, onClose, selectedRoom?.bookingId]);

  // When sync detects booking became confirmed/in-progress but room wasn't fetched yet
  useEffect(() => {
    if (bookingChatStatus !== 'ready' || selectedRoom || !bookingId || !userId || userDismissedRoom) return;
    let cancelled = false;
    (async () => {
      try {
        const booking = await getBookingById(bookingId);
        if (!booking || cancelled) return;
        const bookingFields = booking as BookingChatFields;
        const rooms = await getChatRoomsForUser(userId);
        const existingRoom = rooms.find((r) => r.bookingId === bookingId);
        let resolvedRoom = existingRoom ?? (await getChatRoomByBooking(bookingId));
        if (!resolvedRoom) {
          const customerId = String(bookingFields.customerUserId ?? bookingFields.userId ?? userId ?? '');
          const therapistId = String(bookingFields.therapistId ?? '');
          if (customerId && therapistId) {
            await getOrCreateChatRoom(
              bookingId,
              customerId,
              therapistId,
              String(bookingFields.customerName ?? ''),
              String(bookingFields.therapistName ?? ''),
            );
            resolvedRoom = await getChatRoomByBooking(bookingId);
          }
        }
        if (!cancelled && resolvedRoom) {
          setSelectedRoom(resolvedRoom);
          setChatRooms([resolvedRoom]);
        }
      } catch {
        // best-effort
      }
    })();
    return () => { cancelled = true; };
  }, [bookingChatStatus, selectedRoom, bookingId, userId, userDismissedRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load user's chat room list
  useEffect(() => {
    if (!userId) return;
    setLoadingRooms(true);
    getChatRoomsForUser(userId).then((rooms) => {
      setChatRooms(rooms);
      setLoadingRooms(false);
    }).catch(() => setLoadingRooms(false));
  }, [userId]);

  // If there's an active booking, show the connected therapist chat
  if (activeBooking || selectedRoom) {
    return (
      <ActiveChatView
        activeBooking={activeBooking}
        chatRoom={selectedRoom}
        onClose={() => {
          if (selectedRoom && !activeBooking) {
            setUserDismissedRoom(true);
            setSelectedRoom(null);
          } else {
            onClose();
          }
        }}
        language={language}
      />
    );
  }

  if (bookingId && bookingChatStatus === 'pending') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose}>
            <Feather name="arrow-left" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{strings.title}</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Feather name="clock" size={52} color={COLORS.lightText} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>
            {language === 'en' ? 'Waiting for therapist confirmation' : 'Đang chờ kỹ thuật viên xác nhận'}
          </Text>
          <Text style={styles.emptyDesc}>
            {language === 'en'
              ? `Chat will open after ${bookingTherapistName || 'the therapist'} confirms the booking.`
              : `Chat sẽ được mở sau khi ${bookingTherapistName || 'kỹ thuật viên'} xác nhận đơn.`}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (bookingId && bookingChatStatus === 'done') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose}>
            <Feather name="arrow-left" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{strings.title}</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Feather name="check-circle" size={52} color={COLORS.green} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>
            {language === 'en' ? 'This booking is closed' : 'Đơn này đã kết thúc'}
          </Text>
          <Text style={styles.emptyDesc}>
            {language === 'en'
              ? 'The old chat was removed after the booking was completed.'
              : 'Đoạn chat cũ đã được xóa sau khi đơn hoàn thành.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Chat room list or empty state
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onClose}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{strings.title}</Text>
        <View style={{ width: 38 }} />
      </View>

      {loadingRooms ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={COLORS.green} />
        </View>
      ) : chatRooms.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="message-circle" size={52} color={COLORS.lightText} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>{strings.noChats}</Text>
          <Text style={styles.emptyDesc}>{strings.noChatsDesc}</Text>
        </View>
      ) : (
        <FlatList
          data={chatRooms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isCustomer = item.customerId === userId;
            const otherName = isCustomer ? item.therapistName : item.customerName;
            return (
              <TouchableOpacity
                style={styles.chatCard}
                onPress={() => setSelectedRoom(item)}
                activeOpacity={0.7}
              >
                <View style={styles.avatarWrap}>
                  <View style={styles.avatar}>
                    <Feather name="user" size={26} color={COLORS.green} />
                  </View>
                </View>
                <View style={styles.chatBody}>
                  <View style={styles.chatTopRow}>
                    <Text style={styles.chatName} numberOfLines={1}>
                      {otherName || (language === 'en' ? 'Chat' : 'Trò chuyện')}
                    </Text>
                    <Text style={styles.chatTime}>
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.chatLastMsg} numberOfLines={1}>
                    {language === 'en' ? 'Tap to open chat' : 'Nhấn để mở trò chuyện'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Active Chat with Connected Therapist (Supabase Realtime) ──
function ActiveChatView({
  activeBooking,
  chatRoom: existingRoom,
  onClose,
  language,
}: {
  activeBooking: import('@/contexts/ActiveBookingContext').ActiveBookingData | null;
  chatRoom: ChatRoom | null;
  onClose: () => void;
  language: string;
}) {
  const { user } = useUser();
  const therapist = activeBooking?.therapist;
  const therapistName = therapist?.name || existingRoom?.therapistName || '';
  const userId = user?.authUid || user?.phoneNumber || existingRoom?.customerId || existingRoom?.therapistId || '';
  const userRole: 'customer' | 'therapist' = user?.role === 'therapist' ? 'therapist' : 'customer';

  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomId, setRoomId] = useState<string | null>(existingRoom?.id || null);
  const [loading, setLoading] = useState(true);
  const [incomingAvatarUri, setIncomingAvatarUri] = useState(() =>
    normalizeTherapistMediaUrl(therapist?.avatar?.trim() || ''),
  );
  const flatListRef = useRef<FlatList>(null);
  const bootstrappedRoomIdsRef = useRef<Set<string>>(new Set());

  const chatStrings = language === 'en' ? {
    connected: 'Connected',
    bookingTime: 'Booking time:',
    noteWarning: 'NOTE: Zena does NOT allow: Requesting cancellation to work outside/Sharing contact information/Using inappropriate language...',
    noteWarning2: 'Please only communicate on Zena. We are not responsible if you contact outside the app.',
    translate: 'Translate',
    library: 'Library',
    location: 'Location',
    typeMessage: 'Message',
    call: 'Call',
    sms: 'SMS',
    detail: 'Detail',
    loading: 'Loading chat...',
  } : {
    connected: 'Đã kết nối',
    bookingTime: 'Thời gian đặt hẹn:',
    noteWarning: 'LƯU Ý: Zena KHÔNG cho phép hành vi: Yêu cầu hủy đơn để làm ngoài/Cung cấp thông tin liên hệ/Sử dụng các từ ngữ nhạy cảm...',
    noteWarning2: 'Vui lòng chỉ trao đổi trên Zena. Chúng tôi không chịu trách nhiệm nếu bạn liên hệ ngoài ứng dụng. Nếu vi phạm sẽ bị khoá tài khoản vĩnh viễn.',
    translate: 'Dịch',
    library: 'Thư viện',
    location: 'Vị trí',
    typeMessage: 'Tin nhắn',
    call: 'Gọi điện',
    sms: 'Nhắn SMS',
    detail: 'Xem chi tiết',
    loading: 'Đang tải trò chuyện...',
  };

  useEffect(() => {
    let cancelled = false;
    const activeTherapistAvatar = normalizeTherapistMediaUrl(therapist?.avatar?.trim() || '');
    const therapistId = String(activeBooking?.therapist.id || existingRoom?.therapistId || '');
    const customerId = String(existingRoom?.customerId || '');

    (async () => {
      try {
        if (userRole === 'customer') {
          let resolvedAvatar = activeTherapistAvatar;

          if (therapistId) {
            const therapistRecord = await getTherapistById(therapistId);
            if (cancelled) return;
            const fromTherapist = therapistRecord
              ? resolveTherapistImageUriForUi(therapistRecord)
              : '';
            if (fromTherapist) {
              resolvedAvatar = fromTherapist;
            }

            if (!resolvedAvatar) {
              const profile = await getUserProfileByUid(therapistId);
              if (cancelled) return;
              resolvedAvatar = resolveProfileAvatarUri(profile);
            }
          }

          if (!cancelled) setIncomingAvatarUri(resolvedAvatar);
          return;
        }

        if (!customerId) {
          if (!cancelled) setIncomingAvatarUri('');
          return;
        }

        const profile = await getUserProfileByUid(customerId);
        if (!cancelled) {
          setIncomingAvatarUri(resolveProfileAvatarUri(profile));
        }
      } catch {
        if (!cancelled) {
          setIncomingAvatarUri(userRole === 'customer' ? activeTherapistAvatar : '');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeBooking?.therapist.id,
    existingRoom?.customerId,
    existingRoom?.therapistId,
    therapist?.avatar,
    userRole,
  ]);

  // Initialize chat room and load messages
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let currentRoomId = existingRoom?.id || null;

        // If we have an active booking but no room yet, create/get one
        if (!currentRoomId && activeBooking) {
          const therapistId = activeBooking.therapist.id;
          const customerName = user?.displayName || user?.phoneNumber || '';
          // Use bookingId from activeBooking if available, otherwise generate a reference
          const bookingRef = activeBooking.bookingId || `${userId}_${therapistId}_${Date.now()}`;
          currentRoomId = await getOrCreateChatRoom(
            bookingRef,
            userId,
            therapistId,
            customerName,
            activeBooking.therapist.name,
          );
        }

        if (!currentRoomId || cancelled) return;

        setRoomId(currentRoomId);

        // Send system welcome messages once per opened room.
        const existingMessages = await getChatMessages(currentRoomId, 1);
        const shouldSendWelcome =
          existingMessages.length === 0 && !bootstrappedRoomIdsRef.current.has(currentRoomId);
        if (shouldSendWelcome) {
          bootstrappedRoomIdsRef.current.add(currentRoomId);
          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
          await sendChatMessage(
            currentRoomId,
            'system',
            'system',
            `${chatStrings.connected}\n\n${chatStrings.bookingTime} ${timeStr} ${dateStr}`,
            'system',
          );
          await sendChatMessage(
            currentRoomId,
            'system',
            'system',
            `${chatStrings.noteWarning}\n\n${chatStrings.noteWarning2}`,
            'system',
          );
        }

        // Load existing messages
        const msgs = await getChatMessages(currentRoomId);
        if (!cancelled) {
          setMessages(msgs);
          setLoading(false);
        }

        // Mark messages as read
        markChatMessagesRead(currentRoomId, userId).catch(() => {});
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [existingRoom?.id, activeBooking?.therapist.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to realtime messages
  useEffect(() => {
    if (!roomId) return;
    const unsubscribe = subscribeToChatMessages(roomId, (newMsg) => {
      setMessages((prev) => {
        // Avoid duplicate messages
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      // Mark as read if from others
      if (newMsg.senderId !== userId) {
        markChatMessagesRead(roomId, userId).catch(() => {});
      }
    });
    return unsubscribe;
  }, [roomId, userId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(() => {
    if (!messageText.trim() || !roomId) return;
    const text = messageText.trim();
    setMessageText('');

    // Optimistic local message
    const optimisticMsg: ChatMessage = {
      id: `pending-${Date.now()}`,
      roomId,
      senderId: userId,
      senderRole: userRole,
      content: text,
      messageType: 'text',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    // Persist then broadcast so the other party receives it instantly
    sendChatMessage(roomId, userId, userRole, text, 'text').then((msgId) => {
      const realMsg: ChatMessage = { ...optimisticMsg, id: msgId };
      // Replace optimistic entry with real one
      setMessages((prev) => prev.map(m => m.id === optimisticMsg.id ? realMsg : m));
      // Broadcast to other party's channel subscription
      broadcastChatMessage(roomId, realMsg).catch(() => {});
    }).catch(() => {
      setMessages((prev) => prev.filter(m => m.id !== optimisticMsg.id));
    });
  }, [messageText, roomId, userId, userRole]);

  const formatMsgTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const visibleMessages = useMemo(() => {
    const seenSystemKeys = new Set<string>();
    return messages.filter((message) => {
      if (message.senderRole !== 'system') return true;

      const content = message.content.trim();
      let key = `system:${content}`;
      if (
        content.startsWith('❗') ||
        content.startsWith('NOTE:') ||
        content.startsWith('LƯU Ý:') ||
        content.includes('Massage Now KHÔNG') ||
        content.includes('Massage Now does NOT')
      ) {
        key = 'system-warning';
      } else if (content.includes(chatStrings.connected) && content.includes(chatStrings.bookingTime)) {
        key = 'system-connected';
      }

      if (seenSystemKeys.has(key)) return false;
      seenSystemKeys.add(key);
      return true;
    });
  }, [chatStrings.bookingTime, chatStrings.connected, messages]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMyMessage = item.senderId === userId;
    const isSystem = item.senderRole === 'system';

    if (isSystem) {
      const isWarning =
        item.content.startsWith('❗') ||
        item.content.startsWith('NOTE:') ||
        item.content.startsWith('LƯU Ý:');
      const systemContent = item.content
        .replace(/^[❗🟢]\s*/, '')
        .replace(/Massage Now/g, 'Zena');
      const isConnected = systemContent.includes(chatStrings.connected);
      const bookingTimeLine =
        systemContent
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line.includes(chatStrings.bookingTime)) ?? '';
      if (isWarning) {
        return (
          <View style={activeStyles.warningBubble}>
            <View style={activeStyles.systemMessageRow}>
              <Feather name="alert-triangle" size={16} color="#C05A19" />
              <Text style={activeStyles.warningText}>{systemContent}</Text>
            </View>
          </View>
        );
      }
      return (
        <View style={activeStyles.systemBubble}>
          {isConnected ? (
            <>
              <View style={activeStyles.connectedRow}>
                <View style={activeStyles.connectedDot} />
                <Text style={activeStyles.connectedText}>{chatStrings.connected}</Text>
              </View>
              {!!bookingTimeLine && (
                <Text style={activeStyles.systemTimeText}>{bookingTimeLine}</Text>
              )}
            </>
          ) : (
            <Text style={activeStyles.systemText}>{systemContent}</Text>
          )}
          <Text style={[activeStyles.msgTime, isConnected && activeStyles.connectedMetaTime]}>
            {formatMsgTime(item.createdAt)}
          </Text>
        </View>
      );
    }

    if (isMyMessage) {
      return (
        <View style={activeStyles.userMsgRow}>
          <View style={activeStyles.userBubble}>
            <Text style={activeStyles.userMsgText}>{item.content}</Text>
            <View style={activeStyles.msgFooter}>
              <Text style={activeStyles.msgTime}>{formatMsgTime(item.createdAt)}</Text>
              {item.isRead && <Text style={activeStyles.readIndicator}>✓✓</Text>}
            </View>
          </View>
        </View>
      );
    }

    // Other party's message
    return (
      <View style={activeStyles.therapistMsgRow}>
        {incomingAvatarUri ? (
          <View style={activeStyles.therapistMsgAvatarWrap}>
            <Image
              source={{ uri: incomingAvatarUri }}
              style={activeStyles.therapistMsgAvatar}
              onError={() => setIncomingAvatarUri('')}
            />
          </View>
        ) : (
          <View style={[activeStyles.therapistMsgAvatarWrap, { backgroundColor: '#E8F0FE', alignItems: 'center', justifyContent: 'center', borderRadius: 12 }]}>
            <Feather name="user" size={18} color="#5F8F47" />
          </View>
        )}
        <View style={activeStyles.therapistBubble}>
          <Text style={activeStyles.therapistMsgText}>{item.content}</Text>
          <View style={activeStyles.therapistMsgFooter}>
            <Text style={activeStyles.msgTime}>{formatMsgTime(item.createdAt)}</Text>
            <TouchableOpacity style={activeStyles.translateBtn}>
              <Feather name="globe" size={12} color="#5F8F47" />
              <Text style={activeStyles.translateText}>{chatStrings.translate}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={activeStyles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <View style={activeStyles.header}>
          <TouchableOpacity style={activeStyles.backBtn} onPress={onClose}>
            <Feather name="arrow-left" size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={activeStyles.headerName}>{therapistName}</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.green} />
          <Text style={{ marginTop: 12, color: COLORS.subText }}>{chatStrings.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={activeStyles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View style={activeStyles.header}>
        <TouchableOpacity style={activeStyles.backBtn} onPress={onClose}>
          <Feather name="arrow-left" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={activeStyles.headerName}>{therapistName}</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Chat messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={visibleMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={activeStyles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Bottom input area */}
        <View style={activeStyles.inputArea}>
          <View style={activeStyles.inputToolbar}>
            <TouchableOpacity style={activeStyles.toolbarBtn}>
              <Feather name="phone" size={16} color="#5F8F47" />
              <Text style={activeStyles.toolbarLabel}>{chatStrings.call}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={activeStyles.toolbarBtn}>
              <Feather name="image" size={16} color="#5F8F47" />
              <Text style={activeStyles.toolbarLabel}>{chatStrings.library}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={activeStyles.toolbarBtn}>
              <Feather name="map-pin" size={16} color="#5F8F47" />
              <Text style={activeStyles.toolbarLabel}>{chatStrings.location}</Text>
            </TouchableOpacity>
          </View>
          <View style={activeStyles.inputRow}>
            <TextInput
              style={activeStyles.textInput}
              value={messageText}
              onChangeText={setMessageText}
              placeholder={chatStrings.typeMessage}
              placeholderTextColor="#999"
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity style={activeStyles.sendBtn} onPress={handleSend}>
              <Feather name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const activeStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F6' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E3E8E1',
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerName: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  messagesList: { padding: 16, paddingBottom: 8 },
  systemBubble: {
    backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 18,
    marginBottom: 12, alignSelf: 'center', minWidth: 240, maxWidth: '90%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
    alignItems: 'center',
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 18,
  },
  connectedDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#19C826',
    shadowColor: '#19C826',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 2,
  },
  connectedText: { color: '#1A1A1A', fontSize: 15, fontWeight: '500' },
  systemTimeText: { alignSelf: 'flex-start', fontSize: 14, color: '#1A1A1A', lineHeight: 20 },
  connectedMetaTime: { alignSelf: 'flex-start', marginTop: 4 },
  systemMessageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  systemText: { fontSize: 13, color: '#1A1A1A', lineHeight: 20, textAlign: 'center' },
  warningBubble: {
    backgroundColor: '#FFF9E6', borderRadius: 14, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: '#F5E6B8',
  },
  warningText: { fontSize: 12, color: '#8B6914', lineHeight: 18 },
  therapistMsgRow: {
    flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, gap: 8,
  },
  therapistMsgAvatarWrap: {
    width: 36, height: 36, borderRadius: 12, overflow: 'hidden',
  },
  therapistMsgAvatar: { width: '100%', height: '100%' },
  therapistBubble: {
    backgroundColor: '#fff', borderRadius: 18,
    borderTopLeftRadius: 4, padding: 12, maxWidth: '75%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  therapistMsgText: { fontSize: 15, color: '#1A1A1A', lineHeight: 22 },
  therapistMsgFooter: {
    flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 10,
  },
  userMsgRow: {
    flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12,
  },
  userBubble: {
    backgroundColor: '#EDF4EA', borderRadius: 18,
    borderTopRightRadius: 4, padding: 12, maxWidth: '75%',
  },
  userMsgText: { fontSize: 15, color: '#1A1A1A', lineHeight: 22 },
  msgTime: { fontSize: 11, color: '#999', marginTop: 4 },
  msgFooter: {
    flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4,
  },
  readIndicator: { fontSize: 11, color: '#5F8F47' },
  translateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EEF2EE', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  translateText: { fontSize: 11, color: '#5F8F47', fontWeight: '600' },
  inputArea: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E3E8E1',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  inputToolbar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, gap: 20,
  },
  toolbarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toolbarLabel: { fontSize: 13, color: '#5F8F47', fontWeight: '600' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingVertical: 8, gap: 8,
  },
  textInput: {
    flex: 1, backgroundColor: '#F1F3F1', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#1A1A1A',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#5F8F47', alignItems: 'center', justifyContent: 'center',
  },
});

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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },

  // Search
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
    opacity: 0.5,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },

  // Online Section
  onlineSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  onlineItem: {
    alignItems: 'center',
    width: 56,
  },
  onlineAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F0E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  onlineAvatarEmoji: {
    fontSize: 24,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.greenOnline,
    borderWidth: 2.5,
    borderColor: COLORS.bg,
  },
  onlineName: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },

  // Chat list
  listContent: {
    paddingBottom: 40,
  },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  chatCardUnread: {
    backgroundColor: COLORS.unreadBg,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#F3E4E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSupport: {
    backgroundColor: '#E8F0FE',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.greenOnline,
    borderWidth: 2.5,
    borderColor: COLORS.bg,
  },
  chatBody: {
    flex: 1,
  },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  chatName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  chatNameBold: {
    fontWeight: '800',
  },
  chatTime: {
    fontSize: 12,
    color: COLORS.lightText,
  },
  chatTimeActive: {
    color: COLORS.blue,
    fontWeight: '600',
  },
  chatBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatLastMsg: {
    fontSize: 13,
    color: COLORS.subText,
    flex: 1,
    marginRight: 8,
  },
  chatLastMsgBold: {
    color: COLORS.text,
    fontWeight: '600',
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },

  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
    paddingHorizontal: 40,
  },
  emptyIcon: { marginBottom: 16, opacity: 0.5 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.subText,
    textAlign: 'center',
    lineHeight: 20,
  },
});
