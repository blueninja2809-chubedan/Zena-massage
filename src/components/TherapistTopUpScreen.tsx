import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Linking,
    Modal,
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

import type { OnboardingLanguage } from '@/components/Onboarding';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { checkPayOSPaymentStatus, createPayOSPayment } from '@/lib/payosService';
import type { WalletTransaction } from '@/lib/supabaseService';
import { getOrCreateWallet, getWalletTransactions, walletTopUp } from '@/lib/supabaseService';

const { width: SCREEN_W } = Dimensions.get('window');

const TR: Record<OnboardingLanguage, Record<string, string>> = {
  vi: {
    title: 'Nạp tiền',
    balanceLabel: 'Số dư hiện tại',
    currency: 'đ',
    amountPlaceholder: 'Nhập số tiền (VND)',
    methodTitle: 'Phương thức thanh toán',
    payos: 'PayOS - QR Code',
    payosDesc: 'Quét mã QR • Xác nhận tự động',
    bank: 'Chuyển khoản ngân hàng',
    bankDesc: 'Chuyển khoản thủ công',
    atm: 'Thẻ ATM nội địa',
    atmDesc: 'Thẻ ghi nợ nội địa',
    card: 'Visa / MasterCard / JCB',
    cardDesc: 'Thẻ quốc tế',
    continueBtn: 'Nạp tiền ngay',
    processing: 'Đang xử lý...',
    historyTitle: 'Lịch sử giao dịch',
    emptyHistory: 'Chưa có giao dịch nào',
    statusDone: 'Thành công',
    statusPending: 'Đang xử lý',
    invalidAmount: 'Vui lòng nhập số tiền lớn hơn 0',
    invalidMethod: 'Vui lòng chọn phương thức thanh toán',
    topupSuccess: 'Nạp tiền thành công!',
    topupSuccessMsg: 'Số dư của bạn đã được cập nhật.',
    topupError: 'Nạp tiền thất bại',
    loginRequired: 'Vui lòng đăng nhập để sử dụng ví.',
    comingSoon: 'Sắp ra mắt',
    // QR modal
    qrTitle: 'Quét mã để thanh toán',
    qrAmount: 'Số tiền thanh toán',
    qrWaiting: 'Đang chờ thanh toán...',
    qrHint: 'Mở app ngân hàng và quét mã QR bên trên',
    qrOpenBank: 'Mở ứng dụng thanh toán',
    qrCancel: 'Huỷ giao dịch',
    qrSuccess: 'Thanh toán thành công!',
    qrSuccessMsg: 'Số dư ví của bạn đã được cập nhật.',
    qrFailed: 'Thanh toán thất bại',
    qrExpired: 'Mã QR đã hết hạn. Vui lòng thử lại.',
    qrCreating: 'Đang tạo mã thanh toán...',
    recommended: 'Khuyên dùng',
  },
  en: {
    title: 'Top Up',
    balanceLabel: 'Current Balance',
    currency: '₫',
    amountPlaceholder: 'Enter amount (VND)',
    methodTitle: 'Payment Method',
    payos: 'PayOS - QR Code',
    payosDesc: 'Scan QR • Auto-confirmed',
    bank: 'Bank Transfer',
    bankDesc: 'Manual bank transfer',
    atm: 'ATM Card',
    atmDesc: 'Domestic debit card',
    card: 'Visa / MasterCard / JCB',
    cardDesc: 'International card',
    continueBtn: 'Top Up Now',
    processing: 'Processing...',
    historyTitle: 'Transaction History',
    emptyHistory: 'No transactions yet',
    statusDone: 'Success',
    statusPending: 'Pending',
    invalidAmount: 'Please enter an amount greater than 0',
    invalidMethod: 'Please select a payment method',
    topupSuccess: 'Top-up successful!',
    topupSuccessMsg: 'Your balance has been updated.',
    topupError: 'Top-up failed',
    loginRequired: 'Please sign in to use wallet.',
    comingSoon: 'Coming soon',
    qrTitle: 'Scan to Pay',
    qrAmount: 'Payment Amount',
    qrWaiting: 'Waiting for payment...',
    qrHint: 'Open your banking app and scan the QR code above',
    qrOpenBank: 'Open Payment App',
    qrCancel: 'Cancel Transaction',
    qrSuccess: 'Payment successful!',
    qrSuccessMsg: 'Your wallet balance has been updated.',
    qrFailed: 'Payment failed',
    qrExpired: 'QR code expired. Please try again.',
    qrCreating: 'Creating payment...',
    recommended: 'Recommended',
  },
};

// ── Color palette (matches home screen) ──
const P = {
  primary: '#E53935',
  primaryDark: '#C62828',
  primaryLight: '#EF5350',
  bg: '#FFFBFB',
  card: '#FFFFFF',
  text: '#1A1A1A',
  sub: '#4B5563',
  muted: '#9E8585',
  line: '#E2E8F0',
  accent: '#E53935',
  success: '#1E3A5F',
  successBg: '#E8F5E9',
  warn: '#E39A1A',
  warnBg: '#FFF8E1',
  disabled: '#E0EFED',
  disabledText: '#9E8585',
};

type MethodKey = 'payos' | 'bank' | 'atm' | 'card';

interface PayMethod {
  key: MethodKey;
  icon: keyof typeof Feather.glyphMap;
  labelKey: string;
  descKey: string;
  recommended?: boolean;
  available: boolean;
}

const METHODS: PayMethod[] = [
  { key: 'payos', icon: 'smartphone', labelKey: 'payos', descKey: 'payosDesc', recommended: true, available: true },
  { key: 'bank', icon: 'repeat', labelKey: 'bank', descKey: 'bankDesc', available: false },
  { key: 'atm', icon: 'credit-card', labelKey: 'atm', descKey: 'atmDesc', available: false },
  { key: 'card', icon: 'globe', labelKey: 'card', descKey: 'cardDesc', available: false },
];

export default function TherapistTopUpScreen({ onClose }: { onClose?: () => void } = {}) {
  const router = useRouter();
  const { language } = useLanguage();
  const { user } = useUser();
  const t = TR[language as OnboardingLanguage] || TR.vi;
  const fmt = (n: number) => n.toLocaleString('vi-VN');

  // ── State ──
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<MethodKey | null>('payos');
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<WalletTransaction[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // PayOS QR
  const [showQr, setShowQr] = useState(false);
  const [qrCodeValue, setQrCodeValue] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const userId = user?.authUid;
  const numericAmount = Number(String(amount).replace(/\D/g, '')) || 0;
  const hasAmount = numericAmount > 0;
  const canContinue = hasAmount && !!method && !submitting;

  // ── Load wallet ──
  const loadWallet = useCallback(async () => {
    if (!userId) return;
    try {
      setLoadingWallet(true);
      const [w, txns] = await Promise.all([
        getOrCreateWallet(userId),
        getWalletTransactions(userId),
      ]);
      setBalance(w.balance);
      setHistory(txns);
    } catch {
      // silent
    } finally {
      setLoadingWallet(false);
    }
  }, [userId]);

  useEffect(() => { loadWallet(); }, [loadWallet]);

  // ── Pulse animation for waiting ──
  useEffect(() => {
    if (!showQr) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showQr, pulseAnim]);

  // ── PayOS polling ──
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback((orderCode: number) => {
    stopPolling();
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 60) { // ~5 min
        stopPolling(); setShowQr(false);
        Alert.alert(t.qrFailed, t.qrExpired);
        return;
      }
      try {
        setPolling(true);
        const res = await checkPayOSPaymentStatus(orderCode);
        if (res.success && res.data) {
          if (res.data.status === 'PAID') {
            stopPolling(); setShowQr(false);
            if (userId) {
              const [w, txns] = await Promise.all([getOrCreateWallet(userId), getWalletTransactions(userId)]);
              setBalance(w.balance);
              setHistory(txns);
            }
            setAmount(''); setMethod('payos');
            Alert.alert(t.qrSuccess, t.qrSuccessMsg);
          } else if (res.data.status === 'CANCELLED' || res.data.status === 'EXPIRED') {
            stopPolling(); setShowQr(false);
            Alert.alert(t.qrFailed, t.qrExpired);
          }
        }
      } catch { /* retry */ } finally { setPolling(false); }
    }, 5000);
  }, [stopPolling, userId, t]);

  // ── Handlers ──
  const handleContinue = async () => {
    if (!userId) { Alert.alert('', t.loginRequired); return; }
    if (!hasAmount) { Alert.alert('', t.invalidAmount); return; }
    if (!method) { Alert.alert('', t.invalidMethod); return; }

    if (method === 'payos') {
      try {
        setSubmitting(true);
        const res = await createPayOSPayment(userId, numericAmount);
        if (!res.success || !res.data) { Alert.alert(t.qrFailed, res.message || ''); return; }
        setQrCodeValue(res.data.qrCode);
        setCheckoutUrl(res.data.checkoutUrl);
        setShowQr(true);
        startPolling(res.data.orderCode);
      } catch (err: unknown) {
        Alert.alert(t.qrFailed, (err as Error)?.message || String(err));
      } finally { setSubmitting(false); }
      return;
    }

    // Other methods
    try {
      setSubmitting(true);
      const res = await walletTopUp(userId, numericAmount, method);
      setBalance(res.balance); setAmount(''); setMethod('payos');
      const txns = await getWalletTransactions(userId);
      setHistory(txns);
      Alert.alert(t.topupSuccess, `${t.topupSuccessMsg}\n+${fmt(numericAmount)} ${t.currency}`);
    } catch (err: unknown) {
      Alert.alert(t.topupError, (err as Error)?.message || String(err));
    } finally { setSubmitting(false); }
  };

  const handleCancelQr = () => { stopPolling(); setShowQr(false); setQrCodeValue(''); setCheckoutUrl(''); };
  const handleOpenCheckout = () => { if (checkoutUrl) Linking.openURL(checkoutUrl).catch(() => {}); };
  const handleBack = () => { if (onClose) { onClose(); return; } router.back(); };

  // ── Render ──
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={P.primary} />

      {/* ── Header ── */}
      <View style={s.headerBg}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={handleBack} activeOpacity={0.7}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t.title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Balance display */}
        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>{t.balanceLabel}</Text>
          {loadingWallet ? (
            <ActivityIndicator color={P.primary} style={{ marginVertical: 8 }} />
          ) : (
            <Text style={s.balanceAmount}>{fmt(balance)} <Text style={s.balanceCurrency}>{t.currency}</Text></Text>
          )}
        </View>
      </View>

      <ScrollView
        style={s.body}
        contentContainerStyle={s.bodyContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Amount input card ── */}
        <View style={s.card}>
          <View style={s.amountInputWrap}>
            <Text style={s.inputPrefix}>₫</Text>
            <TextInput
              value={amount ? fmt(numericAmount) : ''}
              onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
              placeholder={t.amountPlaceholder}
              keyboardType="number-pad"
              placeholderTextColor={P.muted}
              style={s.amountInput}
            />
          </View>
        </View>

        {/* ── Payment methods ── */}
        <Text style={s.sectionTitle}>{t.methodTitle}</Text>
        <View style={s.card}>
          {METHODS.map((m, idx) => {
            const selected = method === m.key;
            const isLast = idx === METHODS.length - 1;
            return (
              <TouchableOpacity
                key={m.key}
                style={[s.methodRow, selected && s.methodRowActive, !isLast && s.methodRowBorder]}
                onPress={() => m.available && setMethod(m.key)}
                activeOpacity={m.available ? 0.7 : 1}
              >
                <View style={[s.methodIcon, selected && s.methodIconActive]}>
                  <Feather name={m.icon} size={18} color={selected ? '#FFFFFF' : P.sub} />
                </View>
                <View style={s.methodInfo}>
                  <View style={s.methodLabelRow}>
                    <Text style={[s.methodLabel, !m.available && s.methodLabelDisabled]}>{t[m.labelKey]}</Text>
                    {m.recommended && (
                      <View style={s.recommendBadge}>
                        <Text style={s.recommendText}>{t.recommended}</Text>
                      </View>
                    )}
                    {!m.available && (
                      <View style={s.comingSoonBadge}>
                        <Text style={s.comingSoonBadgeText}>{t.comingSoon}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.methodDesc}>{t[m.descKey]}</Text>
                </View>
                <View style={[s.radio, selected && s.radioSelected]}>
                  {selected && <View style={s.radioInner} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Continue button ── */}
        <TouchableOpacity
          style={[s.continueBtn, !canContinue && s.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Feather name="zap" size={20} color={canContinue ? '#FFFFFF' : P.disabledText} />
              <Text style={[s.continueBtnText, !canContinue && s.continueBtnTextDisabled]}>
                {hasAmount ? `${t.continueBtn}  •  ${fmt(numericAmount)} ${t.currency}` : t.continueBtn}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── Transaction history ── */}
        <Text style={s.sectionTitle}>{t.historyTitle}</Text>
        <View style={s.card}>
          {history.length === 0 ? (
            <View style={s.emptyWrap}>
              <Feather name="inbox" size={36} color={P.muted} />
              <Text style={s.emptyText}>{t.emptyHistory}</Text>
            </View>
          ) : (
            history.map((item, idx) => {
              const d = new Date(item.createdAt);
              const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
              const isPositive = item.amount > 0;
              const isDone = item.status === 'completed';
              return (
                <View key={item.id} style={[s.historyRow, idx > 0 && s.historyRowBorder]}>
                  <View style={[s.historyDot, isPositive ? s.historyDotIn : s.historyDotOut]} />
                  <View style={s.historyInfo}>
                    <Text style={s.historyDesc}>{item.description || (isPositive ? 'Nạp tiền' : 'Thanh toán')}</Text>
                    <Text style={s.historyDate}>{dateStr}</Text>
                  </View>
                  <View style={s.historyRight}>
                    <Text style={[s.historyAmount, isPositive ? s.historyAmountIn : s.historyAmountOut]}>
                      {isPositive ? '+' : ''}{fmt(item.amount)} {t.currency}
                    </Text>
                    <View style={[s.statusChip, isDone ? s.statusDone : s.statusPending]}>
                      <Text style={[s.statusText, isDone ? s.statusTextDone : s.statusTextPending]}>
                        {isDone ? t.statusDone : t.statusPending}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ═══ PayOS QR Code Modal (Bottom Sheet) ═══ */}
      <Modal visible={showQr} transparent animationType="slide" onRequestClose={handleCancelQr}>
        <View style={s.overlay}>
          <View style={s.qrSheet}>
            {/* Handle bar */}
            <View style={s.sheetHandle} />

            {/* Close X */}
            <TouchableOpacity style={s.qrClose} onPress={handleCancelQr} activeOpacity={0.7}>
              <Feather name="x" size={22} color={P.sub} />
            </TouchableOpacity>

            <Text style={s.qrTitle}>{t.qrTitle}</Text>

            <View style={s.qrAmountChip}>
              <Text style={s.qrAmountLabel}>{t.qrAmount}</Text>
              <Text style={s.qrAmountValue}>{fmt(numericAmount)} {t.currency}</Text>
            </View>

            {/* QR Image */}
            {qrCodeValue ? (
              <View style={s.qrImageWrap}>
                <QRCode
                  value={qrCodeValue}
                  size={SCREEN_W * 0.55}
                  backgroundColor="#FFFFFF"
                  color="#111111"
                />
              </View>
            ) : (
              <View style={s.qrPlaceholder}>
                <ActivityIndicator size="large" color={P.primary} />
                <Text style={s.qrPlaceholderText}>{t.qrCreating}</Text>
              </View>
            )}

            {/* Waiting indicator */}
            <Animated.View style={[s.waitingRow, { opacity: pulseAnim }]}>
              <Feather name="radio" size={16} color={P.primary} />
              <Text style={s.waitingText}>{t.qrWaiting}</Text>
            </Animated.View>
            <Text style={s.qrHint}>{t.qrHint}</Text>

            {/* Open bank app */}
            <TouchableOpacity style={s.openBankBtn} onPress={handleOpenCheckout} activeOpacity={0.85}>
              <Feather name="external-link" size={18} color="#FFFFFF" />
              <Text style={s.openBankText}>{t.qrOpenBank}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.cancelQrBtn} onPress={handleCancelQr} activeOpacity={0.7}>
              <Text style={s.cancelQrText}>{t.qrCancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ═══════════════════════════════
// ══         STYLES           ══
// ═══════════════════════════════
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: P.primary },

  // ── Header ──
  headerBg: {
    backgroundColor: P.primary,
    paddingBottom: 40,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Balance card
  balanceCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  balanceLabel: {
    fontSize: 12,
    color: P.sub,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: P.text,
    letterSpacing: -0.5,
  },
  balanceCurrency: {
    fontSize: 20,
    fontWeight: '600',
    color: P.sub,
  },

  // ── Body ──
  body: {
    flex: 1,
    backgroundColor: P.bg,
    marginTop: -16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  bodyContent: { padding: 16, paddingTop: 24 },

  // Card shared
  card: {
    backgroundColor: P.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#E53935',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: P.text,
    marginBottom: 10,
    marginTop: 4,
  },

  // ── Amount Input ──
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.bg,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: P.line,
  },
  inputPrefix: {
    fontSize: 28,
    fontWeight: '700',
    color: P.primary,
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: P.text,
    paddingVertical: 14,
  },

  // ── Payment methods ──
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  methodRowActive: {
    backgroundColor: P.bg,
    borderRadius: 12,
    marginHorizontal: -4,
    paddingHorizontal: 8,
  },
  methodRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: P.line,
  },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: P.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  methodIconActive: {
    backgroundColor: P.primary,
  },
  methodInfo: {
    flex: 1,
  },
  methodLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  methodLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: P.text,
  },
  methodLabelDisabled: {
    color: P.muted,
  },
  methodDesc: {
    fontSize: 12,
    color: P.sub,
    marginTop: 2,
  },
  recommendBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recommendText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E3A5F',
    textTransform: 'uppercase',
  },
  comingSoonBadge: {
    backgroundColor: P.warnBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  comingSoonBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: P.warn,
    textTransform: 'uppercase',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: P.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  radioSelected: {
    borderColor: P.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: P.primary,
  },

  // ── Continue ──
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: P.primary,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 20,
    shadowColor: P.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  continueBtnDisabled: {
    backgroundColor: P.disabled,
    shadowOpacity: 0,
    elevation: 0,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  continueBtnTextDisabled: {
    color: P.disabledText,
  },

  // ── History ──
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    color: P.muted,
    fontSize: 14,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  historyRowBorder: {
    borderTopWidth: 1,
    borderTopColor: P.line,
  },
  historyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  historyDotIn: { backgroundColor: P.success },
  historyDotOut: { backgroundColor: P.accent },
  historyInfo: { flex: 1 },
  historyDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: P.text,
  },
  historyDate: {
    fontSize: 12,
    color: P.sub,
    marginTop: 2,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  historyAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  historyAmountIn: { color: P.success },
  historyAmountOut: { color: P.accent },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusDone: { backgroundColor: P.successBg },
  statusPending: { backgroundColor: P.warnBg },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextDone: { color: P.success },
  statusTextPending: { color: P.warn },

  // ═══ QR Modal ═══
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  qrSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 34,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: P.line,
    marginBottom: 16,
  },
  qrClose: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: P.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  qrTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: P.text,
    marginBottom: 12,
  },
  qrAmountChip: {
    backgroundColor: P.bg,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: P.line,
  },
  qrAmountLabel: {
    fontSize: 11,
    color: P.sub,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  qrAmountValue: {
    fontSize: 26,
    fontWeight: '800',
    color: P.primary,
    marginTop: 2,
  },
  qrImageWrap: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: P.line,
    padding: 8,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  qrImage: {
    width: SCREEN_W * 0.55,
    height: SCREEN_W * 0.55,
    borderRadius: 12,
  },
  qrPlaceholder: {
    width: SCREEN_W * 0.55,
    height: SCREEN_W * 0.55,
    borderRadius: 16,
    backgroundColor: P.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  qrPlaceholderText: {
    color: P.sub,
    fontSize: 14,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  waitingText: {
    fontSize: 14,
    fontWeight: '600',
    color: P.primary,
  },
  qrHint: {
    fontSize: 12,
    color: P.sub,
    textAlign: 'center',
    marginBottom: 20,
  },
  openBankBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: P.primary,
    borderRadius: 14,
    paddingVertical: 15,
    width: '100%',
    marginBottom: 10,
    shadowColor: P.primary,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  openBankText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelQrBtn: {
    paddingVertical: 12,
  },
  cancelQrText: {
    color: P.sub,
    fontSize: 15,
    fontWeight: '600',
  },
});
