import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OnboardingLanguage } from '@/components/Onboarding';
import TherapistTopUpScreen from '@/components/TherapistTopUpScreen';
import { useBookings } from '@/contexts/BookingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import type { WalletTransaction } from '@/lib/supabaseService';
import { getOrCreateWallet, getWalletTransactions } from '@/lib/supabaseService';

const translations: Record<OnboardingLanguage, Record<string, string>> = {
  vi: {
    title: 'Số dư',
    subtitle: 'Theo dõi thu nhập và đối soát nhanh',
    transactions: 'Lịch sử',
    noTransactions: 'Chưa có giao dịch nào',
    withdraw: 'Rút tiền',
    topUp: 'Nạp tiền',
    completed: 'Thành công',
    month: 'Tháng',
    week: 'Tuần',
    day: 'Ngày',
    reconcile: 'Đối soát',
  },
  en: {
    title: 'Balance',
    subtitle: 'Track earnings and reconciliation',
    transactions: 'History',
    noTransactions: 'No transactions yet',
    withdraw: 'Withdraw',
    topUp: 'Top up',
    completed: 'Success',
    month: 'Month',
    week: 'Week',
    day: 'Day',
    reconcile: 'Reconcile',
  },
};

const C = {
  bg: '#FFF7FA',
  card: '#FFFFFF',
  text: '#2A0C16',
  sub: '#9C6A79',
  line: '#F2DEE6',
  accent: '#FF2D55',
  accentSoft: '#FFE8EE',
  softGray: '#FFF1F5',
};

type Tx = {
  id: string;
  title: string;
  amount: number;
  date: string;
  success: boolean;
};

export default function TherapistEarningsScreen() {
  const { language } = useLanguage();
  const { user } = useUser();
  const { getTherapistBookings } = useBookings();
  const t = translations[language as OnboardingLanguage] || translations.vi;
  const [period, setPeriod] = useState<'month' | 'week' | 'day'>('month');
  const [walletBalance, setWalletBalance] = useState(0);
  const [showTopUp, setShowTopUp] = useState(false);
  const [walletTxns, setWalletTxns] = useState<WalletTransaction[]>([]);

  useEffect(() => {
    if (!user?.authUid) return;
    getOrCreateWallet(user.authUid)
      .then((w) => setWalletBalance(w.balance))
      .catch(() => {});
    getWalletTransactions(user.authUid)
      .then((txns) => setWalletTxns(txns))
      .catch(() => {});
  }, [user?.authUid]);

  const allBookings = getTherapistBookings(user?.authUid ?? '');

  // Filter bookings by period and compute earnings
  const { filteredBookings, completedCount, pendingCount } = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    let cutoff: string;
    if (period === 'day') {
      cutoff = today;
    } else if (period === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      cutoff = weekAgo.toISOString().slice(0, 10);
    } else {
      const monthAgo = new Date(now);
      monthAgo.setMonth(now.getMonth() - 1);
      cutoff = monthAgo.toISOString().slice(0, 10);
    }
    const filtered = allBookings
      .filter(b => (b.status === 'completed' || b.status === 'confirmed' || b.status === 'pending') && b.date >= cutoff)
      .sort((a, b) => b.date.localeCompare(a.date));
    const completed = filtered.filter(b => b.status === 'completed');
    return {
      filteredBookings: filtered,
      completedCount: completed.length,
      pendingCount: filtered.filter((b) => b.status === 'pending' || b.status === 'confirmed').length,
    };
  }, [allBookings, period]);

  const transactions: Tx[] = useMemo(() => {
    const list: Tx[] = [];

    // Add real wallet transactions
    walletTxns.forEach((wt) => {
      list.push({
        id: wt.id,
        title: wt.description || wt.type,
        amount: wt.amount,
        date: wt.createdAt,
        success: wt.status === 'completed',
      });
    });

    // Add booking fee deductions
    filteredBookings.forEach((b) => {
      if (b.status === 'completed') {
        const fee = Math.round((b.price * 0.33) / 1000) * 1000;
        list.push({
          id: `fee-${b.id}`,
          title: `Phí Zena - đơn ${b.id.slice(-8).toUpperCase()}`,
          amount: -fee,
          date: `${b.date}T12:00:00.000Z`,
          success: true,
        });
      }
    });

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredBookings, walletTxns]);

  return (
    <>
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.contentWrap}>
        <View style={s.headerCard}>
          <View>
            <Text style={s.title}>{t.title}</Text>
            <Text style={s.subtitle}>{t.subtitle}</Text>
            <Text style={s.amount}>{walletBalance.toLocaleString('vi-VN')}đ</Text>
            <Text style={s.amountHint}>{period === 'month' ? '30 ngày gần nhất' : period === 'week' ? '7 ngày gần nhất' : 'Hôm nay'}</Text>
          </View>

          <View style={s.miniStatRow}>
            <View style={s.miniStatCard}>
              <Text style={s.miniStatLabel}>Đơn hoàn thành</Text>
              <Text style={s.miniStatValue}>{completedCount}</Text>
            </View>
            <View style={s.miniStatCard}>
              <Text style={s.miniStatLabel}>Đơn đang xử lý</Text>
              <Text style={s.miniStatValue}>{pendingCount}</Text>
            </View>
          </View>
        </View>

        <View style={s.periodRow}>
          {(['month', 'week', 'day'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[s.periodChip, period === p && s.periodChipActive]}
              onPress={() => setPeriod(p)}
              activeOpacity={0.85}
            >
              <Text style={[s.periodChipText, period === p && s.periodChipTextActive]}>{t[p]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <LinearGradient colors={[C.accentSoft, '#E7F3E3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.banner}>
          <View style={s.actionRow}>
            <TouchableOpacity
              style={[s.actionBtn, s.actionBtnPrimary]}
              activeOpacity={0.9}
              onPress={() => setShowTopUp(true)}
            >
              <Text style={s.actionBtnPrimaryText}>{t.topUp}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, s.actionBtnGhost]} activeOpacity={0.9}>
              <Text style={s.actionBtnGhostText}>{t.withdraw}</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>{t.transactions}</Text>
          <Text style={s.reconcile}>{t.reconcile}</Text>
        </View>

        {transactions.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📭</Text>
            <Text style={s.emptyText}>{t.noTransactions}</Text>
          </View>
        ) : (
          transactions.map((tx: Tx) => {
            const date = new Date(tx.date);
            const h = String(date.getHours()).padStart(2, '0');
            const m = String(date.getMinutes()).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const mon = String(date.getMonth() + 1).padStart(2, '0');
            const y = date.getFullYear();
            return (
              <View key={tx.id} style={s.txCard}>
                <View style={[s.txAvatar, tx.amount > 0 ? s.txAvatarPositive : s.txAvatarNegative]}>
                  <Text style={s.txAvatarText}>{tx.amount > 0 ? '↗' : '↘'}</Text>
                </View>
                <View style={s.txInfo}>
                  <Text style={s.txName}>{tx.title}</Text>
                  <Text style={s.txService}>{tx.amount > 0 ? `+${tx.amount.toLocaleString('vi-VN')} đ` : `${tx.amount.toLocaleString('vi-VN')} đ`}</Text>
                </View>
                <View style={s.txRight}>
                  <Text style={s.txStatus}>{t.completed}</Text>
                  <Text style={s.txDate}>{`${h}:${m}, ${d}/${mon}/${y}`}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

    </SafeAreaView>

    <Modal visible={showTopUp} animationType="slide" onRequestClose={() => setShowTopUp(false)}>
      <TherapistTopUpScreen onClose={() => { setShowTopUp(false); }} />
    </Modal>

    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  contentWrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 120 },

  headerCard: {
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 18,
    marginHorizontal: -14,
    marginTop: -10,
    paddingTop: 20,
    backgroundColor: '#DFF0D8',
  },
  title: { fontSize: 16, color: C.text, fontWeight: '500' },
  subtitle: { fontSize: 13, color: C.sub, marginTop: 3 },
  amount: { fontSize: 24, lineHeight: 30, fontWeight: '400', color: C.text, marginTop: 8 },
  amountHint: { color: C.sub, fontSize: 13, marginTop: 4 },
  miniStatRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  miniStatCard: {
    flex: 1,
    backgroundColor: C.accentSoft,
    borderWidth: 1,
    borderColor: '#DCE7D6',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  miniStatLabel: { color: C.sub, fontSize: 12, fontWeight: '600' },
  miniStatValue: { color: C.text, fontSize: 20, marginTop: 3, fontWeight: '800' },
  periodRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  periodChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: C.softGray,
    borderWidth: 1,
    borderColor: C.line,
  },
  periodChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  periodChipText: { color: C.sub, fontSize: 13, fontWeight: '700' },
  periodChipTextActive: { color: '#FFFFFF' },

  banner: {
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DDE5D7',
  },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  actionBtnPrimary: { backgroundColor: C.accent },
  actionBtnGhost: { backgroundColor: '#F7F8F7' },
  actionBtnPrimaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  actionBtnGhostText: { color: C.accent, fontSize: 17, fontWeight: '800' },

  sectionHead: {
    marginTop: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.text,
  },
  reconcile: { fontSize: 15, color: C.accent, fontWeight: '800' },

  emptyState: { paddingHorizontal: 20, paddingVertical: 30, alignItems: 'center' },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 15, color: C.sub },

  txCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.card,
    marginBottom: 10,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6EBE5',
  },
  txAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  txAvatarPositive: { backgroundColor: C.accentSoft },
  txAvatarNegative: { backgroundColor: C.softGray },
  txAvatarText: { color: C.accent, fontSize: 24, fontWeight: '800' },
  txInfo: { flex: 1 },
  txName: { fontSize: 15, fontWeight: '500', color: C.text, lineHeight: 22 },
  txService: { fontSize: 22, lineHeight: 26, color: C.text, marginTop: 6, fontWeight: '800' },
  txRight: { alignItems: 'flex-end', marginLeft: 10 },
  txStatus: { color: C.accent, fontSize: 15, fontWeight: '800' },
  txDate: { color: C.sub, fontSize: 13, marginTop: 6 },
});
