import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const P = {
  primary: '#C62828',
  primaryLight: '#E53935',
  card: '#FFFFFF',
  text: '#1A1A1A',
  sub: '#64748B',
  line: '#E2E8F0',
  bg: '#FFF5F5',
};

export default function BookingSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    serviceName?: string;
    date?: string;
    time?: string;
    price?: string;
    zalo?: string;
    payment?: string;
  }>();

  const serviceName = params.serviceName ? decodeURIComponent(String(params.serviceName)) : '';
  const date = params.date ? decodeURIComponent(String(params.date)) : '';
  const time = params.time ? decodeURIComponent(String(params.time)) : '';
  const price = params.price ? decodeURIComponent(String(params.price)) : '';
  const zalo = params.zalo ? decodeURIComponent(String(params.zalo)) : '';
  const payment = params.payment ? decodeURIComponent(String(params.payment)) : '';

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0D9488', '#2DD4BF', '#A7F3D0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.gradient}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={s.safe} edges={['top']}>
          <View style={s.hero}>
            <View style={s.iconCircle}>
              <Feather name="check" size={40} color="#0F766E" />
            </View>
            <Text style={s.title}>Đặt lịch thành công!</Text>
            <Text style={s.subtitle}>Cảm ơn bạn đã tin tưởng Glow. Chúng tôi sẽ liên hệ qua Zalo để xác nhận.</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
        <View style={s.card}>
          <Text style={s.cardTitle}>Chi tiết đặt lịch</Text>
          <Row label="Dịch vụ" value={serviceName} icon="heart" />
          <View style={s.divider} />
          <Row label="Thời gian" value={`${date} • ${time}`} icon="calendar" />
          <View style={s.divider} />
          <Row label="Liên hệ Zalo" value={zalo} icon="phone" />
          <View style={s.divider} />
          <Row label="Thanh toán" value={payment} icon="credit-card" />
          <View style={s.divider} />
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Tổng thanh toán</Text>
            <Text style={s.priceValue}>{price}</Text>
          </View>
        </View>

        <TouchableOpacity style={s.btn} onPress={() => router.replace('/massage-home')} activeOpacity={0.85}>
          <Text style={s.btnText}>Hoàn tất</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon: keyof typeof Feather.glyphMap }) {
  return (
    <View style={s.row}>
      <View style={s.rowIcon}>
        <Feather name={icon} size={18} color={P.primary} />
      </View>
      <View style={s.rowText}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: P.bg },
  gradient: { paddingBottom: 28 },
  safe: {},
  hero: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 8 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.92)', textAlign: 'center', lineHeight: 22 },
  body: { flex: 1, marginTop: -18 },
  bodyContent: { paddingHorizontal: 20, paddingBottom: 32 },
  card: {
    backgroundColor: P.card,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: P.text, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 12, color: P.sub, marginBottom: 4 },
  rowValue: { fontSize: 15, fontWeight: '600', color: P.text, lineHeight: 22 },
  divider: { height: 1, backgroundColor: P.line, marginVertical: 14 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  priceLabel: { fontSize: 15, color: P.sub, fontWeight: '600' },
  priceValue: { fontSize: 22, fontWeight: '800', color: P.primary },
  btn: {
    marginTop: 24,
    backgroundColor: P.primary,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
