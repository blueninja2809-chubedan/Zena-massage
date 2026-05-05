import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Image,
    Linking,
    Modal,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppColors } from '@/constants/appColors';
import { useUser } from '@/contexts/UserContext';
import { checkPayOSPaymentStatus, createPayOSPayment } from '@/lib/payosService';
import { allowUnsignedForE2ETest, canUseAppFeatures } from '@/lib/session';
import {
    confirmPayosForBookingUser,
    createSharedBookingRecord,
    deleteBookingRecord,
    getBookingStatus,
    getOrCreateWallet,
    mergeBookingPayload,
    notifyBookingConfirmed,
    walletDeduct,
} from '@/lib/supabaseService';

const P = {
  primary: AppColors.primaryDark,
  primaryLight: AppColors.primary,
  bg: AppColors.bg,
  card: AppColors.white,
  text: AppColors.text,
  sub: '#64748B',
  muted: '#94A3B8',
  line: '#E2E8F0',
  orange: '#E69500',
  disabled: '#CBD5E1',
};

type PayKind = 'zena' | 'payos';

function tomorrowAt(h: number, m: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function fmtDateVi(d: Date) {
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ServiceBookingScreen() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useUser();
  const e2eBypass = allowUnsignedForE2ETest();
  const params = useLocalSearchParams<{
    serviceId?: string;
    name?: string;
    price?: string;
    duration?: string;
    distance?: string;
    rating?: string;
    image?: string;
    address?: string;
  }>();

  const serviceId = String(params.serviceId ?? '');
  const name = params.name ? decodeURIComponent(String(params.name)) : 'Dịch vụ';
  const priceNum = Number(String(params.price ?? '0').replace(/\D/g, '')) || 0;
  const duration = Math.max(1, Number(params.duration) || 60);
  const distance = Number(params.distance) || 0;
  const rating = Number(params.rating) || 5;
  const image = params.image ? decodeURIComponent(String(params.image)) : '';
  const address = params.address ? decodeURIComponent(String(params.address)) : '';

  // E2E builds may allow booking without login (see session helper).
  const userId = user?.authUid ?? (e2eBypass ? 'test-user' : undefined);

  const [scheduledAt, setScheduledAt] = useState(() => tomorrowAt(10, 0));
  const [showSchedule, setShowSchedule] = useState(false);
  const [payKind, setPayKind] = useState<PayKind>('zena');
  const [balance, setBalance] = useState(0);
  const [zalo, setZalo] = useState(() => (e2eBypass ? '0901234567' : ''));
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [showQr, setShowQr] = useState(false);
  const [qrCodeValue, setQrCodeValue] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const dateStr = useMemo(() => {
    const d = scheduledAt;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, [scheduledAt]);
  const timeStr = useMemo(() => `${pad(scheduledAt.getHours())}:${pad(scheduledAt.getMinutes())}`, [scheduledAt]);
  const scheduledLabel = `${fmtDateVi(scheduledAt)} • ${timeStr}`;

  const loadWallet = useCallback(async () => {
    if (!userId) {
      setLoadingWallet(false);
      return;
    }
    try {
      setLoadingWallet(true);
      const w = await getOrCreateWallet(userId);
      setBalance(w.balance);
    } catch {
      setBalance(0);
    } finally {
      setLoadingWallet(false);
    }
  }, [userId]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    if (!showQr) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.45, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showQr, pulseAnim]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const zaloOk = /^[0-9+\s]{8,15}$/.test(zalo.replace(/\s/g, '')) && zalo.replace(/\D/g, '').length >= 8;
  const canPayZena = payKind === 'zena' && balance >= priceNum && zaloOk && !!userId;
  const canPayPayos = payKind === 'payos' && zaloOk && !!userId;
  const canSubmit = (payKind === 'zena' ? canPayZena : canPayPayos) && priceNum > 0;

  const goSuccess = useCallback(
    (paymentLabel: string) => {
      router.replace({
        pathname: '/booking-success',
        params: {
          serviceName: encodeURIComponent(name),
          date: encodeURIComponent(dateStr),
          time: encodeURIComponent(timeStr),
          price: encodeURIComponent(`${priceNum.toLocaleString('vi-VN')} đ`),
          zalo: encodeURIComponent(zalo.trim()),
          payment: encodeURIComponent(paymentLabel),
        },
      });
    },
    [router, name, dateStr, timeStr, priceNum, zalo],
  );

  const buildBookingPayload = () => ({
    kind: 'location_service',
    customerUserId: userId,
    customerName: user?.displayName || 'Khách hàng',
    customerPhone: zalo.trim(),
    therapistId: 'location',
    therapistName: 'Địa điểm dịch vụ',
    service: name,
    serviceId,
    date: dateStr,
    time: timeStr,
    address,
    price: priceNum,
    zaloPhone: zalo.trim(),
    paymentMethod: payKind,
    paymentStatus: 'pending',
    scheduledLabel,
    distanceKm: distance,
    rating,
    durationMinutes: duration,
    serviceImage: image,
    status: 'pending',
  });

  const handleZenaWalletPay = async () => {
    if (!userId) return;
    const bookingPayload = buildBookingPayload();
    let bookingId: string | null = null;
    try {
      setSubmitting(true);
      bookingId = await createSharedBookingRecord(bookingPayload);
      await walletDeduct(userId, priceNum, 'payment', `Đặt dịch vụ: ${name}`, bookingId);
      await mergeBookingPayload(
        bookingId,
        { paymentStatus: 'paid', paymentMethod: 'zena', paidAt: new Date().toISOString() },
        'confirmed',
      );
      notifyBookingConfirmed(userId, bookingId, 'Địa điểm dịch vụ', name, dateStr, timeStr).catch(() => {});
      goSuccess('Số dư Zena');
    } catch (e) {
      if (bookingId) await deleteBookingRecord(bookingId).catch(() => {});
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('insufficient_balance')) {
        Alert.alert('Số dư không đủ', 'Vui lòng nạp thêm Zena hoặc chọn thanh toán PayOS.');
      } else {
        Alert.alert('Không thể thanh toán', msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startPolling = useCallback(
    (orderCode: number, bookingId: string) => {
      stopPolling();
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 72) {
          stopPolling();
          setShowQr(false);
          Alert.alert('Hết thời gian', 'Giao dịch chưa hoàn tất. Kiểm tra lại trong mục đặt lịch.');
          return;
        }
        try {
          const res = await checkPayOSPaymentStatus(orderCode);
          if (res.success && res.data?.status === 'PAID') {
            stopPolling();
            setShowQr(false);
            let ok = false;
            try {
              const c = await confirmPayosForBookingUser(orderCode, userId!);
              ok = c.ok;
            } catch {
              ok = false;
            }
            if (!ok) {
              const st = await getBookingStatus(bookingId);
              ok = st === 'confirmed';
            }
            if (ok) {
              notifyBookingConfirmed(userId!, bookingId, 'Địa điểm dịch vụ', name, dateStr, timeStr).catch(() => {});
              goSuccess('Chuyển khoản PayOS');
            } else {
              Alert.alert('Thanh toán đã nhận', 'Đang cập nhật đơn. Vui lòng kiểm tra Lịch sử sau vài phút.');
            }
          } else if (res.success && (res.data?.status === 'CANCELLED' || res.data?.status === 'EXPIRED')) {
            stopPolling();
            setShowQr(false);
            Alert.alert('Giao dịch huỷ', 'Mã thanh toán không còn hiệu lực.');
          }
        } catch {
          /* retry */
        }
      }, 5000);
    },
    [stopPolling, userId, name, dateStr, timeStr, goSuccess],
  );

  const handlePayos = async () => {
    if (!userId) return;
    const bookingPayload = buildBookingPayload();
    let bookingId: string | null = null;
    try {
      setSubmitting(true);
      bookingId = await createSharedBookingRecord(bookingPayload);
      const res = await createPayOSPayment(userId, priceNum, 'Dat dich vu Zena', bookingId);
      if (!res.success || !res.data) {
        if (bookingId) await deleteBookingRecord(bookingId).catch(() => {});
        Alert.alert('PayOS', res.message || 'Không tạo được thanh toán.');
        return;
      }
      setQrCodeValue(res.data.qrCode);
      setCheckoutUrl(res.data.checkoutUrl);
      setShowQr(true);
      startPolling(res.data.orderCode, bookingId);
    } catch (e) {
      if (bookingId) await deleteBookingRecord(bookingId).catch(() => {});
      Alert.alert('Lỗi', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!userId) {
      Alert.alert('Đăng nhập', 'Vui lòng đăng nhập để đặt lịch.');
      return;
    }
    if (!zaloOk) {
      Alert.alert('Zalo', 'Vui lòng nhập số điện thoại Zalo hợp lệ.');
      return;
    }
    if (payKind === 'zena') {
      if (balance < priceNum) {
        Alert.alert('Số dư không đủ', 'Chọn nạp tiền hoặc thanh toán PayOS.');
        return;
      }
      handleZenaWalletPay();
    } else {
      handlePayos();
    }
  };

  const cancelQr = () => {
    stopPolling();
    setShowQr(false);
    setQrCodeValue('');
    setCheckoutUrl('');
  };

  if (userLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator size="large" color={P.primary} />
      </SafeAreaView>
    );
  }

  if (!canUseAppFeatures(user)) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <Feather name="lock" size={48} color={P.primary} style={{ marginBottom: 16 }} />
        <Text style={styles.gateTitle}>Cần đăng nhập</Text>
        <Text style={styles.gateDesc}>Vui lòng đăng nhập tài khoản để đặt lịch và thanh toán.</Text>
        <TouchableOpacity style={styles.gateBtn} onPress={() => router.replace('/(tabs)/account')}>
          <Text style={styles.gateBtnText}>Đăng nhập</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.gateBack} onPress={() => router.back()}>
          <Text style={styles.link}>Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!serviceId) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.errText}>Thiếu thông tin dịch vụ.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={P.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thông tin đặt lịch</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardMuted}>Thời gian đặt</Text>
            <TouchableOpacity onPress={() => setShowSchedule(true)} hitSlop={8}>
              <Feather name="edit-2" size={18} color={P.primary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setShowSchedule(true)}>
            <Text style={styles.scheduleHint}>{scheduledLabel}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardMuted}>Dịch vụ</Text>
          <View style={styles.svcRow}>
            <Image source={{ uri: image || 'https://picsum.photos/seed/svc/200/200' }} style={styles.svcImg} />
            <View style={styles.svcBody}>
              <Text style={styles.svcName} numberOfLines={2}>{name}</Text>
              <Text style={styles.svcDur}>{duration} phút</Text>
              <View style={styles.svcMeta}>
                <Text style={styles.svcStar}>⭐ {rating.toFixed(1)}</Text>
                <Text style={styles.svcDist}>  📍 {distance} km</Text>
              </View>
              <Text style={styles.svcPrice}>{priceNum.toLocaleString('vi-VN')} đ</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardMuted}>Phương thức thanh toán</Text>
          <TouchableOpacity
            style={[styles.payRow, payKind === 'zena' && styles.payRowOn]}
            onPress={() => setPayKind('zena')}
            activeOpacity={0.85}
          >
            <View style={styles.radioOuter}>{payKind === 'zena' ? <View style={styles.radioInner} /> : null}</View>
            <View style={styles.payMid}>
              <Text style={styles.payTitle}>Số dư Zena</Text>
              {loadingWallet ? (
                <ActivityIndicator size="small" color={P.primary} style={{ marginTop: 6 }} />
              ) : (
                <Text style={styles.payBal}>đ {balance.toLocaleString('vi-VN')}</Text>
              )}
            </View>
            <TouchableOpacity style={styles.topupBtn} onPress={() => router.push('/therapist-topup')}>
              <Text style={styles.topupBtnText}>Nạp tiền</Text>
            </TouchableOpacity>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.payRow, payKind === 'payos' && styles.payRowOn, { marginTop: 10 }]}
            onPress={() => setPayKind('payos')}
            activeOpacity={0.85}
          >
            <View style={styles.radioOuter}>{payKind === 'payos' ? <View style={styles.radioInner} /> : null}</View>
            <View style={styles.payMid}>
              <Text style={styles.payTitle}>Chuyển khoản ngân hàng qua PayOS</Text>
              <Text style={styles.paySub}>Quét QR / mở link thanh toán</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardMuted}>
            Thông tin liên hệ của bạn <Text style={styles.req}>*</Text>
          </Text>
          <View style={styles.zaloRow}>
            <View style={styles.zaloBadge}>
              <Text style={styles.zaloEmoji}>💬</Text>
              <Text style={styles.zaloTxt}>Zalo</Text>
            </View>
            <TextInput
              style={styles.zaloInput}
              placeholder="Số điện thoại Zalo"
              placeholderTextColor={P.muted}
              keyboardType="phone-pad"
              value={zalo}
              onChangeText={setZalo}
            />
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Text style={styles.totalLabel}>Tổng tiền thanh toán</Text>
          <Text style={styles.totalVal}>{priceNum.toLocaleString('vi-VN')} đ</Text>
        </View>
        <TouchableOpacity
          style={[styles.cta, (!canSubmit || submitting) && styles.ctaOff]}
          disabled={!canSubmit || submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>Đặt ngay</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScheduleModal
        visible={showSchedule}
        value={scheduledAt}
        onChange={setScheduledAt}
        onClose={() => setShowSchedule(false)}
      />

      <Modal visible={showQr} animationType="slide" transparent onRequestClose={cancelQr}>
        <View style={styles.qrOverlay}>
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>Quét mã PayOS</Text>
            <Text style={styles.qrAmount}>{priceNum.toLocaleString('vi-VN')} đ</Text>
            {qrCodeValue ? (
              <View style={styles.qrWrap}>
                <QRCode value={qrCodeValue} size={220} />
              </View>
            ) : null}
            <Animated.Text style={[styles.qrWait, { opacity: pulseAnim }]}>Đang chờ thanh toán...</Animated.Text>
            <TouchableOpacity style={styles.qrLink} onPress={() => checkoutUrl && Linking.openURL(checkoutUrl)}>
              <Text style={styles.qrLinkText}>Mở trang thanh toán</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.qrCancel} onPress={cancelQr}>
              <Text style={styles.qrCancelText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ScheduleModal({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: Date;
  onChange: (d: Date) => void;
  onClose: () => void;
}) {
  const days = useMemo(() => {
    const out: Date[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      out.push(d);
    }
    return out;
  }, []);

  const hours = useMemo(() => Array.from({ length: 14 }, (_, i) => i + 8), []);

  const [dayPick, setDayPick] = useState(value);
  const [hourPick, setHourPick] = useState(value.getHours());

  useEffect(() => {
    if (visible) {
      setDayPick(value);
      setHourPick(value.getHours());
    }
  }, [visible, value]);

  const apply = () => {
    const d = new Date(dayPick);
    d.setHours(hourPick, 0, 0, 0);
    onChange(d);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalBg}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>Chọn ngày & giờ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll}>
            {days.map((d, i) => {
              const sel =
                d.getDate() === dayPick.getDate() &&
                d.getMonth() === dayPick.getMonth() &&
                d.getFullYear() === dayPick.getFullYear();
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.dayChip, sel && styles.dayChipOn]}
                  onPress={() => setDayPick(d)}
                >
                  <Text style={[styles.dayChipTxt, sel && styles.dayChipTxtOn]}>{d.getDate()}/{d.getMonth() + 1}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.hourGrid}>
            {hours.map((h) => (
              <TouchableOpacity
                key={h}
                style={[styles.hourChip, hourPick === h && styles.hourChipOn]}
                onPress={() => setHourPick(h)}
              >
                <Text style={[styles.hourTxt, hourPick === h && styles.hourTxtOn]}>{pad(h)}:00</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.modalOk} onPress={apply}>
            <Text style={styles.modalOkText}>Xác nhận</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: P.bg },
  centered: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  gateTitle: { fontSize: 22, fontWeight: '800', color: P.text, marginBottom: 10, textAlign: 'center' },
  gateDesc: { fontSize: 15, color: P.sub, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  gateBtn: {
    backgroundColor: P.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 28,
    marginBottom: 16,
  },
  gateBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  gateBack: { paddingVertical: 8 },
  errText: { textAlign: 'center', marginTop: 40, color: P.sub },
  link: { textAlign: 'center', marginTop: 12, color: P.primary, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: P.card,
    borderBottomWidth: 1,
    borderBottomColor: P.line,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: P.text },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 0 },
  card: {
    backgroundColor: P.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardMuted: { fontSize: 13, color: P.sub, marginBottom: 8 },
  scheduleHint: { fontSize: 15, fontWeight: '700', color: P.orange },
  svcRow: { flexDirection: 'row', gap: 12 },
  svcImg: { width: 88, height: 88, borderRadius: 12, backgroundColor: P.line },
  svcBody: { flex: 1 },
  svcName: { fontSize: 16, fontWeight: '800', color: P.text },
  svcDur: { fontSize: 13, color: P.sub, marginTop: 4 },
  svcMeta: { flexDirection: 'row', marginTop: 6 },
  svcStar: { fontSize: 13, color: P.text },
  svcDist: { fontSize: 13, color: P.sub },
  svcPrice: { fontSize: 18, fontWeight: '800', color: P.primary, marginTop: 8 },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: P.line,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  payRowOn: { borderColor: P.primary, backgroundColor: '#FFF5F5' },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: P.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: P.primary },
  payMid: { flex: 1 },
  payTitle: { fontSize: 14, fontWeight: '500', color: P.text },
  payBal: { fontSize: 12, fontWeight: '400', color: P.sub, marginTop: 4 },
  paySub: { fontSize: 12, color: P.sub, marginTop: 4 },
  topupBtn: {
    backgroundColor: P.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  topupBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  req: { color: AppColors.danger },
  zaloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: P.line,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  zaloBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderRightWidth: 1,
    borderRightColor: P.line,
  },
  zaloEmoji: { fontSize: 16 },
  zaloTxt: { fontWeight: '700', color: P.text },
  zaloInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: P.text },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: P.card,
    borderTopWidth: 1,
    borderTopColor: P.line,
  },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  totalLabel: { fontSize: 14, color: P.sub },
  totalVal: { fontSize: 18, fontWeight: '800', color: P.text },
  cta: {
    backgroundColor: P.primary,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
  },
  ctaOff: { backgroundColor: P.disabled },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  dayScroll: { marginBottom: 16 },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
  },
  dayChipOn: { backgroundColor: '#CCFBF1' },
  dayChipTxt: { fontWeight: '700', color: P.sub },
  dayChipTxtOn: { color: P.primary },
  hourGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hourChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  hourChipOn: { backgroundColor: P.primary },
  hourTxt: { fontWeight: '700', color: P.sub },
  hourTxtOn: { color: '#fff' },
  modalOk: {
    marginTop: 20,
    backgroundColor: P.primary,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
  },
  modalOkText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  qrOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  qrCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  qrTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  qrAmount: { fontSize: 22, fontWeight: '800', color: P.primary, marginBottom: 16 },
  qrWrap: { padding: 12, backgroundColor: '#fff', borderRadius: 12 },
  qrWait: { marginTop: 16, color: P.sub, fontWeight: '600' },
  qrLink: { marginTop: 16, paddingVertical: 10 },
  qrLinkText: { color: P.primary, fontWeight: '800' },
  qrCancel: { marginTop: 8 },
  qrCancelText: { color: P.sub, fontWeight: '600' },
});
