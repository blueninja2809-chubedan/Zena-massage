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
import { AppColors } from '@/constants/appColors';
import { DEFAULT_CITY, SERVICE_TYPES, VIETNAM_PROVINCES } from '@/constants/bookingFilters';
import { cityLooseMatch } from '@/lib/cityMatch';
import type { SharedBooking } from '@/contexts/BookingsContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { useRouter } from 'expo-router';
import {
  checkTherapistMinBalance,
  getTherapistAvailability,
  therapistApplyToBroadcastBooking,
  therapistPrimaryAcceptBooking,
  therapistPrimaryDeclineBooking,
  therapistSkipBroadcastBooking,
  updateTherapistAvailability,
} from '@/lib/supabaseService';

const translations: Record<OnboardingLanguage, Record<string, string>> = {
  vi: {
    title: 'Nhận việc',
    rank: 'Hạng',
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
    newOrders: 'Đơn mới',
    costWalletBlockTitle: 'Chưa đủ điều kiện nhận đơn',
    costWalletBlockMsg:
      'Phí kết nối không được âm. Nếu bạn đã từng nhận đơn, tổng số dư (thu nhập + phí) cần ≥ 200.000 đ. Vào Nạp tiền để bổ sung.',
    cannotAcceptCostTitle: 'Chưa thể nhận đơn',
    cannotAcceptCostMsg:
      'Kiểm tra phí kết nối (≥ 0) và tổng số dư (≥ 200.000 đ khi đã có đơn). Nạp tiền tại mục Nạp tiền.',
    topupCta: 'Nạp tiền',
    accept: 'Chấp nhận',
    decline: 'Hủy',
    skip: 'Bỏ qua',
    directedBadge: 'Khách chọn bạn',
    actionFailed: 'Thao tác không thành công',
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
    newOrders: 'New orders',
    costWalletBlockTitle: 'Not eligible to accept jobs',
    costWalletBlockMsg:
      'Connection fee cannot be negative. After your first order, your total balance (earnings + fee) must be at least 200,000 VND. Use Top up.',
    cannotAcceptCostTitle: 'Cannot accept job',
    cannotAcceptCostMsg:
      'Check connection fee (≥ 0) and total balance (≥ 200,000 VND if you have orders). Top up in the app.',
    topupCta: 'Top up',
    accept: 'Accept',
    decline: 'Decline',
    skip: 'Skip',
    directedBadge: 'Client chose you',
    actionFailed: 'Action failed',
  },
};

const C = {
  bg: AppColors.bg,
  card: AppColors.white,
  text: AppColors.text,
  sub: AppColors.textMuted,
  line: AppColors.border,
  accent: AppColors.primaryDark,
  accentSoft: AppColors.primarySoft,
  chip: AppColors.accentSoft,
  urgent: '#F2A51D',
  warnBg: '#FFF8E1',
  complete: AppColors.accent,
  info: AppColors.primary,
};
const ALL_SERVICE = 'Tất cả';

export default function TherapistDashboard() {
  const router = useRouter();
  const { language } = useLanguage();
  const { user } = useUser();
  const { getTherapistBookings, getTherapistJobInbox, updateStatus, refreshBookings } = useBookings();
  const t = translations[language as OnboardingLanguage] || translations.vi;

  const [isAvailable, setIsAvailable] = useState(true);
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [onlyCompleted, setOnlyCompleted] = useState(false);
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY);
  const [selectedService, setSelectedService] = useState<string>(ALL_SERVICE);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  /** Điều kiện theo server: phí ≥ 0, và từng có đơn thì tổng số dư ≥ 200.000. */
  const [canReceiveByWallet, setCanReceiveByWallet] = useState(true);

  useEffect(() => {
    if (user?.authUid) {
      getTherapistAvailability(user.authUid)
        .then(setIsAvailable)
        .catch(() => {});
    }
  }, [user?.authUid]);

  useEffect(() => {
    if (!user?.authUid) {
      setCanReceiveByWallet(true);
      return;
    }
    checkTherapistMinBalance(user.authUid, 0)
      .then(setCanReceiveByWallet)
      .catch(() => setCanReceiveByWallet(true));
  }, [user?.authUid]);

  const handleToggleAvailability = async (value: boolean) => {
    if (!user?.authUid) return;

    if (value) {
      try {
        const canReceive = await checkTherapistMinBalance(user.authUid, 0);
        if (!canReceive) {
          Alert.alert(t.costWalletBlockTitle, t.costWalletBlockMsg);
          return;
        }
        setCanReceiveByWallet(true);
      } catch {
        /* empty */
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
  const myNamedBookings = getTherapistBookings(displayName);
  const workingCityFilter =
    user?.workingCity ||
    (selectedCity !== t.all && selectedCity !== 'Tất cả' ? selectedCity : '') ||
    DEFAULT_CITY;
  const inboxBookings = getTherapistJobInbox({
    displayName,
    therapistUid: user?.authUid ?? '',
    workingCity: workingCityFilter,
  });
  const sortedInbox = useMemo(() => {
    const uid = user?.authUid;
    const copy = [...inboxBookings];
    copy.sort((a, b) => {
      const aPin =
        !!uid &&
        a.requestedTherapistId === uid &&
        (a.primaryAction === 'pending' || !a.primaryAction) &&
        a.status === 'pending';
      const bPin =
        !!uid &&
        b.requestedTherapistId === uid &&
        (b.primaryAction === 'pending' || !b.primaryAction) &&
        b.status === 'pending';
      if (aPin !== bPin) {
        return aPin ? -1 : 1;
      }
      return b.date.localeCompare(a.date);
    });
    return copy;
  }, [inboxBookings, user?.authUid]);
  const allBookings = sortedInbox;
  const completedCount = myNamedBookings.filter((b) => b.status === 'completed').length;
  const currentRank = useMemo(() => {
    if (completedCount >= 51) return 'Bạch kim';
    if (completedCount >= 41) return 'Vàng';
    if (completedCount >= 31) return 'Bạc';
    return 'Đồng';
  }, [completedCount]);
  const openCount = inboxBookings.filter((b) => b.status !== 'completed' && b.status !== 'cancelled').length;
  const newOrdersCount = inboxBookings.filter((b) => b.status === 'pending').length;

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

    const byCity =
      selectedCity === t.all
        ? base
        : base.filter((b) => {
            const sel = selectedCity.trim();
            if ((b.address || '').toLowerCase().includes(sel.toLowerCase())) {
              return true;
            }
            if (b.jobCity && cityLooseMatch(b.jobCity, sel)) {
              return true;
            }
            return false;
          });

    const byService = selectedService === ALL_SERVICE
      ? byCity
      : byCity.filter((b) => (b.service || '').toLowerCase().includes(selectedService.toLowerCase()));

    const filtered = onlyCompleted ? byService.filter((b) => b.status === 'completed') : byService;
    return filtered.sort((a, b) => b.date.localeCompare(a.date));
  }, [allBookings, onlyCompleted, selectedCity, selectedService, t.all]);

  const projectedIncome = useMemo(
    () => visibleJobs.reduce((sum, b) => sum + Math.round(Number(b.price) || 0), 0),
    [visibleJobs],
  );

  const ensureWalletOk = async (): Promise<boolean> => {
    if (!user?.authUid) {
      return false;
    }
    try {
      const ok = await checkTherapistMinBalance(user.authUid, 0);
      if (!ok) {
        Alert.alert(t.cannotAcceptCostTitle, t.cannotAcceptCostMsg, [
          { text: language === 'vi' ? 'Để sau' : 'Later', style: 'cancel' },
          { text: t.topupCta, onPress: () => router.push('/therapist-topup') },
        ]);
        return false;
      }
    } catch {
      /* empty */
    }
    return true;
  };

  const applyToJob = async (item: SharedBooking) => {
    if (item.status !== 'pending') return;
    if (!(await ensureWalletOk())) return;
    if (item.assignmentFlow === 'nominated_city_broadcast' && user?.authUid) {
      const r = await therapistApplyToBroadcastBooking(
        item.id,
        user.authUid,
        displayName,
        user?.avatarUri,
      );
      if (!r.ok) {
        Alert.alert(t.actionFailed, r.reason ?? '');
      }
      await refreshBookings();
      return;
    }
    updateStatus(item.id, 'confirmed');
  };

  const onPrimaryAccept = async (item: SharedBooking) => {
    if (!user?.authUid) return;
    if (!(await ensureWalletOk())) return;
    const r = await therapistPrimaryAcceptBooking(item.id, user.authUid);
    if (!r.ok) {
      Alert.alert(t.actionFailed, r.reason ?? '');
    }
    await refreshBookings();
  };

  const onPrimaryDecline = async (item: SharedBooking) => {
    if (!user?.authUid) return;
    const r = await therapistPrimaryDeclineBooking(item.id, user.authUid);
    if (!r.ok) {
      Alert.alert(t.actionFailed, r.reason ?? '');
    }
    await refreshBookings();
  };

  const onSkipJob = async (item: SharedBooking) => {
    if (!user?.authUid) return;
    await therapistSkipBroadcastBooking(item.id, user.authUid);
    await refreshBookings();
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
        <View style={s.newTagInner}>
          <Feather name="zap" size={14} color={C.accent} />
          <Text style={s.newTagText}>{t.newJob}</Text>
        </View>
        <View style={[s.pillTag, { backgroundColor: C.urgent }]}>
          <Text style={s.pillTagText}>{t.urgent}</Text>
        </View>
      </View>
    );
  };

  const renderJobCard = (item: SharedBooking) => {
    const duration = getDurationMinutes(item.time);
    const earned = Math.round(Number(item.price) || 0);
    const uid = user?.authUid;
    const isDirected =
      item.assignmentFlow === 'nominated_city_broadcast' &&
      !!uid &&
      item.requestedTherapistId === uid &&
      (item.primaryAction === 'pending' || item.primaryAction == null) &&
      item.status === 'pending';
    const isBroadcastOther =
      item.assignmentFlow === 'nominated_city_broadcast' &&
      !!uid &&
      !!item.requestedTherapistId &&
      item.requestedTherapistId !== uid &&
      item.status === 'pending';
    const applyDisabled = item.status !== 'pending';
    const actionLabel = item.status === 'pending' ? t.apply : t.accepted;

    return (
      <View
        key={item.id}
        style={[s.jobCard, isDirected && { borderColor: C.accent, borderWidth: 2, backgroundColor: '#FFFBF8' }]}
      >
        {isDirected ? (
          <View style={s.directedPill}>
            <Feather name="star" size={14} color="#fff" />
            <Text style={s.directedPillText}>{t.directedBadge}</Text>
          </View>
        ) : null}
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
          {isDirected ? (
            <View style={s.dualBtnRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => void onPrimaryDecline(item)}
                style={[s.secondaryBtn, applyDisabled && s.applyButtonDisabled]}
                disabled={applyDisabled}
              >
                <Text style={s.secondaryBtnText}>{t.decline}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => void onPrimaryAccept(item)}
                style={[s.applyButton, { marginLeft: 8 }, applyDisabled && s.applyButtonDisabled]}
                disabled={applyDisabled}
              >
                <Text style={[s.applyButtonText, applyDisabled && s.applyButtonTextDisabled]}>{t.accept}</Text>
              </TouchableOpacity>
            </View>
          ) : isBroadcastOther ? (
            <View style={s.dualBtnRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => void onSkipJob(item)}
                style={s.secondaryBtn}
              >
                <Text style={s.secondaryBtnText}>{t.skip}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => void applyToJob(item)}
                style={[s.applyButton, { marginLeft: 8 }, applyDisabled && s.applyButtonDisabled]}
                disabled={applyDisabled}
              >
                <Text style={[s.applyButtonText, applyDisabled && s.applyButtonTextDisabled]}>{actionLabel}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => void applyToJob(item)}
              style={[s.applyButton, applyDisabled && s.applyButtonDisabled]}
              disabled={applyDisabled}
            >
              <Text style={[s.applyButtonText, applyDisabled && s.applyButtonTextDisabled]}>{actionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.contentWrap}
      >
        <View style={s.hero}>
          <View style={s.heroHeadRow}>
            <TouchableOpacity style={s.rankPill} onPress={() => router.push('/therapist-rank')} activeOpacity={0.85}>
              <Feather name="award" size={14} color="#6B8C5B" />
              <Text style={s.rankPillText}>{t.rank} {currentRank}</Text>
              <Feather name="chevron-right" size={14} color="#6B8C5B" />
            </TouchableOpacity>
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

        {!canReceiveByWallet ? (
          <View style={[s.costWalletBanner, { backgroundColor: C.warnBg }]}>
            <Text style={s.costWalletBannerTitle}>{t.costWalletBlockTitle}</Text>
            <Text style={s.costWalletBannerText}>{t.costWalletBlockMsg}</Text>
            <TouchableOpacity style={s.costWalletBtn} onPress={() => router.push('/therapist-topup')} activeOpacity={0.85}>
              <Text style={s.costWalletBtnText}>{t.topupCta}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

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

        <View style={s.sectionTitleRow}>
          <Text style={s.sectionTitle}>{visibleJobs.length ? t.recentJobs : t.noJobs}</Text>
          {newOrdersCount > 0 ? (
            <View style={s.newOrdersBadge}>
              <Text style={s.newOrdersBadgeText}>
                {t.newOrders}: {newOrdersCount}
              </Text>
            </View>
          ) : null}
        </View>

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
  container: { flex: 1, width: '100%', maxWidth: '100%', alignSelf: 'stretch', backgroundColor: C.bg },
  scroll: { flex: 1, width: '100%' },
  contentWrap: {
    width: '100%',
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 120,
  },

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
  statValue: { color: C.text, fontSize: 30, lineHeight: 34, fontWeight: '500', marginTop: 2 },
  statSub: { color: '#666666', fontSize: 12, marginTop: 2, fontWeight: '600' },

  costWalletBanner: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F5D7A3',
    borderRadius: 14,
    padding: 14,
  },
  costWalletBannerTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 6 },
  costWalletBannerText: { fontSize: 13, color: C.sub, lineHeight: 20 },
  costWalletBannerAmt: { fontWeight: '800', color: C.urgent },
  costWalletBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  costWalletBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

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
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionTitleRow: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  newOrdersBadge: {
    backgroundColor: '#FFF4E5',
    borderColor: '#F6C68A',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  newOrdersBadgeText: {
    color: '#8A4B08',
    fontSize: 12,
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
  directedPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 8,
  },
  directedPillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  dualBtnRow: { flexDirection: 'row', alignItems: 'center' },
  secondaryBtn: {
    minWidth: 100,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: C.accent,
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  secondaryBtnText: { color: C.accent, fontSize: 15, fontWeight: '700' },
  topTagRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  newTagInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
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
  earningValue: { color: C.text, fontSize: 29, lineHeight: 33, fontWeight: '500' },
  applyButton: {
    minWidth: 170,
    borderRadius: 999,
    backgroundColor: C.accent,
    alignItems: 'center',
    paddingVertical: 11,
  },
  applyButtonDisabled: { backgroundColor: AppColors.primarySoft },
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
