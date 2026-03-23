import { FontAwesome5 } from '@expo/vector-icons';
import Feather from '@expo/vector-icons/Feather';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    FlatList,
    Image,
    Modal,
    PanResponder,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OnboardingLanguage } from '@/components/Onboarding';
import TherapistTopUpScreen from '@/components/TherapistTopUpScreen';
import WalletScreen from '@/components/WalletScreen';
import { useBookings } from '@/contexts/BookingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { getOrCreateWallet, getTherapistShifts, saveTherapistShifts } from '@/lib/supabaseService';

const translations: Record<OnboardingLanguage, Record<string, string>> = {
  vi: {
    title: 'Ca làm việc',
    today: 'Hôm nay',
    tomorrow: 'Ngày mai',
    dayAfter: 'Ngày kia',
    edit: 'Chỉnh sửa',
    noSchedule: 'Chưa thiết lập ca làm việc',
    balance: 'Số dư',
    topUp: 'Nạp tiền',
    appointments: 'lịch hẹn',
    location: 'Hà Nội',
    bannerTitle: 'Massage tại nhà',
    bannerDesc: 'Xem & chọn kỹ thuật viên phục vụ tận nhà',
    editTitle: 'Đăng ký ca làm việc',
    save: 'Lưu',
    cancel: 'Huỷ',
    saving: 'Đang lưu...',
    saveSuccess: 'Đã lưu ca làm việc thành công!',
    saveError: 'Không thể lưu ca làm việc. Vui lòng thử lại.',
    support: 'Hỗ trợ',
    supportChannels: 'Kênh hỗ trợ',
  },
  en: {
    title: 'Shift schedule',
    today: 'Today',
    tomorrow: 'Tomorrow',
    dayAfter: 'Day after',
    edit: 'Edit',
    noSchedule: 'No shifts set',
    balance: 'Balance',
    topUp: 'Top up',
    appointments: 'appointments',
    location: 'Hanoi',
    bannerTitle: 'Home massage',
    bannerDesc: 'Find a therapist at your place',
    editTitle: 'Register work shifts',
    save: 'Save',
    cancel: 'Cancel',
    saving: 'Saving...',
    saveSuccess: 'Shifts saved successfully!',
    saveError: 'Could not save shifts. Please try again.',
    support: 'Support',
    supportChannels: 'Support channels',
  },
};

const C = {
  bg: '#F5F9FF',
  card: '#FFFFFF',
  text: '#1A1A1A',
  sub: '#5C85B0',
  line: '#F0E4E6',
  accent: '#2196F3',
  accentSoft: '#E3F2FD',
  slotBg: '#F5F9FF',
};

const supportChannels = [
  { id: 'zalo', name: 'Zalo', iconType: 'zalo' as const, iconName: '', color: '#FFFFFF' },
  { id: 'line', name: 'Line', iconType: 'fa5' as const, iconName: 'line', color: '#06C755' },
  { id: 'kakao', name: 'Kakao Talk', iconType: 'text' as const, iconName: 'K', color: '#FEE500', iconColor: '#3C1E1E' },
  { id: 'whatsapp', name: 'Whatsapp', iconType: 'fa5' as const, iconName: 'whatsapp', color: '#25D366' },
  { id: 'messenger', name: 'Messenger', iconType: 'fa5' as const, iconName: 'facebook-messenger', color: '#0084FF' },
  { id: 'telegram', name: 'Telegram', iconType: 'fa5' as const, iconName: 'telegram-plane', color: '#26A5E4' },
];
const FONT_ELEGANT = Platform.select({
  ios: 'System',
  android: 'sans-serif-light',
  default: undefined,
});

const SHIFT_SLOTS = [
  '00h - 02h', '02h - 04h',
  '04h - 06h', '06h - 08h',
  '08h - 10h', '10h - 12h',
  '12h - 14h', '14h - 16h',
  '16h - 18h', '18h - 20h',
  '20h - 22h', '22h - 0h',
];

export default function TherapistScheduleScreen() {
  const { language } = useLanguage();
  const { user } = useUser();
  const { getTherapistBookings } = useBookings();
  const t = translations[language as OnboardingLanguage] || translations.vi;
  const [walletBalance, setWalletBalance] = useState(0);
  const [showWallet, setShowWallet] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  // Draggable support button
  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => { pan.flattenOffset(); },
    }),
  ).current;

  const handleSelectSupport = (channel: typeof supportChannels[0]) => {
    console.log('Selected support channel:', channel.name);
    setShowSupportModal(false);
  };

  // Shift data per date: { 'YYYY-MM-DD': string[] }
  const [shiftsByDate, setShiftsByDate] = useState<Record<string, string[]>>({});

  // Edit modal state: shifts for today & tomorrow being edited
  const [editSlots, setEditSlots] = useState<Record<string, string[]>>({});

  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const displayName = user?.displayName || user?.phoneNumber || 'KTV';
  const allBookings = getTherapistBookings(displayName);

  const todayBookings = useMemo(
    () => allBookings.filter((b) => b.date === today && b.status !== 'cancelled'),
    [allBookings, today],
  );
  const tomorrowBookings = useMemo(
    () => allBookings.filter((b) => b.date === tomorrowDate && b.status !== 'cancelled'),
    [allBookings, tomorrowDate],
  );

  const loadWalletBalance = () => {
    if (!user?.authUid) return;
    getOrCreateWallet(user.authUid)
      .then((w) => setWalletBalance(w.balance))
      .catch(() => {});
  };

  const loadShifts = useCallback(() => {
    if (!user?.authUid) return;
    getTherapistShifts(user.authUid, today, tomorrowDate)
      .then((rows) => {
        const map: Record<string, string[]> = {};
        for (const r of rows) {
          map[r.shiftDate] = r.slots;
        }
        setShiftsByDate(map);
      })
      .catch(() => {});
  }, [user?.authUid, today, tomorrowDate]);

  useEffect(() => {
    loadWalletBalance();
    loadShifts();
  }, [user?.authUid, loadShifts]);

  const todaySlots = shiftsByDate[today] || [];
  const tomorrowSlots = shiftsByDate[tomorrowDate] || [];

  const openEditModal = () => {
    setEditSlots({
      [today]: [...todaySlots],
      [tomorrowDate]: [...tomorrowSlots],
    });
    setShowEditModal(true);
  };

  const toggleEditSlot = (date: string, slot: string) => {
    setEditSlots((prev) => {
      const current = prev[date] || [];
      const updated = current.includes(slot)
        ? current.filter((s) => s !== slot)
        : [...current, slot];
      return { ...prev, [date]: updated };
    });
  };

  const handleSave = async () => {
    if (!user?.authUid) return;
    setSaving(true);
    try {
      const userName = user.displayName || user.phoneNumber || '';
      await saveTherapistShifts(user.authUid, today, editSlots[today] || [], userName);
      await saveTherapistShifts(user.authUid, tomorrowDate, editSlots[tomorrowDate] || [], userName);
      setShiftsByDate({ ...editSlots });
      setShowEditModal(false);
      Alert.alert('', t.saveSuccess);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[handleSave] Error:', msg);
      Alert.alert('', `${t.saveError}\n\n${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const formatDateLabel = (dateStr: string) => {
    if (dateStr === today) return t.today;
    if (dateStr === tomorrowDate) return t.tomorrow;
    return dateStr;
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.contentWrap}>
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            {user?.avatarUri ? (
              <Image source={{ uri: user.avatarUri }} style={s.avatar} />
            ) : (
              <View style={s.avatarFallback}>
                <Text style={s.avatarText}>👩</Text>
              </View>
            )}
            <Text style={s.locationText}>{t.location}</Text>
            <Feather name="chevron-down" size={16} color={C.sub} />
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.iconBtn}><Feather name="bell" size={19} color={C.text} /></TouchableOpacity>
            <TouchableOpacity style={s.iconBtn}><Feather name="message-circle" size={19} color={C.text} /></TouchableOpacity>
          </View>
        </View>

        <View style={s.balanceWrap}>
          <TouchableOpacity style={s.balanceLabelWrap} onPress={() => setShowWallet(true)}>
            <Text style={s.balanceLabel}>{t.balance}</Text>
            <Feather name="chevron-right" size={14} color={C.sub} />
          </TouchableOpacity>
          <View style={s.balanceRow}>
            <Text style={s.balanceValue}>{walletBalance.toLocaleString('vi-VN')}đ</Text>
            <TouchableOpacity
              style={s.topUpBtn}
              activeOpacity={0.8}
              onPress={() => setShowTopUp(true)}
            >
              <Text style={s.topUpBtnText}>{t.topUp}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.sectionHead}>
          <Text style={s.title}>{t.title}</Text>
          <TouchableOpacity onPress={openEditModal}>
            <Text style={s.editText}>{t.edit}</Text>
          </TouchableOpacity>
        </View>

        {/* Today */}
        <View style={s.dayCard}>
          <View style={s.leftCol}>
            <Text style={s.dayText}>{t.today}</Text>
            <Text style={s.daySub}>{todayBookings.length} {t.appointments}</Text>
          </View>
          <View style={s.slotWrap}>
            {SHIFT_SLOTS.map((slot) => {
              const active = todaySlots.includes(slot);
              return (
                <View
                  key={slot}
                  style={[s.slotChip, active && s.slotChipActive]}
                >
                  <Text style={[s.slotChipText, active && s.slotChipTextActive]}>{slot}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Tomorrow */}
        <View style={[s.dayCard, { marginTop: 12 }]}>
          <View style={s.leftCol}>
            <Text style={s.dayText}>{t.tomorrow}</Text>
            <Text style={s.daySub}>
              {tomorrowSlots.length > 0
                ? `${tomorrowBookings.length} ${t.appointments}`
                : ''}
            </Text>
          </View>
          {tomorrowSlots.length > 0 ? (
            <View style={s.slotWrap}>
              {SHIFT_SLOTS.map((slot) => {
                const active = tomorrowSlots.includes(slot);
                return (
                  <View
                    key={slot}
                    style={[s.slotChip, active && s.slotChipActive]}
                  >
                    <Text style={[s.slotChipText, active && s.slotChipTextActive]}>{slot}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={s.tomorrowRight}>
              <Text style={s.tomorrowText}>{t.noSchedule}</Text>
            </View>
          )}
        </View>

      </ScrollView>

      {/* Top-up screen */}
      <Modal visible={showTopUp} animationType="slide" onRequestClose={() => setShowTopUp(false)}>
        <TherapistTopUpScreen onClose={() => { setShowTopUp(false); loadWalletBalance(); }} />
      </Modal>

      {/* Wallet screen */}
      <Modal visible={showWallet} animationType="slide" onRequestClose={() => setShowWallet(false)}>
        <WalletScreen onClose={() => { setShowWallet(false); loadWalletBalance(); }} />
      </Modal>

      {/* Edit shifts modal */}
      <Modal visible={showEditModal} animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <SafeAreaView style={s.modalContainer} edges={['top', 'bottom']}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <Text style={s.modalCancel}>{t.cancel}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>{t.editTitle}</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <Text style={s.modalSave}>{t.save}</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalContent}>
            {[today, tomorrowDate].map((dateStr) => (
              <View key={dateStr} style={s.modalDaySection}>
                <Text style={s.modalDayLabel}>{formatDateLabel(dateStr)}  ({dateStr})</Text>
                <View style={s.modalSlotWrap}>
                  {SHIFT_SLOTS.map((slot) => {
                    const active = (editSlots[dateStr] || []).includes(slot);
                    return (
                      <TouchableOpacity
                        key={slot}
                        style={[s.slotChip, active && s.slotChipActive]}
                        onPress={() => toggleEditSlot(dateStr, slot)}
                        activeOpacity={0.85}
                      >
                        <Text style={[s.slotChipText, active && s.slotChipTextActive]}>{slot}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Floating Support Button (draggable) */}
      <Animated.View
        style={[s.supportBtnWrap, { transform: pan.getTranslateTransform() }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={s.supportBtn}
          activeOpacity={0.85}
          onPress={() => setShowSupportModal(true)}
        >
          <Text style={s.supportBtnIcon}>💬</Text>
          <Text style={s.supportBtnText}>{t.support}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Support Channels Modal */}
      <Modal visible={showSupportModal} transparent animationType="slide">
        <View style={s.supportModalOverlay}>
          <View style={s.supportModalContent}>
            <View style={s.supportModalHeader}>
              <Text style={s.supportModalTitle}>{t.supportChannels}</Text>
              <TouchableOpacity onPress={() => setShowSupportModal(false)}>
                <Text style={s.supportCloseBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={supportChannels}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.supportChannelItem}
                  onPress={() => handleSelectSupport(item)}
                >
                  <View style={[s.supportIconBox, { backgroundColor: item.color }]}>
                    {item.iconType === 'zalo' ? (
                      <Image source={require('../../assets/images/zalo-logo.png')} style={{ width: 36, height: 36 }} resizeMode="contain" />
                    ) : item.iconType === 'fa5' ? (
                      <FontAwesome5 name={item.iconName} size={22} color="#fff" />
                    ) : (
                      <Text style={[s.supportIconText, item.iconColor ? { color: item.iconColor } : undefined]}>{item.iconName}</Text>
                    )}
                  </View>
                  <Text style={s.supportChannelName}>{item.name}</Text>
                  <Text style={s.supportChevron}>›</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  contentWrap: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EDE0E2', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18 },
  locationText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  headerRight: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDE0E2',
  },
  balanceWrap: {
    marginTop: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  balanceLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  balanceLabel: { fontSize: 13, color: '#666666', fontWeight: '500' },
  balanceRow: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceValue: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.3,
  },
  topUpBtn: { backgroundColor: C.accent, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  topUpBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  sectionHead: { marginTop: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  editText: { color: C.text, fontSize: 14, fontWeight: '700' },
  dayCard: {
    borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff',
    overflow: 'hidden', flexDirection: 'row',
  },
  leftCol: { width: 106, backgroundColor: '#FFF3F5', paddingHorizontal: 12, justifyContent: 'center' },
  dayText: { color: C.text, fontWeight: '800', fontSize: 16 },
  daySub: { color: '#666666', marginTop: 4, fontSize: 12 },
  slotWrap: { flex: 1, padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  slotChip: {
    width: '47%', borderRadius: 12, paddingVertical: 11, alignItems: 'center',
    backgroundColor: C.slotBg, borderWidth: 1, borderColor: C.line,
  },
  slotChipActive: { backgroundColor: C.accentSoft, borderColor: '#E8CDD3' },
  slotChipText: { color: C.text, fontSize: 15, fontWeight: '700' },
  slotChipTextActive: { color: C.text },
  tomorrowCard: {
    marginTop: 12, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: '#fff',
    flexDirection: 'row',
  },
  tomorrowLeft: { width: 106, backgroundColor: '#FFF3F5', paddingHorizontal: 12, paddingVertical: 14, justifyContent: 'center' },
  tomorrowRight: { flex: 1, justifyContent: 'center', paddingHorizontal: 14 },
  tomorrowText: { color: '#666666', fontSize: 16 },
  // Edit modal
  modalContainer: { flex: 1, backgroundColor: C.bg },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line,
    backgroundColor: '#fff',
  },
  modalCancel: { color: '#666666', fontSize: 15, fontWeight: '600' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  modalSave: { color: C.text, fontSize: 15, fontWeight: '700' },
  modalContent: { padding: 16, paddingBottom: 40 },
  modalDaySection: { marginBottom: 24 },
  modalDayLabel: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 12 },
  modalSlotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Floating support button
  supportBtnWrap: {
    position: 'absolute',
    right: 16,
    bottom: 18,
    zIndex: 100,
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  supportBtnIcon: { fontSize: 18 },
  supportBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  // Support modal
  supportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'flex-end',
  },
  supportModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
    maxHeight: '60%',
  },
  supportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  supportModalTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  supportCloseBtn: { fontSize: 24, color: '#666666', fontWeight: '400' },
  supportChannelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    gap: 12,
  },
  supportIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportIconText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  supportChannelName: { fontSize: 15, fontWeight: '600', color: C.text, flex: 1 },
  supportChevron: { fontSize: 18, color: '#666666' },
});
