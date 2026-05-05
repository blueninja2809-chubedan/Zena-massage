import { AppColors } from '@/constants/appColors';
import { getExpoAdminDisplayName, getExpoAdminUserId } from '@/constants/adminSupport';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import {
  getChatMessages,
  getOrCreateTherapistAdminChatRoom,
  markChatMessagesRead,
  sendChatMessage,
  subscribeToChatMessages,
  type ChatMessage,
} from '@/lib/supabaseService';
import { unknownErrorMessage } from '@/lib/unknownErrorMessage';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const THEME = {
  bg: AppColors.bg,
  card: AppColors.white,
  primary: AppColors.primary,
  text: AppColors.text,
  muted: AppColors.textMuted,
  border: AppColors.border,
  adminBubble: 'rgba(253, 129, 44, 0.1)',
  meBubble: AppColors.primaryDark,
  meText: '#fff',
  verified: '#C62828',
};

export default function TherapistAdminChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { language } = useLanguage();
  const isEn = language === 'en';
  const userId = user?.authUid ? String(user.authUid) : '';
  const displayName = (user?.displayName ?? user?.phoneNumber ?? 'KTV').trim() || 'KTV';
  const adminId = getExpoAdminUserId();
  const adminDisplayName = getExpoAdminDisplayName();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const isTherapist = user?.role === 'therapist';

  const loadChat = useCallback(async () => {
    if (!userId || !isTherapist) return;
    setError(null);
    setLoading(true);
    setMessages([]);
    setRoomId(null);
    try {
      const id = await getOrCreateTherapistAdminChatRoom(userId, displayName);
      setRoomId(id);
      const msgs = await getChatMessages(id, 200, 0);
      setMessages(msgs);
      void markChatMessagesRead(id, userId);
    } catch (e) {
      const msg = unknownErrorMessage(e);
      setError(
        msg === 'missing_admin_env'
          ? isEn
            ? 'Cannot load chat: set EXPO_PUBLIC_ADMIN_USER_ID or use app defaults in constants.'
            : 'Không tải được chat: cấu hình EXPO_PUBLIC_ADMIN_USER_ID hoặc dùng mặc định trong app.'
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }, [userId, displayName, isEn, isTherapist]);

  useEffect(() => {
    if (isTherapist && userId) {
      void loadChat();
    } else {
      setRoomId(null);
      setMessages([]);
      setDraft('');
      setError(null);
    }
  }, [isTherapist, userId, loadChat]);

  useEffect(() => {
    if (!roomId) {
      return;
    }
    const unsub = subscribeToChatMessages(roomId, (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) {
          return prev;
        }
        return [...prev, msg];
      });
      if (msg.senderId !== userId) {
        void markChatMessagesRead(roomId, userId);
      }
    });
    return unsub;
  }, [roomId, userId]);

  const handleSend = async () => {
    const t = draft.trim();
    if (!t || !roomId || !userId || sending) {
      return;
    }
    setDraft('');
    setSending(true);
    try {
      await sendChatMessage(roomId, userId, 'therapist', t, 'text');
    } catch {
      setDraft(t);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const labelForIncoming = (item: ChatMessage) => {
    if (item.senderRole === 'admin' || item.senderId === adminId) {
      return adminDisplayName;
    }
    return isEn ? 'Support' : 'Hỗ trợ';
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (item.senderRole === 'system') {
      return (
        <View style={styles.systemWrap}>
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      );
    }
    const isMe = item.senderId === userId;
    if (isMe) {
      return (
        <View style={styles.rowMe}>
          <View style={styles.bubbleMe}>
            <Text style={styles.textMe}>{item.content}</Text>
            <Text style={styles.timeMe}>{formatTime(item.createdAt)}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.rowThem}>
        <View style={styles.bubbleThem}>
          <Text style={styles.labelThem}>{labelForIncoming(item)}</Text>
          <Text style={styles.textThem}>{item.content}</Text>
          <Text style={styles.timeThem}>{formatTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  if (!userId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.gateBody}>
          <Text style={styles.gateTitle}>{isEn ? 'Sign in required' : 'Cần đăng nhập'}</Text>
          <Text style={styles.gateText}>
            {isEn ? 'Log in with your therapist account to use Support chat.' : 'Đăng nhập tài khoản KTV để dùng chat hỗ trợ.'}
          </Text>
          <Pressable style={styles.gateBtn} onPress={() => router.back()}>
            <Text style={styles.gateBtnText}>{isEn ? 'Back' : 'Quay lại'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!isTherapist) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.gateBody}>
          <Text style={styles.gateTitle}>{isEn ? 'Therapists only' : 'Dành cho kỹ thuật viên'}</Text>
          <Text style={styles.gateText}>
            {isEn
              ? 'In-app support chat is for therapist accounts only.'
              : 'Chat hỗ trợ nội bộ chỉ dành cho tài khoản kỹ thuật viên.'}
          </Text>
          <Pressable style={styles.gateBtn} onPress={() => router.back()}>
            <Text style={styles.gateBtnText}>{isEn ? 'Back' : 'Quay lại'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <LinearGradient
        colors={[AppColors.primaryDark, AppColors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerGradient, { paddingTop: Math.max(insets.top, 8) }]}
      >
        <View style={styles.headerTop}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            hitSlop={12}
            accessibilityLabel={isEn ? 'Back' : 'Quay lại'}
          >
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View style={styles.headerIdentity}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                <Feather name="headphones" size={20} color={AppColors.primaryDark} />
              </View>
            </View>
            <View style={styles.headerNameBlock}>
              <View style={styles.nameRow}>
                <Text style={styles.headerName} numberOfLines={1}>
                  {adminDisplayName}
                </Text>
                <Ionicons name="checkmark-circle" size={18} color={THEME.verified} style={styles.verified} />
              </View>
              <Text style={styles.headerSub} numberOfLines={1}>
                {isEn ? 'Zena operations — same thread as the admin panel' : 'Bộ phận vận hành Zena — cùng kênh với trang quản trị'}
              </Text>
            </View>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </LinearGradient>

      {error ? (
        <View style={styles.errorBox}>
          <Feather name="alert-circle" size={18} color="#8B2E2E" style={styles.errorIcon} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={THEME.primary} />
          <Text style={styles.loadHint}>{isEn ? 'Connecting to Support…' : 'Đang kết nối với bộ phận hỗ trợ…'}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={renderItem}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="message-circle" size={28} color={AppColors.primaryMuted} />
                </View>
                <Text style={styles.emptyTitle}>
                  {isEn ? 'Start a conversation' : 'Bắt đầu trò chuyện'}
                </Text>
                <Text style={styles.emptyDesc}>
                  {isEn
                    ? 'Ask about your schedule, disputes, or anything the operations team should know.'
                    : 'Hỏi lịch làm, khiếu nại, hoặc nội dung cần bộ phận vận hành hỗ trợ.'}
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              placeholder={isEn ? 'Type a message…' : 'Nhập tin nhắn…'}
              placeholderTextColor={THEME.muted}
              value={draft}
              onChangeText={setDraft}
              editable={!!roomId && !sending}
              multiline
              maxLength={2000}
            />
            <Pressable
              style={[styles.sendBtn, (!draft.trim() || sending || !roomId) && styles.sendDisabled]}
              onPress={() => void handleSend()}
              disabled={!draft.trim() || sending || !roomId}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Feather name="send" size={18} color="#fff" />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  headerGradient: {
    paddingBottom: 14,
    paddingHorizontal: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 4,
  },
  headerSpacer: { width: 44 },
  avatarRing: {
    padding: 2,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  avatarInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerNameBlock: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  headerName: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  verified: { marginTop: 1 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 3, lineHeight: 16 },
  errorBox: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(200, 60, 60, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200, 60, 60, 0.25)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  errorIcon: { marginTop: 1 },
  errorText: { flex: 1, color: '#6B2E2E', fontSize: 14, lineHeight: 20 },
  fill: { flex: 1 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadHint: { marginTop: 14, color: THEME.muted, fontSize: 15, textAlign: 'center' },
  listContent: { padding: 16, paddingBottom: 12, flexGrow: 1 },
  emptyWrap: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 8 },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: AppColors.primarySoft2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: THEME.text, marginBottom: 6 },
  emptyDesc: { fontSize: 14, color: THEME.muted, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  rowMe: { alignItems: 'flex-end', marginBottom: 12 },
  bubbleMe: {
    maxWidth: '82%',
    backgroundColor: THEME.meBubble,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 6,
  },
  textMe: { color: THEME.meText, fontSize: 16, lineHeight: 22 },
  timeMe: { color: 'rgba(255,255,255,0.88)', fontSize: 11, marginTop: 4, alignSelf: 'flex-end' },
  rowThem: { alignItems: 'flex-start', marginBottom: 12 },
  bubbleThem: {
    maxWidth: '82%',
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    shadowColor: '#2F241C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  labelThem: { fontSize: 12, fontWeight: '800', color: THEME.primary, marginBottom: 4 },
  textThem: { color: THEME.text, fontSize: 16, lineHeight: 22 },
  timeThem: { color: THEME.muted, fontSize: 11, marginTop: 4 },
  systemWrap: { alignSelf: 'center', marginBottom: 10, maxWidth: '92%' },
  systemText: { fontSize: 12, color: THEME.muted, textAlign: 'center' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: THEME.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: THEME.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: THEME.text,
    backgroundColor: AppColors.bgAlt,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.45 },
  gateBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  gateTitle: { fontSize: 20, fontWeight: '800', color: THEME.text, textAlign: 'center', marginBottom: 8 },
  gateText: { fontSize: 15, color: THEME.muted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  gateBtn: {
    alignSelf: 'center',
    backgroundColor: AppColors.primaryDark,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  gateBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
