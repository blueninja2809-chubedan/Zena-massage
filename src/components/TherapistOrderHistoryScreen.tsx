import { AppColors } from '@/constants/appColors';
import Feather from '@expo/vector-icons/Feather';
import type { BookingStatus, SharedBooking } from '@/contexts/BookingsContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useUser } from '@/contexts/UserContext';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const FILTERS: { key: BookingStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Đang chờ' },
  { key: 'in-progress', label: 'Đang xử lý' },
  { key: 'completed', label: 'Đã hoàn thành' },
  { key: 'cancelled', label: 'Đã hủy' },
];

function getStatusMeta(status: BookingStatus) {
  if (status === 'completed') return { label: 'Đã hoàn thành', color: '#0D8F52', bg: '#E8F8EF' };
  if (status === 'in-progress') return { label: 'Đang xử lý', color: '#9A5B00', bg: '#FFF4E6' };
  if (status === 'confirmed') return { label: 'Đã nhận đơn', color: '#1D5CA5', bg: '#E9F2FF' };
  if (status === 'cancelled') return { label: 'Đã hủy', color: '#B71C1C', bg: '#FEECEC' };
  return { label: 'Đang chờ', color: '#6B7280', bg: '#F3F4F6' };
}

function Timeline({ status }: { status: BookingStatus }) {
  const steps = ['Đã nhận đơn', 'Đang xử lý', 'Hoàn thành'];
  const index = status === 'completed' ? 2 : status === 'in-progress' ? 1 : 0;

  if (status === 'cancelled') {
    return <Text style={styles.cancelText}>Đơn đã hủy. Không áp dụng tiến trình xử lý.</Text>;
  }

  return (
    <View style={styles.timelineWrap}>
      {steps.map((step, i) => {
        const active = i <= index;
        return (
          <View key={step} style={styles.timelineRow}>
            <View style={[styles.timelineDot, active && styles.timelineDotActive]} />
            <Text style={[styles.timelineText, active && styles.timelineTextActive]}>{step}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function TherapistOrderHistoryScreen({ onClose }: { onClose: () => void }) {
  const { user } = useUser();
  const { getTherapistBookings, updateStatus } = useBookings();
  const [filter, setFilter] = useState<BookingStatus | 'all'>('all');
  const [selected, setSelected] = useState<SharedBooking | null>(null);
  const rows = useMemo(() => {
    const all = getTherapistBookings(user?.authUid ?? '').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter === 'all' ? all : all.filter((item) => item.status === filter);
  }, [user?.authUid, filter, getTherapistBookings]);

  const handleSetProcessing = (item: SharedBooking) => {
    updateStatus(item.id, 'in-progress', {
      userId: item.customerUserId,
      therapistName: item.therapistName,
      service: item.service,
    });
  };

  const handleSetCompleted = (item: SharedBooking) => {
    updateStatus(item.id, 'completed', {
      userId: item.customerUserId,
      therapistName: item.therapistName,
      service: item.service,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.8}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Lịch sử đơn hàng</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          bounces
          alwaysBounceHorizontal={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
          showsHorizontalScrollIndicator={false}
        >
          {FILTERS.map((item) => {
            const active = item.key === filter;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(item.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]} numberOfLines={1}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={rows.length === 0 ? styles.listContentEmpty : styles.listContent}
        renderItem={({ item }) => {
          const meta = getStatusMeta(item.status);
          return (
            <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.85}>
              <View style={styles.cardTop}>
                <Text style={styles.service}>{item.service}</Text>
                <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              <Text style={styles.sub}>Khách: {item.customerName}</Text>
              <Text style={styles.sub}>{item.date} • {item.time}</Text>
              <Text style={styles.sub} numberOfLines={1}>Địa chỉ: {item.address}</Text>
              <Text style={styles.price}>{item.price.toLocaleString('vi-VN')} đ</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Feather name="package" size={40} color="#6B5F52" />
            </View>
            <Text style={styles.emptyTitle}>Chưa có đơn hàng nào</Text>
            <Text style={styles.emptySubtitle}>
              Khi bạn nhận đơn, lịch sử sẽ hiển thị tại đây. Dùng ô lọc phía trên để tìm theo trạng
              thái.
            </Text>
          </View>
        }
      />

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelected(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {selected ? (
              <>
                <Text style={styles.modalTitle}>Chi tiết đơn hàng</Text>
                <Text style={styles.modalLine}>Dịch vụ: {selected.service}</Text>
                <Text style={styles.modalLine}>Khách hàng: {selected.customerName}</Text>
                <Text style={styles.modalLine}>SĐT: {selected.customerPhone}</Text>
                <Text style={styles.modalLine}>Thời gian: {selected.date} • {selected.time}</Text>
                <Text style={styles.modalLine}>Địa chỉ: {selected.address}</Text>
                <Text style={styles.modalPrice}>Giá: {selected.price.toLocaleString('vi-VN')} đ</Text>

                <Timeline status={selected.status} />

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, selected.status !== 'confirmed' && styles.actionBtnDisabled]}
                    disabled={selected.status !== 'confirmed'}
                    onPress={() => handleSetProcessing(selected)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.actionBtnText}>Chuyển đang xử lý</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnPrimary, selected.status === 'completed' && styles.actionBtnDisabled]}
                    disabled={selected.status === 'completed'}
                    onPress={() => handleSetCompleted(selected)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>Đánh dấu hoàn thành</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    backgroundColor: AppColors.bg,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 24, color: AppColors.text },
  spacer: { width: 40 },
  title: { fontSize: 17, fontWeight: '800', color: AppColors.text, letterSpacing: -0.2 },
  filterBar: {
    backgroundColor: AppColors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.border,
    zIndex: 1,
  },
  /** Cố định chiều cao thanh lọc — tránh ScrollView ngang bị kéo giãn theo cả màn. */
  filterScroll: {
    flexGrow: 0,
    maxHeight: 50,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    paddingRight: 20,
  },
  filterChip: {
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.bg,
    alignSelf: 'center',
  },
  filterChipActive: { backgroundColor: AppColors.primarySoft2, borderColor: AppColors.primary },
  filterText: { color: AppColors.textMuted, fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: AppColors.primaryDark, fontWeight: '700' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 32, flexGrow: 0 },
  listContentEmpty: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 32, paddingBottom: 40 },
  card: {
    backgroundColor: AppColors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  service: { fontSize: 16, fontWeight: '700', color: AppColors.text, flex: 1, paddingRight: 8 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  sub: { color: AppColors.textMuted, fontSize: 13, marginTop: 2 },
  price: { color: AppColors.text, fontSize: 17, fontWeight: '800', marginTop: 8 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    minHeight: 240,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: AppColors.primarySoft2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: AppColors.text, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: AppColors.textMuted, textAlign: 'center', lineHeight: 21, maxWidth: 300 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: AppColors.white, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 28 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text, marginBottom: 10 },
  modalLine: { color: AppColors.text, fontSize: 14, marginBottom: 4 },
  modalPrice: { color: AppColors.primaryDark, fontSize: 16, fontWeight: '800', marginTop: 6, marginBottom: 10 },
  timelineWrap: { marginTop: 8, marginBottom: 12, gap: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D1D5DB' },
  timelineDotActive: { backgroundColor: AppColors.primaryDark },
  timelineText: { color: AppColors.textMuted, fontSize: 13 },
  timelineTextActive: { color: AppColors.text, fontWeight: '600' },
  cancelText: { color: AppColors.danger, fontSize: 13, marginVertical: 10 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionBtn: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: AppColors.border, paddingVertical: 11, alignItems: 'center', backgroundColor: AppColors.white },
  actionBtnPrimary: { backgroundColor: AppColors.primaryDark, borderColor: AppColors.primaryDark },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: { color: AppColors.text, fontSize: 13, fontWeight: '700' },
  actionBtnTextPrimary: { color: '#fff' },
});
