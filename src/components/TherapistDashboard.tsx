import Feather from '@expo/vector-icons/Feather';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OnboardingLanguage } from '@/components/Onboarding';
import { DEFAULT_CITY, SERVICE_TYPES, VIETNAM_PROVINCES } from '@/constants/bookingFilters';
import type { SharedBooking } from '@/contexts/BookingsContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { checkTherapistMinBalance, getTherapistAvailability, updateTherapistAvailability } from '@/lib/supabaseService';

const translations: Record<OnboardingLanguage, Record<string, string>> = {
  vi: {
    title: 'Nhận việc',
    rank: 'Hạng thường',
    profileVisible: 'Hiện hồ sơ',
    doneJobs: 'Số đơn đã hoàn thành',
    openJobs: 'Đơn mở',
    estimate: 'Dự kiến thu nhập',
    waiting: 'Đang chờ nhận',
    estimateHint: 'Bạn sẽ nhận',
    filter: 'Bộ lọc',
    city: 'Hà Nội',
    service: 'Dịch vụ',
    all: 'Tất cả',
    doneFilter: 'Đã hoàn thành',
    newJob: 'Việc mới',
    urgent: 'Cần ngay',
    expired: 'Hết hạn',
    apply: 'Ứng tuyển',
    accepted: 'Đã nhận',
    noJobs: 'Hiện chưa có việc phù hợp',
    minutes: 'phút',
    earning: 'Bạn sẽ nhận được',
    recentJobs: 'Công việc phù hợp',
  },
  en: {
    title: 'Jobs',
    rank: 'Standard tier',
    profileVisible: 'Show profile',
    doneJobs: 'Completed jobs',
    openJobs: 'Open jobs',
    estimate: 'Estimated income',
    waiting: 'Waiting',
    estimateHint: 'You get',
    filter: 'Filter',
    city: 'Hanoi',
    service: 'Service',
    all: 'All',
    doneFilter: 'Completed',
    newJob: 'New job',
    urgent: 'Urgent',
    expired: 'Expired',
    apply: 'Apply',
    accepted: 'Accepted',
    noJobs: 'No matching jobs right now',
    minutes: 'min',
    earning: 'You will receive',
    recentJobs: 'Matching jobs',
  },
};

const C = {
  bg: '#FFFBFB',
  card: '#FFFFFF',
  text: '#1A1A1A',
  sub: '#4B5563',
  line: '#C8E6C9',
  accent: '#E53935',
  accentSoft: '#FFCDD2',
  chip: '#FFCDD2',
  urgent: '#F2A51D',
  complete: '#EF5350',
  info: '#E53935',
};
const ALL_SERVICE = 'Tất cả';

export default function TherapistDashboard() {
  const { language } = useLanguage();
  const { user } = useUser();
  const { getTherapistBookings, updateStatus } = useBookings();
  const t = translations[language as OnboardingLanguage] || translations.vi;

  const [isAvailable, setIsAvailable] = useState(true);
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [onlyCompleted, setOnlyCompleted] = useState(false);
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY);
  const [selectedService, setSelectedService] = useState<string>(ALL_SERVICE);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);

  useEffect(() => {
    if (user?.authUid) {
      getTherapistAvailability(user.authUid)
        .then(setIsAvailable)
        .catch(() => {});
    }
  }, [user?.authUid]);

  const handleToggleAvailability = async (value: boolean) => {
    if (!user?.authUid) return;

    // If turning ON, check minimum balance (500,000đ)
    if (value) {
      try {
        const hasMinBalance = await checkTherapistMinBalance(user.authUid, 500000);
        if (!hasMinBalance) {
          Alert.alert(
            language === 'vi' ? 'Số dư không đủ' : 'Insufficient Balance',
            language === 'vi'
              ? 'Bạn cần có ít nhất 500.000đ trong ví để hiện hồ sơ nhận việc. Vui lòng nạp tiền vào ví.'
              : 'You need at least 500,000đ in your wallet to show your profile. Please top up your wallet.',
          );
          return;
        }
      } catch {
        // If check fails, allow toggle but warn
      }
    }

    setIsAvailable(value);
    setTogglingAvailability(true);
    try {
      await updateTherapistAvailability(user.authUid, value);
    } catch {
      setIsAvailable(!value);
    } finally {
      setTogglingAvailability(false);
    }
  };

  const displayName = user?.displayName || user?.phoneNumber || 'KTV';
  const allBookings = getTherapistBookings(displayName);
  const completedCount = allBookings.filter((b) => b.status === 'completed').length;
  const openCount = allBookings.filter((b) => b.status !== 'completed' && b.status !== 'cancelled').length;

  const getDurationMinutes = (time: string) => {
    const parts = time.split('-').map((v) => v.trim());
    if (parts.length !== 2) return 60;
    const [sh, sm] = parts[0].split(':').map(Number);
    const [eh, em] = parts[1].split(':').map(Number);
    if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return 60;
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60;
    return mins;
  };

  const cityOptions = useMemo(() => [t.all, ...VIETNAM_PROVINCES], [t.all]);

  const visibleJobs = useMemo(() => {
    const base = allBookings.filter((b) => b.status !== 'cancelled');

    const byCity = selectedCity === t.all
      ? base
      : base.filter((b) => (b.address || '').toLowerCase().includes(selectedCity.toLowerCase()));

    const byService = selectedService === ALL_SERVICE
      ? byCity
      : byCity.filter((b) => (b.service || '').toLowerCase().includes(selectedService.toLowerCase()));

    const filtered = onlyCompleted ? byService.filter((b) => b.status === 'completed') : byService;
    return filtered.sort((a, b) => b.date.localeCompare(a.date));
  }, [allBookings, onlyCompleted, selectedCity, selectedService, t.all]);

  const projectedIncome = useMemo(
    () => visibleJobs.reduce((sum, b) => sum + Math.round((b.price * 0.67) / 1000) * 1000, 0),
    [visibleJobs],
  );

  const applyToJob = (item: SharedBooking) => {
    if (item.status === 'pending') updateStatus(item.id, 'confirmed');
  };

  const renderTopTag = (item: SharedBooking) => {
    if (item.status === 'completed') {
      return (
        <View style={s.topTagRow}>
          <View style={[s.pillTag, { backgroundColor: C.complete }]}>
            <Text style={[s.pillTagText, { color: '#FFFFFF' }]}>{t.expired}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={s.topTagRow}>
        <Text style={s.newTagText}>⚡ {t.newJob}</Text>
        <View style={[s.pillTag, { backgroundColor: C.urgent }]}>
          <Text style={s.pillTagText}>{t.urgent}</Text>
        </View>
      </View>
    );
  };

  const renderJobCard = (item: SharedBooking) => {
    const duration = getDurationMinutes(item.time);
    const earned = Math.round((item.price * 0.67) / 1000) * 1000;
    const applyDisabled = item.status !== 'pending';
    const actionLabel = item.status === 'pending' ? t.apply : t.accepted;

    return (
      <View key={item.id} style={s.jobCard}>
        {item.status !== 'confirmed' && renderTopTag(item)}
        <Text style={s.jobCustomer}>{item.customerName}</Text>
        <Text style={s.jobAddress}>{item.address}</Text>

        <View style={s.dashedDivider} />

        <View style={s.jobServiceRow}>
          <Text style={s.jobService}>{item.service}</Text>
          <View style={s.durationRow}>
            <Feather name="clock" size={14} color="#969AA0" />
            <Text style={s.jobDuration}>{duration} {t.minutes}</Text>
          </View>
        </View>

        <View style={s.jobBottomRow}>
          <View>
            <Text style={s.earningLabel}>{t.earning}</Text>
            <Text style={s.earningValue}>+{earned.toLocaleString('vi-VN')} đ</Text>
          </View>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => applyToJob(item)}
            style={[s.applyButton, applyDisabled && s.applyButtonDisabled]}
            disabled={applyDisabled}
          >
            <Text style={[s.applyButtonText, applyDisabled && s.applyButtonTextDisabled]}>{actionLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.contentWrap}>
        <View style={s.hero}>
          <View style={s.heroHeadRow}>
            <View style={s.rankPill}>
              <Text style={s.rankPillIcon}>◈</Text>
              <Text style={s.rankPillText}>{t.rank}</Text>
              <Feather name="chevron-right" size={14} color="#6B8C5B" />
            </View>
            <View style={s.switchRow}>
              <Text style={s.switchLabel}>{t.profileVisible}</Text>
              <Switch
                value={isAvailable}
                onValueChange={handleToggleAvailability}
                disabled={togglingAvailability}
                trackColor={{ false: '#E5D6DA', true: C.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <View style={s.progressBar} />

          <View style={s.completeRow}>
            <Text style={s.completeLabel}>{t.doneJobs}</Text>
            <Text style={s.completeValue}>{completedCount}</Text>
          </View>

          <View style={s.statRow}>
            <View style={s.statCard}>
              <Text style={s.statTitle}>Đã hoàn thành</Text>
              <Text style={s.statValue}>{completedCount}</Text>
              <Text style={s.statSub}>{completedCount}/0</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statTitle}>{t.openJobs}</Text>
              <Text style={s.statValue}>{openCount}</Text>
              <Text style={s.statSub}>{t.waiting}</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statTitle}>{t.estimate}</Text>
              <Text style={s.statValue}>+{projectedIncome.toLocaleString('vi-VN')}</Text>
              <Text style={s.statSub}>{t.estimateHint}</Text>
            </View>
          </View>
        </View>

        <View style={s.filterPanel}>
          <View style={s.filterHead}>
            <Text style={s.filterTitle}>{t.filter}</Text>
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {
                setSelectedCity(DEFAULT_CITY);
                setSelectedService(ALL_SERVICE);
                setOnlyCompleted(false);
              }}
            >
              <Feather name="x" size={18} color="#9AA0A6" />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
            <TouchableOpacity activeOpacity={1} style={s.filterChip} onPress={() => setShowCityModal(true)}>
              <Text style={s.filterChipText}>{selectedCity === 'Tất cả' ? t.city : selectedCity}</Text>
              <Feather name="chevron-down" size={14} color="#7B8086" />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={1} style={s.filterChip} onPress={() => setShowServiceModal(true)}>
              <Text style={s.filterChipText}>{selectedService === ALL_SERVICE ? t.service : selectedService}</Text>
              <Feather name="chevron-down" size={14} color="#7B8086" />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={1}
              style={[s.filterChip, onlyCompleted && s.filterChipActive]}
              onPress={() => setOnlyCompleted((prev) => !prev)}
            >
              <Text style={[s.filterChipText, onlyCompleted && s.filterChipTextActive]}>{t.doneFilter}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        <Text style={s.sectionTitle}>{visibleJobs.length ? t.recentJobs : t.noJobs}</Text>

        {visibleJobs.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>{t.noJobs}</Text>
          </View>
        ) : (
          visibleJobs.map(renderJobCard)
        )}
      </ScrollView>

      <Modal visible={showCityModal} transparent animationType="slide" onRequestClose={() => setShowCityModal(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowCityModal(false)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{t.city}</Text>
            <ScrollView style={s.modalList} showsVerticalScrollIndicator>
              {cityOptions.map((city) => {
                const active = city === selectedCity;
                return (
                  <TouchableOpacity
                    activeOpacity={1}
                    key={city}
                    style={s.modalRow}
                    onPress={() => {
                      setSelectedCity(city);
                      setShowCityModal(false);
                    }}
                  >
                    <Text style={[s.modalRowText, active && s.modalRowTextActive]}>{city}</Text>
                    {active ? <Feather name="check-circle" size={18} color={C.accent} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showServiceModal} transparent animationType="slide" onRequestClose={() => setShowServiceModal(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowServiceModal(false)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{t.service}</Text>
            <ScrollView style={s.modalList} showsVerticalScrollIndicator>
              {(SERVICE_TYPES as readonly string[]).map((service) => {
                const active = service === selectedService;
                return (
                  <TouchableOpacity
                    activeOpacity={1}
                    key={service}
                    style={s.modalRow}
                    onPress={() => {
                      setSelectedService(service);
                      setShowServiceModal(false);
                    }}
                  >
                    <Text style={[s.modalRowText, active && s.modalRowTextActive]} numberOfLines={1}>{service}</Text>
                    {active ? <Feather name="check-circle" size={18} color={C.accent} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  contentWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },

  hero: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 14,
  },
  heroHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.accentSoft,
    borderWidth: 1,
    borderColor: '#F0D5DB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rankPillIcon: { color: C.text, fontSize: 12, fontWeight: '700' },
  rankPillText: { color: C.text, fontSize: 12, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { color: C.text, fontSize: 14, fontWeight: '700' },
  progressBar: { height: 6, borderRadius: 999, backgroundColor: C.accent, marginTop: 10 },
  completeRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  completeLabel: { color: C.text, fontSize: 13, fontWeight: '600' },
  completeValue: { color: C.text, fontSize: 13, fontWeight: '700' },
  statRow: { marginTop: 10, flexDirection: 'row', gap: 10 },
  statCard: { flex: 1 },
  statTitle: { color: C.text, fontSize: 12, fontWeight: '600' },
  statValue: { color: C.text, fontSize: 34, lineHeight: 36, fontWeight: '800', marginTop: 2 },
  statSub: { color: '#666666', fontSize: 12, marginTop: 2, fontWeight: '600' },

  filterPanel: {
    marginTop: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  filterHead: {
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  filterRow: { paddingHorizontal: 12, gap: 10 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.chip,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChipActive: { backgroundColor: C.accentSoft, borderColor: '#F0D5DB' },
  filterChipText: { color: C.text, fontSize: 15, fontWeight: '600' },
  filterChipTextActive: { color: C.text },

  sectionTitle: {
    marginTop: 16,
    marginBottom: 10,
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
  },

  jobCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
    marginBottom: 12,
  },
  topTagRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  newTagText: { color: C.text, fontSize: 14, fontWeight: '800' },
  pillTag: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  pillTagText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  jobCustomer: { color: '#1A1E24', fontSize: 19, fontWeight: '700' },
  jobAddress: { color: '#69717A', fontSize: 14, lineHeight: 20, marginTop: 4 },
  dashedDivider: {
    marginTop: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    borderStyle: 'dashed',
  },
  jobServiceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jobService: { color: C.text, fontSize: 19, fontWeight: '700' },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  jobDuration: { color: '#91979E', fontSize: 13 },
  jobBottomRow: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  earningLabel: { color: '#666666', fontSize: 12, marginBottom: 4 },
  earningValue: { color: C.text, fontSize: 33, lineHeight: 36, fontWeight: '800' },
  applyButton: {
    minWidth: 170,
    borderRadius: 999,
    backgroundColor: C.accent,
    alignItems: 'center',
    paddingVertical: 11,
  },
  applyButtonDisabled: { backgroundColor: '#D7DEE5' },
  applyButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  applyButtonTextDisabled: { color: '#7B8794' },

  emptyWrap: { alignItems: 'center', paddingVertical: 26 },
  emptyText: { color: '#666666', fontSize: 15 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(55, 10, 18, 0.38)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: '72%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#E6C8CF',
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalList: { maxHeight: 440 },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  modalRowText: { color: '#28303A', fontSize: 15, flex: 1, paddingRight: 12 },
  modalRowTextActive: { color: C.text, fontWeight: '700' },
});
