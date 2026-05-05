import Feather from '@expo/vector-icons/Feather';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OnboardingLanguage } from '@/components/Onboarding';
import TherapistTopUpScreen from '@/components/TherapistTopUpScreen';
import { AppColors } from '@/constants/appColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import type { WalletTransaction } from '@/lib/supabaseService';
import { createWithdrawalRequest, getOrCreateWallet, getWalletTransactions } from '@/lib/supabaseService';

// —— Translations ——
const TR: Record<OnboardingLanguage, Record<string, string>> = {
  vi: {
    title: 'Ví của tôi',
    balanceLabel: 'Số dư hiện tại',
    currency: 'đ',
    topUp: 'Nạp tiền',
    withdraw: 'Rút tiền',
    allTab: 'Tất cả',
    topupTab: 'Nạp tiền',
    paymentTab: 'Thanh toán',
    withdrawalTab: 'Rút tiền',
    earningTab: 'Thu nhập',
    historyTitle: 'Lịch sử giao dịch',
    emptyHistory: 'Chưa có giao dịch nào',
    statusDone: 'Thành công',
    statusPending: 'Đang xử lý',
    statusFailed: 'Thất bại',
    statusCancelled: 'Đã huỷ',
    descTopup: 'Nạp tiền',
    descPayment: 'Thanh toán',
    descEarning: 'Thu nhập',
    descFee: 'Phí dịch vụ',
    descRefund: 'Hoàn tiền',
    descWithdrawal: 'Rút tiền',
    withdrawTitle: 'Tạo lệnh rút tiền',
    bankName: 'Tên ngân hàng',
    accountNumber: 'Số tài khoản',
    accountHolder: 'Tên chủ tài khoản',
    amount: 'Số tiền rút',
    submitWithdraw: 'Gửi yêu cầu rút tiền',
    withdrawSuccess: 'Tạo lệnh rút tiền thành công! Đang chờ admin xử lý.',
    withdrawError: 'Không thể tạo lệnh rút tiền',
    insufficientBalance: 'Số dư không đủ',
    fillAllFields: 'Vui lòng điền đầy đủ thông tin',
    cancel: 'Huỷ',
    statusRejected: 'Từ chối',
  },
  en: {
    title: 'My Wallet',
    balanceLabel: 'Current Balance',
    currency: '₫',
    topUp: 'Top Up',
    withdraw: 'Withdraw',
    allTab: 'All',
    topupTab: 'Top Up',
    paymentTab: 'Payment',
    withdrawalTab: 'Withdrawal',
    earningTab: 'Earnings',
    historyTitle: 'Transaction History',
    emptyHistory: 'No transactions yet',
    statusDone: 'Success',
    statusPending: 'Pending',
    statusFailed: 'Failed',
    statusCancelled: 'Cancelled',
    descTopup: 'Top Up',
    descPayment: 'Payment',
    descEarning: 'Earning',
    descFee: 'Service Fee',
    descRefund: 'Refund',
    descWithdrawal: 'Withdrawal',
    withdrawTitle: 'Create Withdrawal Request',
    bankName: 'Bank Name',
    accountNumber: 'Account Number',
    accountHolder: 'Account Holder Name',
    amount: 'Withdrawal Amount',
    submitWithdraw: 'Submit Withdrawal Request',
    withdrawSuccess: 'Withdrawal request created! Waiting for admin to process.',
    withdrawError: 'Cannot create withdrawal request',
    insufficientBalance: 'Insufficient balance',
    fillAllFields: 'Please fill in all fields',
    cancel: 'Cancel',
    statusRejected: 'Rejected',
  },
};

// —— Colors (match app theme) ——
const P = {
  primary: AppColors.primaryDark,
  primaryDark: AppColors.primaryDark,
  bg: AppColors.bg,
  card: AppColors.white,
  text: AppColors.text,
  sub: AppColors.textMuted,
  muted: AppColors.accentMuted,
  line: AppColors.border,
  accent: AppColors.accent,
  success: AppColors.success,
  successBg: AppColors.successBg,
  warn: '#E39A1A',
  warnBg: '#FFF8E1',
  errorBg: AppColors.dangerBg,
  error: AppColors.danger,
};

type FilterTab = 'all' | 'topup' | 'payment' | 'withdrawal' | 'earning';

const CUSTOMER_TABS: FilterTab[] = ['all', 'topup', 'payment'];
const THERAPIST_TABS: FilterTab[] = ['all', 'topup', 'earning', 'withdrawal'];

const TAB_LABEL_KEYS: Record<FilterTab, string> = {
  all: 'allTab',
  topup: 'topupTab',
  payment: 'paymentTab',
  withdrawal: 'withdrawalTab',
  earning: 'earningTab',
};

function getTypeIcon(type: WalletTransaction['type']): { icon: keyof typeof Feather.glyphMap; color: string; bg: string } {
  switch (type) {
    case 'topup':
      return { icon: 'arrow-down-circle', color: P.success, bg: P.successBg };
    case 'payment':
      return { icon: 'shopping-cart', color: P.accent, bg: AppColors.accentSoft };
    case 'earning':
      return { icon: 'dollar-sign', color: P.success, bg: P.successBg };
    case 'fee':
      return { icon: 'percent', color: P.warn, bg: P.warnBg };
    case 'refund':
      return { icon: 'rotate-ccw', color: AppColors.danger, bg: AppColors.primarySoft };
    case 'withdrawal':
      return { icon: 'arrow-up-circle', color: P.accent, bg: AppColors.accentSoft };
    default:
      return { icon: 'circle', color: P.sub, bg: P.bg };
  }
}

function getDefaultDesc(type: WalletTransaction['type'], t: Record<string, string>): string {
  const map: Record<string, string> = {
    topup: t.descTopup,
    payment: t.descPayment,
    earning: t.descEarning,
    fee: t.descFee,
    refund: t.descRefund,
    withdrawal: t.descWithdrawal,
  };
  return map[type] || type;
}

export default function WalletScreen({ onClose }: { onClose: () => void }) {
  const { language } = useLanguage();
  const { user } = useUser();
  const t = TR[language as OnboardingLanguage] || TR.vi;
  const fmt = (n: number) => n.toLocaleString('vi-VN');
  const isTherapist = user?.role === 'therapist';

  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [wdBankName, setWdBankName] = useState('');
  const [wdAccountNumber, setWdAccountNumber] = useState('');
  const [wdAccountHolder, setWdAccountHolder] = useState('');
  const [wdAmount, setWdAmount] = useState('');

  const userId = user?.authUid;
  const tabs = isTherapist ? THERAPIST_TABS : CUSTOMER_TABS;

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const [w, txns] = await Promise.all([
        getOrCreateWallet(userId),
        getWalletTransactions(userId),
      ]);
      setBalance(w.balance);
      setHistory(txns);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredHistory = activeTab === 'all'
    ? history
    : history.filter((item) => item.type === activeTab);

  const handleTopUpClose = () => {
    setShowTopUp(false);
    loadData();
  };

  const resetWithdrawForm = () => {
    setWdBankName('');
    setWdAccountNumber('');
    setWdAccountHolder('');
    setWdAmount('');
  };

  const handleWithdrawSubmit = async () => {
    if (!userId) return;
    const amount = parseInt(wdAmount.replace(/[^0-9]/g, ''), 10);
    if (!wdBankName.trim() || !wdAccountNumber.trim() || !wdAccountHolder.trim() || !amount) {
      Alert.alert('', t.fillAllFields);
      return;
    }
    if (amount > balance) {
      Alert.alert('', t.insufficientBalance);
      return;
    }
    try {
      setWithdrawLoading(true);
      const result = await createWithdrawalRequest(userId, amount, wdBankName.trim(), wdAccountNumber.trim(), wdAccountHolder.trim());
      setBalance(result.balance);
      resetWithdrawForm();
      setShowWithdraw(false);
      Alert.alert('', t.withdrawSuccess);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t.withdrawError;
      Alert.alert(t.withdrawError, msg);
    } finally {
      setWithdrawLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={P.primary} />

      {/* â”€â”€ Header â”€â”€ */}
      <View style={s.headerBg}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={onClose} activeOpacity={0.7}>
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t.title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Balance card */}
        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>{t.balanceLabel}</Text>
          {loading ? (
            <ActivityIndicator color={P.primary} style={{ marginVertical: 8 }} />
          ) : (
            <Text style={s.balanceAmount}>
              {fmt(balance)} <Text style={s.balanceCurrency}>{t.currency}</Text>
            </Text>
          )}
          <View style={s.balanceBtnsRow}>
            <TouchableOpacity style={s.topUpBtn} onPress={() => setShowTopUp(true)} activeOpacity={0.85}>
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text style={s.topUpBtnText}>{t.topUp}</Text>
            </TouchableOpacity>
            {isTherapist && (
              <TouchableOpacity style={s.withdrawBtn} onPress={() => setShowWithdraw(true)} activeOpacity={0.85}>
                <Feather name="arrow-up-circle" size={16} color={P.primary} />
                <Text style={s.withdrawBtnText}>{t.withdraw}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* â”€â”€ Body â”€â”€ */}
      <View style={s.body}>
        {/* Filter tabs */}
        <View style={s.tabsRow}>
          {tabs.map((tab) => {
            const active = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[s.tab, active && s.tabActive]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
              >
                <Text style={[s.tabText, active && s.tabTextActive]}>
                  {t[TAB_LABEL_KEYS[tab]]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* History title */}
        <Text style={s.sectionTitle}>{t.historyTitle}</Text>

        {/* Transaction list */}
        <ScrollView
          style={s.listWrap}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={s.emptyWrap}>
              <ActivityIndicator size="large" color={P.primary} />
            </View>
          ) : filteredHistory.length === 0 ? (
            <View style={s.emptyWrap}>
              <Feather name="inbox" size={48} color={P.muted} />
              <Text style={s.emptyText}>{t.emptyHistory}</Text>
            </View>
          ) : (
            filteredHistory.map((item, idx) => {
              const d = new Date(item.createdAt);
              const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
              const isPositive = item.amount > 0;
              const typeInfo = getTypeIcon(item.type);
              const statusStyle = item.status === 'completed' ? 'done'
                : item.status === 'pending' ? 'pending'
                : 'failed';
              const statusLabel = item.status === 'completed' ? t.statusDone
                : item.status === 'pending' ? t.statusPending
                : item.status === 'failed' ? t.statusFailed
                : t.statusCancelled;

              return (
                <View key={item.id} style={[s.txnCard, idx > 0 && { marginTop: 8 }]}>
                  <View style={[s.txnIcon, { backgroundColor: typeInfo.bg }]}>
                    <Feather name={typeInfo.icon} size={20} color={typeInfo.color} />
                  </View>
                  <View style={s.txnInfo}>
                    <Text style={s.txnDesc} numberOfLines={1}>
                      {item.description || getDefaultDesc(item.type, t)}
                    </Text>
                    <Text style={s.txnDate}>{dateStr}</Text>
                  </View>
                  <View style={s.txnRight}>
                    <Text style={[s.txnAmount, isPositive ? s.txnAmountIn : s.txnAmountOut]}>
                      {isPositive ? '+' : ''}{fmt(item.amount)} {t.currency}
                    </Text>
                    <View style={[
                      s.statusChip,
                      statusStyle === 'done' && s.statusDone,
                      statusStyle === 'pending' && s.statusPending,
                      statusStyle === 'failed' && s.statusFailed,
                    ]}>
                      <Text style={[
                        s.statusText,
                        statusStyle === 'done' && s.statusTextDone,
                        statusStyle === 'pending' && s.statusTextPending,
                        statusStyle === 'failed' && s.statusTextFailed,
                      ]}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
          <View style={{ height: 30 }} />
        </ScrollView>
      </View>

      {/* Top-up modal */}
      <Modal visible={showTopUp} animationType="slide" onRequestClose={handleTopUpClose}>
        <TherapistTopUpScreen onClose={handleTopUpClose} />
      </Modal>

      {/* Withdrawal modal */}
      <Modal visible={showWithdraw} animationType="slide" transparent onRequestClose={() => { setShowWithdraw(false); resetWithdrawForm(); }}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t.withdrawTitle}</Text>
              <TouchableOpacity onPress={() => { setShowWithdraw(false); resetWithdrawForm(); }}>
                <Feather name="x" size={24} color={P.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.inputLabel}>{t.bankName}</Text>
              <TextInput
                style={s.textInput}
                placeholder="VD: Vietcombank, MB Bank..."
                value={wdBankName}
                onChangeText={setWdBankName}
                autoCapitalize="words"
              />

              <Text style={s.inputLabel}>{t.accountNumber}</Text>
              <TextInput
                style={s.textInput}
                placeholder="VD: 0123456789"
                value={wdAccountNumber}
                onChangeText={setWdAccountNumber}
                keyboardType="number-pad"
              />

              <Text style={s.inputLabel}>{t.accountHolder}</Text>
              <TextInput
                style={s.textInput}
                placeholder="VD: NGUYEN VAN A"
                value={wdAccountHolder}
                onChangeText={setWdAccountHolder}
                autoCapitalize="characters"
              />

              <Text style={s.inputLabel}>{t.amount}</Text>
              <TextInput
                style={s.textInput}
                placeholder="VD: 500000"
                value={wdAmount}
                onChangeText={setWdAmount}
                keyboardType="number-pad"
              />
              <Text style={s.balanceHint}>
                {t.balanceLabel}: {fmt(balance)} {t.currency}
              </Text>

              <TouchableOpacity
                style={[s.submitBtn, withdrawLoading && { opacity: 0.6 }]}
                onPress={handleWithdrawSubmit}
                disabled={withdrawLoading}
                activeOpacity={0.85}
              >
                {withdrawLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={s.submitBtnText}>{t.submitWithdraw}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowWithdraw(false); resetWithdrawForm(); }}>
                <Text style={s.cancelBtnText}>{t.cancel}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â•â•         STYLES           â•â•
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: P.primary },

  // â”€â”€ Header â”€â”€
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

  // â”€â”€ Balance card â”€â”€
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
    fontSize: 24,
    fontWeight: '400',
    color: P.text,
    letterSpacing: 0,
    marginBottom: 16,
  },
  balanceCurrency: {
    fontSize: 16,
    fontWeight: '400',
    color: P.sub,
  },
  balanceBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: P.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  topUpBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: P.primary,
  },
  withdrawBtnText: {
    color: P.primary,
    fontSize: 14,
    fontWeight: '700',
  },

  // â”€â”€ Body â”€â”€
  body: {
    flex: 1,
    backgroundColor: P.bg,
    marginTop: -16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
  },

  // â”€â”€ Filter tabs â”€â”€
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: P.card,
    borderWidth: 1,
    borderColor: P.line,
  },
  tabActive: {
    backgroundColor: P.primary,
    borderColor: P.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: P.sub,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  // â”€â”€ Section title â”€â”€
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: P.text,
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  // â”€â”€ List â”€â”€
  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },

  // â”€â”€ Transaction card â”€â”€
  txnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.card,
    borderRadius: 14,
    padding: 14,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  txnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txnInfo: {
    flex: 1,
  },
  txnDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: P.text,
  },
  txnDate: {
    fontSize: 12,
    color: P.sub,
    marginTop: 2,
  },
  txnRight: {
    alignItems: 'flex-end',
    gap: 4,
    marginLeft: 8,
  },
  txnAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  txnAmountIn: { color: P.success },
  txnAmountOut: { color: P.accent },

  // â”€â”€ Status chips â”€â”€
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusDone: { backgroundColor: P.successBg },
  statusPending: { backgroundColor: P.warnBg },
  statusFailed: { backgroundColor: P.errorBg },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextDone: { color: P.success },
  statusTextPending: { color: P.warn },
  statusTextFailed: { color: P.error },

  // â”€â”€ Empty state â”€â”€
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    color: P.muted,
    fontSize: 15,
    fontWeight: '500',
  },

  // â”€â”€ Withdrawal modal â”€â”€
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: P.text,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: P.sub,
    marginBottom: 6,
    marginTop: 14,
  },
  textInput: {
    backgroundColor: P.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: P.text,
    borderWidth: 1,
    borderColor: P.line,
  },
  balanceHint: {
    fontSize: 12,
    color: P.sub,
    marginTop: 6,
  },
  submitBtn: {
    backgroundColor: P.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  cancelBtnText: {
    color: P.sub,
    fontSize: 14,
    fontWeight: '600',
  },
});
