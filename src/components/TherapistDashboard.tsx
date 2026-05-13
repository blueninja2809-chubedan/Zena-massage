import Feather from '@expo/vector-icons/Feather';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
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
import ChatScreen from '@/components/ChatScreen';
import { ModalSafeAreaProvider } from '@/components/ModalSafeAreaProvider';
import { AppColors } from '@/constants/appColors';
import { DEFAULT_CITY, SERVICE_TYPES, VIETNAM_PROVINCES } from '@/constants/bookingFilters';
import { cityLooseMatch } from '@/lib/cityMatch';
import type { SharedBooking } from '@/contexts/BookingsContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { useRouter } from 'expo-router';
import {
  checkTherapistHasActiveBooking,
  checkTherapistMinBalance,
  getOrCreateChatRoom,
  getSharedBookingRecordById,
  getTherapistAvailability,
  therapistApplyToBroadcastBooking,
  therapistPrimaryAcceptBooking,
  therapistPrimaryDeclineBooking,
  therapistSkipBroadcastBooking,
  updateSharedBookingStatus,
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
      'Số dư ví cần đạt tối thiểu 500.000 đ để nhận đơn mới. Vui lòng nạp tiền để bổ sung.',
    cannotAcceptCostTitle: 'Chưa thể nhận đơn',
    cannotAcceptCostMsg:
      'Số dư ví chưa đạt 500.000 đ. Vui lòng nạp tiền tại mục Nạp tiền.',
    activeJobTitle: 'Đang có đơn hàng thực hiện',
    activeJobMsg:
      'Bạn đang có 1 đơn hàng chưa hoàn thành. Vui lòng hoàn thành đơn hàng hiện tại trước khi nhận đơn mới.',
    topupCta: 'Nạp tiền',
    accept: 'Chấp nhận',
    decline: 'Hủy',
    chat: 'Chat với khách',
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
      'Your deposit wallet must be at least 500,000 VND to accept new jobs. Please top up.',
    activeJobTitle: 'Active booking in progress',
    activeJobMsg:
      'You already have an active booking. Please complete it before accepting a new one.',
    cannotAcceptCostTitle: 'Cannot accept job',
    cannotAcceptCostMsg:
      'Your deposit wallet is below 500,000 VND. Please top up.',
    topupCta: 'Top up',
    accept: 'Accept',
    decline: 'Decline',
    chat: 'Chat with client',
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
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY);
  const [selectedService, setSelectedService] = useState<string>(ALL_SERVICE);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  /** Điều kiện theo server: phí ≥ 0, và từng có đơn thì tổng số dư ≥ 200.000. */
  const [canReceiveByWallet, setCanReceiveByWallet] = useState(true);
  const [chatBookingId, setChatBookingId] = useState<string | null>(null);
  const [detailJob, setDetailJob] = useState<SharedBooking | null>(null);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [movingInProgress, setMovingInProgress] = useState(false);
  const [locallySkippedIds, setLocallySkippedIds] = useState<Set<string>>(new Set());

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
  const allBookings = sortedInbox.filter((b) => !locallySkippedIds.has(b.id));
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
    const base = allBookings.filter(
      (b) => b.status === 'pending' || b.status === 'confirmed' || b.status === 'in-progress',
    );

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

    return byService.sort((a, b) => b.date.localeCompare(a.date));
  }, [allBookings, selectedCity, selectedService, t.all]);

  // Dự kiến thu nhập = tổng giá trị đơn hoàn thành trong tháng hiện tại (chỉ thống kê)
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const projectedIncome = useMemo(
    () => myNamedBookings
      .filter((b) => b.status === 'completed' && b.date.startsWith(currentMonth))
      .reduce((sum, b) => sum + Math.round(Number(b.price) || 0), 0),
    [myNamedBookings, currentMonth],
  );

  const ensureCanAcceptJob = async (): Promise<boolean> => {
    if (!user?.authUid) return false;
    // 1. KTV chỉ nhận 1 đơn tại 1 thời điểm
    // Server là nguồn sự thật — có 48h filter tránh stale data
    // Local (hasActiveBooking) không dùng làm gate vì có thể có booking cũ invisible trong context
    const serverHasActive = await checkTherapistHasActiveBooking(user.authUid);
    if (serverHasActive) {
      Alert.alert(t.activeJobTitle, t.activeJobMsg);
      return false;
    }
    // 2. Số dư ví phải >= 500.000 đ
    try {
      const ok = await checkTherapistMinBalance(user.authUid);
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
    if (!(await ensureCanAcceptJob())) return;
    if (item.assignmentFlow === 'nominated_city_broadcast' && user?.authUid) {
      const r = await therapistApplyToBroadcastBooking(
        item.id,
        user.authUid,
        displayName,
        user?.avatarUri,
      );
      if (r.ok) {
        Alert.alert(
          language === 'vi' ? 'Đã ứng tuyển' : 'Applied',
          language === 'vi'
            ? 'Đơn ứng tuyển của bạn đã được ghi nhận. Khách hàng sẽ chọn KTV phù hợp.'
            : 'Your application has been recorded. The customer will choose a therapist.',
        );
      } else {
        Alert.alert(t.actionFailed, r.reason ?? '');
      }
      await refreshBookings();
      return;
    }
    updateStatus(item.id, 'confirmed');
  };

  const openChat = async (item: SharedBooking) => {
    if (!user?.authUid) return;
    const row = await getSharedBookingRecordById(item.id).catch(() => null);
    if (row) {
      const customerId = String(row.customerUserId ?? '');
      if (customerId) {
        await getOrCreateChatRoom(
          item.id, customerId, user.authUid,
          String(row.customerName ?? ''), String(row.therapistName ?? ''),
        ).catch(() => {});
      }
    }
    setChatBookingId(item.id);
  };

  const onPrimaryAccept = async (item: SharedBooking) => {
    if (!user?.authUid) return;
    if (!(await ensureCanAcceptJob())) return;
    const r = await therapistPrimaryAcceptBooking(item.id, user.authUid);
    if (!r.ok) {
      Alert.alert(t.actionFailed, r.reason ?? '');
      return;
    }
    await refreshBookings();
    // Tạo chat room và mở chat ngay sau khi chấp nhận
    const row = await getSharedBookingRecordById(item.id).catch(() => null);
    if (row) {
      const customerId = String(row.customerUserId ?? '');
      const therapistId = user.authUid;
      if (customerId && therapistId) {
        await getOrCreateChatRoom(
          item.id, customerId, therapistId,
          String(row.customerName ?? ''), String(row.therapistName ?? ''),
        ).catch(() => {});
        setChatBookingId(item.id);
      }
    }
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
    setLocallySkippedIds((prev) => new Set(prev).add(item.id));
    try {
      await therapistSkipBroadcastBooking(item.id, user.authUid);
    } catch { /* keep locally hidden */ }
    await refreshBookings();
  };

  const handleMarkComplete = async (item: SharedBooking) => {
    setMarkingComplete(true);
    try {
      // Await DB write first — prevents refreshBookings() from racing and overwriting
      // the local 'completed' state with stale DB data before the write commits.
      await updateSharedBookingStatus(item.id, 'completed');
      updateStatus(item.id, 'completed', {
        userId: item.customerUserId,
        therapistName: displayName,
        service: item.service,
      });
      setDetailJob(null);
      await refreshBookings();
    } finally {
      setMarkingComplete(false);
    }
  };

  const handleMoveInProgress = async (item: SharedBooking) => {
    setMovingInProgress(true);
    try {
      await updateSharedBookingStatus(item.id, 'in-progress');
      updateStatus(item.id, 'in-progress');
      setDetailJob((prev) => prev ? { ...prev, status: 'in-progress' } : prev);
      await refreshBookings();
    } finally {
      setMovingInProgress(false);
    }
  };

  const renderTopTag = () => (
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
    // Also show Skip/Apply for nominated KTV whose offer expired or was declined.
    const isBroadcastOther =
      item.assignmentFlow === 'nominated_city_broadcast' &&
      !!uid &&
      item.status === 'pending' &&
      !isDirected &&
      (item.requestedTherapistId !== uid || (item.primaryAction !== 'pending' && item.primaryAction != null));
    const isConfirmed = item.status === 'confirmed' || item.status === 'in-progress';
    const applyDisabled = item.status !== 'pending';
    const actionLabel = item.status === 'pending' ? t.apply : t.accepted;

    const isAccepted = item.status === 'confirmed' || item.status === 'in-progress';
    const cardStyle = [s.jobCard, isDirected && { borderColor: C.accent, borderWidth: 2, backgroundColor: '#FFFBF8' }];
    const cardInner = (
      <>
        {isDirected ? (
          <View style={s.directedPill}>
            <Feather name="star" size={14} color="#fff" />
            <Text style={s.directedPillText}>{t.directedBadge}</Text>
          </View>
        ) : null}
        {item.status === 'pending' && renderTopTag()}
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
          <Text style={s.earningLabel}>{t.earning}</Text>
          <Text style={s.earningValue}>+{earned.toLocaleString('vi-VN')} đ</Text>
        </View>
        <View style={s.jobBtnSection}>
          {isConfirmed ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => void openChat(item)}
              style={s.chatButton}
            >
              <Feather name="message-circle" size={16} color="#fff" />
              <Text style={s.chatButtonText}>{t.chat}</Text>
            </TouchableOpacity>
          ) : isDirected ? (
            <View style={s.dualBtnRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => void onPrimaryDecline(item)}
                style={s.secondaryBtn}
              >
                <Text style={s.secondaryBtnText}>{t.decline}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => void onPrimaryAccept(item)}
                style={[s.applyButton, { flex: 1, marginLeft: 8 }]}
              >
                <Text style={s.applyButtonText}>{t.accept}</Text>
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
                activeOpacity={0.9}
                onPress={() => void applyToJob(item)}
                style={[s.applyButton, { flex: 1, marginLeft: 8 }, applyDisabled && s.applyButtonDisabled]}
                disabled={applyDisabled}
              >
                <Text style={[s.applyButtonText, applyDisabled && s.applyButtonTextDisabled]}>{actionLabel}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => void applyToJob(item)}
              style={[s.applyButton, { alignSelf: 'flex-end' }, applyDisabled && s.applyButtonDisabled]}
              disabled={applyDisabled}
            >
              <Text style={[s.applyButtonText, applyDisabled && s.applyButtonTextDisabled]}>{actionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </>
    );

    // Pending items: use View so inner buttons receive touches freely.
    // Accepted items: wrap in TouchableOpacity to open detail sheet.
    if (isAccepted) {
      return (
        <TouchableOpacity
          key={item.id}
          activeOpacity={0.85}
          onPress={() => setDetailJob(item)}
          style={cardStyle}
        >
          {cardInner}
        </TouchableOpacity>
      );
    }
    return (
      <View key={item.id} style={cardStyle}>
        {cardInner}
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

          <View style={s.statRow}>
            <View style={s.statCard}>
              <Text style={s.statTitle}>Đã hoàn thành</Text>
              <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{completedCount}</Text>
              <Text style={s.statSub}>{completedCount}/0</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statTitle}>{t.openJobs}</Text>
              <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{openCount}</Text>
              <Text style={s.statSub}>{t.waiting}</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statTitle}>{t.estimate}</Text>
              <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>+{projectedIncome.toLocaleString('vi-VN')}</Text>
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

      {/* Job detail bottom sheet — chỉ mở cho đơn đã nhận (confirmed / in-progress) */}
      <Modal
        visible={detailJob !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailJob(null)}
      >
        <Pressable style={s.sheetOverlay} onPress={() => setDetailJob(null)}>
          <Pressable style={s.sheetContainer} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>
              {language === 'vi' ? 'Chi tiết đơn hàng' : 'Order Detail'}
            </Text>

            {detailJob ? (
              <>
                {/* Booking info */}
                <View style={s.sheetInfoBlock}>
                  <View style={s.sheetInfoRow}>
                    <Text style={s.sheetInfoLabel}>{language === 'vi' ? 'Dịch vụ' : 'Service'}:</Text>
                    <Text style={s.sheetInfoValue} numberOfLines={2}>{detailJob.service}</Text>
                  </View>
                  <View style={s.sheetInfoRow}>
                    <Text style={s.sheetInfoLabel}>{language === 'vi' ? 'Khách hàng' : 'Customer'}:</Text>
                    <Text style={s.sheetInfoValue}>{detailJob.customerName}</Text>
                  </View>
                  {detailJob.customerPhone ? (
                    <View style={s.sheetInfoRow}>
                      <Text style={s.sheetInfoLabel}>SĐT:</Text>
                      <Text style={s.sheetInfoValue}>{detailJob.customerPhone}</Text>
                    </View>
                  ) : null}
                  <View style={s.sheetInfoRow}>
                    <Text style={s.sheetInfoLabel}>{language === 'vi' ? 'Thời gian' : 'Time'}:</Text>
                    <Text style={s.sheetInfoValue}>{detailJob.date} · {detailJob.time}</Text>
                  </View>
                  <View style={s.sheetInfoRow}>
                    <Text style={s.sheetInfoLabel}>{language === 'vi' ? 'Địa chỉ' : 'Address'}:</Text>
                    <Text style={s.sheetInfoValue} numberOfLines={2}>{detailJob.address}</Text>
                  </View>
                  <Text style={s.sheetPrice}>
                    {language === 'vi' ? 'Giá' : 'Price'}: {(detailJob.price ?? 0).toLocaleString('vi-VN')} đ
                  </Text>
                </View>

                {/* Status stepper */}
                <View style={s.stepperWrap}>
                  {[
                    { key: 'confirmed', label: language === 'vi' ? 'Đã nhận đơn' : 'Accepted' },
                    { key: 'in-progress', label: language === 'vi' ? 'Đang xử lý' : 'In Progress' },
                    { key: 'completed', label: language === 'vi' ? 'Hoàn thành' : 'Completed' },
                  ].map(({ key, label }) => {
                    const stepOrder: Record<string, number> = { confirmed: 0, 'in-progress': 1, completed: 2 };
                    const current = stepOrder[detailJob.status] ?? 0;
                    const mine = stepOrder[key] ?? 0;
                    const active = mine <= current;
                    return (
                      <View key={key} style={s.stepRow}>
                        <View style={[s.stepDot, active && s.stepDotActive]} />
                        <Text style={[s.stepLabel, active && s.stepLabelActive]}>{label}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Action buttons */}
                <View style={s.sheetActions}>
                  {detailJob.status === 'confirmed' ? (
                    <TouchableOpacity
                      style={[s.sheetSecBtn, movingInProgress && { opacity: 0.6 }]}
                      onPress={() => void handleMoveInProgress(detailJob)}
                      disabled={movingInProgress}
                      activeOpacity={0.85}
                    >
                      {movingInProgress
                        ? <ActivityIndicator size="small" color={C.accent} />
                        : <Text style={s.sheetSecBtnText}>
                            {language === 'vi' ? 'Chuyển đang xử lý' : 'Move to In Progress'}
                          </Text>
                      }
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[s.sheetPriBtn, (markingComplete || movingInProgress) && { opacity: 0.6 }]}
                    onPress={() => void handleMarkComplete(detailJob)}
                    disabled={markingComplete || movingInProgress}
                    activeOpacity={0.85}
                  >
                    {markingComplete ? (
                      <>
                        <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                        <Text style={s.sheetPriBtnText}>
                          {language === 'vi' ? 'Đang xử lý...' : 'Processing...'}
                        </Text>
                      </>
                    ) : (
                      <Text style={s.sheetPriBtnText}>
                        {language === 'vi' ? 'Đánh dấu hoàn thành' : 'Mark as Complete'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Chat screen modal — mở sau khi KTV chấp nhận đơn từ danh sách */}
      <Modal
        visible={chatBookingId !== null}
        animationType="slide"
        onRequestClose={() => setChatBookingId(null)}
      >
        <ModalSafeAreaProvider>
          {chatBookingId && (
            <ChatScreen
              onClose={() => setChatBookingId(null)}
              bookingId={chatBookingId}
            />
          )}
        </ModalSafeAreaProvider>
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
  statRow: { marginTop: 12, flexDirection: 'row', gap: 10 },
  statCard: { flex: 1 },
  statTitle: { color: C.text, fontSize: 12, fontWeight: '600' },
  statValue: { color: C.text, fontSize: 22, lineHeight: 26, fontWeight: '500', marginTop: 2 },
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
  dualBtnRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
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
  jobBottomRow: { marginTop: 10 },
  jobBtnSection: { marginTop: 12 },
  earningLabel: { color: '#666666', fontSize: 12, marginBottom: 4 },
  earningValue: { color: C.text, fontSize: 29, lineHeight: 33, fontWeight: '500' },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: C.accent,
    paddingVertical: 11,
    paddingHorizontal: 20,
    width: '100%',
  },
  chatButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  applyButton: {
    borderRadius: 999,
    backgroundColor: C.accent,
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
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

  // Job detail bottom sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#E0D5D0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    marginBottom: 16,
  },
  sheetInfoBlock: {
    marginBottom: 18,
  },
  sheetInfoRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 7,
    alignItems: 'flex-start',
  },
  sheetInfoLabel: {
    fontSize: 14,
    color: C.sub,
    minWidth: 80,
  },
  sheetInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    flex: 1,
  },
  sheetPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#C0392B',
    marginTop: 4,
  },
  stepperWrap: {
    marginBottom: 20,
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D0C8C0',
  },
  stepDotActive: {
    backgroundColor: C.accent,
  },
  stepLabel: {
    fontSize: 14,
    color: '#A0A0A0',
  },
  stepLabelActive: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
  },
  sheetSecBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: C.accent,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  sheetSecBtnText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  sheetPriBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: C.accent,
  },
  sheetPriBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
