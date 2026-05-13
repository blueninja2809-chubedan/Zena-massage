import { AppColors } from '@/constants/appColors';
import type { SharedBooking } from '@/contexts/BookingsContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useUser } from '@/contexts/UserContext';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TierKey = 'bronze' | 'silver' | 'gold' | 'platinum';

const tierConfig: Record<TierKey, { label: string; icon: string; color: string; bg: string }> = {
  bronze: { label: 'Hạng Đồng', icon: '🥉', color: '#9C5A2E', bg: '#FFF1E8' },
  silver: { label: 'Hạng Bạc', icon: '🥈', color: '#5C6770', bg: '#F1F5F9' },
  gold: { label: 'Hạng Vàng', icon: '🥇', color: '#A66C00', bg: '#FFF7DD' },
  platinum: { label: 'Hạng Bạch kim', icon: '💎', color: '#2E6078', bg: '#EAF8FF' },
};

function getRankByCompletedOrders(total: number): TierKey {
  if (total >= 51) return 'platinum';
  if (total >= 41) return 'gold';
  if (total >= 31) return 'silver';
  return 'bronze';
}

export default function TherapistRankScreen({ onClose }: { onClose: () => void }) {
  const { user } = useUser();
  const { getTherapistBookings } = useBookings();
  const completedCount = useMemo(() => {
    const rows: SharedBooking[] = getTherapistBookings(user?.authUid ?? '');
    return rows.filter((item) => item.status === 'completed').length;
  }, [user?.authUid, getTherapistBookings]);

  const currentTier = getRankByCompletedOrders(completedCount);
  const current = tierConfig[currentTier];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.8}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Phân hạng kỹ thuật viên</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.currentCard, { backgroundColor: current.bg }]}>
          <Text style={styles.currentTitle}>Hạng hiện tại</Text>
          <Text style={styles.currentIcon}>{current.icon}</Text>
          <Text style={[styles.currentLabel, { color: current.color }]}>{current.label}</Text>
          <Text style={styles.currentDesc}>Đơn đã hoàn thành: {completedCount}</Text>
        </View>

        <Text style={styles.ruleTitle}>Quy tắc xếp hạng</Text>

        <View style={[styles.ruleItem, { backgroundColor: tierConfig.bronze.bg }]}>
          <Text style={styles.ruleIcon}>{tierConfig.bronze.icon}</Text>
          <Text style={styles.ruleText}>Hạng Đồng: từ 0 đến 30 đơn hoàn thành</Text>
        </View>
        <View style={[styles.ruleItem, { backgroundColor: tierConfig.silver.bg }]}>
          <Text style={styles.ruleIcon}>{tierConfig.silver.icon}</Text>
          <Text style={styles.ruleText}>Hạng Bạc: từ 31 đến 40 đơn hoàn thành</Text>
        </View>
        <View style={[styles.ruleItem, { backgroundColor: tierConfig.gold.bg }]}>
          <Text style={styles.ruleIcon}>{tierConfig.gold.icon}</Text>
          <Text style={styles.ruleText}>Hạng Vàng: từ 41 đến 50 đơn hoàn thành</Text>
        </View>
        <View style={[styles.ruleItem, { backgroundColor: tierConfig.platinum.bg }]}>
          <Text style={styles.ruleIcon}>{tierConfig.platinum.icon}</Text>
          <Text style={styles.ruleText}>Hạng Bạch kim: từ 51 đơn hoàn thành trở lên</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  backText: { fontSize: 24, color: AppColors.text },
  spacer: { width: 36 },
  title: { fontSize: 18, fontWeight: '800', color: AppColors.text },
  content: { padding: 16, paddingBottom: 30 },
  currentCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 18,
    alignItems: 'center',
    marginBottom: 18,
  },
  currentTitle: { color: AppColors.textMuted, fontSize: 14, marginBottom: 8 },
  currentIcon: { fontSize: 34, marginBottom: 8 },
  currentLabel: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  currentDesc: { color: AppColors.text, fontSize: 14, fontWeight: '600' },
  ruleTitle: { fontSize: 17, fontWeight: '800', color: AppColors.text, marginBottom: 12 },
  ruleItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  ruleIcon: { fontSize: 24 },
  ruleText: { flex: 1, fontSize: 15, color: AppColors.text, fontWeight: '600' },
});
