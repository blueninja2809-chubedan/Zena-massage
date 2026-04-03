import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useIAP, type ProductSubscription, type Purchase } from 'react-native-iap';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLanguage } from '@/contexts/LanguageContext';
import { AppColors } from '@/constants/appColors';
import { useUser } from '@/contexts/UserContext';

type VipPlan = {
  id: 'vip_12m' | 'vip_6m' | 'vip_1m';
  labelVi: string;
  labelEn: string;
  durationMonths: number;
  priceVnd: number;
  androidSku: string;
  iosSku: string;
};

const USD_RATE = 27000;

const PLANS: VipPlan[] = [
  {
    id: 'vip_12m',
    labelVi: '1 Năm',
    labelEn: '1 Year',
    durationMonths: 12,
    priceVnd: 1499000,
    androidSku: 'vip_12m',
    iosSku: 'vip_12m',
  },
  {
    id: 'vip_6m',
    labelVi: '6 Tháng',
    labelEn: '6 Months',
    durationMonths: 6,
    priceVnd: 999000,
    androidSku: 'vip_6m',
    iosSku: 'vip_6m',
  },
  {
    id: 'vip_1m',
    labelVi: '1 Tháng',
    labelEn: '1 Month',
    durationMonths: 1,
    priceVnd: 199000,
    androidSku: 'vip_1m',
    iosSku: 'vip_1m',
  },
];

const C = {
  bg: '#0E0D10',
  card: '#FFFFFF',
  text: '#111111',
  sub: '#72757D',
  lightBorder: '#E2E8F0',
  goldA: '#FDEAB0',
  goldB: '#E8B16C',
  primary: AppColors.primaryDark,
  primarySoft: AppColors.primarySoft,
  success: AppColors.accent,
};

const COPY = {
  vi: {
    title: 'Hội viên VIP',
    heroTitle: 'Quyền lợi đặc quyền dành cho hội viên VIP Zena',
    vipCardTitle: 'Hội viên VIP',
    benefits: [
      'Thấy tuổi của kỹ thuật viên',
      'Nhiều kỹ thuật viên hơn',
      'Chặn quảng cáo',
    ],
    pickPlan: 'Chọn gói đăng ký',
    loginRequiredTitle: 'Yêu cầu đăng nhập',
    loginRequiredMessage: 'Vui lòng đăng nhập trước khi nâng cấp VIP.',
    paymentSuccessTitle: 'Thanh toán thành công',
    paymentSuccessMessage: (provider: string) => `Đã kích hoạt VIP qua ${provider}.`,
    paymentErrorTitle: 'Lỗi',
    paymentErrorMessage: 'Không thể xử lý thanh toán. Vui lòng thử lại.',
    productUnavailable: 'Gói đăng ký chưa sẵn sàng trên App Store. Vui lòng kiểm tra Product ID.',
    payWith: (_provider: string) => 'Thanh toán ',
    autoRenewNote: 'Đăng ký sẽ được gia hạn tự động khi đến hạn. Bạn có thể hủy trong phần quản lý thuê bao của hệ điều hành.',
    activeUntil: (date: string) => `Bạn đang là hội viên VIP${date ? ` đến ${date}` : ''}.`,
  },
  en: {
    title: 'VIP Membership',
    heroTitle: 'Exclusive benefits for Zena VIP members',
    vipCardTitle: 'VIP Member',
    benefits: [
      'View therapist age',
      'See more therapists',
      'Block ads',
    ],
    pickPlan: 'Choose a subscription plan',
    loginRequiredTitle: 'Sign-in required',
    loginRequiredMessage: 'Please sign in before upgrading to VIP.',
    paymentSuccessTitle: 'Payment successful',
    paymentSuccessMessage: (provider: string) => `VIP has been activated via ${provider}.`,
    paymentErrorTitle: 'Error',
    paymentErrorMessage: 'Unable to process payment. Please try again.',
    productUnavailable: 'Subscription is not available on App Store yet. Please check Product IDs.',
    payWith: (provider: string) => `Pay with ${provider}`,
    autoRenewNote: 'Your subscription will auto-renew unless canceled in your system subscription settings.',
    activeUntil: (date: string) => `You are a VIP member${date ? ` until ${date}` : ''}.`,
  },
};

export default function VipMembershipScreen({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const { language } = useLanguage();
  const { user, setUser } = useUser();

  const [selectedPlanId, setSelectedPlanId] = useState<VipPlan['id']>('vip_1m');
  const [isPaying, setIsPaying] = useState(false);
  const [storeSyncing, setStoreSyncing] = useState(false);

  const useEnglish = language === 'en';
  const text = useEnglish ? COPY.en : COPY.vi;
  const currentPaymentProvider = Platform.OS === 'android' ? 'Google Play' : 'App Store';
  const isNativeStore = Platform.OS === 'ios' || Platform.OS === 'android';

  const { connected, subscriptions, fetchProducts, requestPurchase, finishTransaction } = useIAP({
    onPurchaseSuccess: async (purchase: Purchase) => {
      if (!user) return;
      const purchasedPlan = getPlanByStoreSku(purchase.productId);
      if (!purchasedPlan) return;

      const expiresAt = addMonths(new Date(), purchasedPlan.durationMonths).toISOString();
      await setUser({
        ...user,
        isVipMember: true,
        vipPlanId: purchasedPlan.id,
        vipExpiresAt: expiresAt,
      });
      await finishTransaction({ purchase, isConsumable: false });
      setIsPaying(false);
      Alert.alert(text.paymentSuccessTitle, text.paymentSuccessMessage(currentPaymentProvider));
    },
    onPurchaseError: (error) => {
      console.warn('[VIP] purchase error:', error);
      setIsPaying(false);
      Alert.alert(text.paymentErrorTitle, error.message || text.paymentErrorMessage);
    },
  });

  const selectedPlan = useMemo(
    () => PLANS.find((plan) => plan.id === selectedPlanId) || PLANS[0],
    [selectedPlanId],
  );
  const storeProductsBySku = useMemo(() => {
    const map = new Map<string, ProductSubscription>();
    subscriptions.forEach((product) => map.set(product.id, product));
    return map;
  }, [subscriptions]);

  useEffect(() => {
    if (!isNativeStore || !connected) return;
    const skus = Platform.OS === 'ios' ? PLANS.map((p) => p.iosSku) : PLANS.map((p) => p.androidSku);
    setStoreSyncing(true);
    fetchProducts({ skus, type: 'subs' })
      .catch((e) => console.warn('[VIP] fetchProducts failed:', e))
      .finally(() => setStoreSyncing(false));
  }, [connected, fetchProducts, isNativeStore]);

  const handleBack = () => {
    if (onClose) {
      onClose();
      return;
    }
    router.back();
  };

  const handlePurchase = async () => {
    if (!user) {
      Alert.alert(text.loginRequiredTitle, text.loginRequiredMessage);
      return;
    }

    try {
      setIsPaying(true);
      if (!isNativeStore) {
        throw new Error(text.paymentErrorMessage);
      }

      const selectedStoreSku = Platform.OS === 'ios' ? selectedPlan.iosSku : selectedPlan.androidSku;
      const found = storeProductsBySku.get(selectedStoreSku);
      if (!found) {
        throw new Error(text.productUnavailable);
      }

      await requestPurchase({
        type: 'subs',
        request: {
          apple: { sku: selectedPlan.iosSku },
          google: { skus: [selectedPlan.androidSku] },
        },
      });
    } catch (err) {
      setIsPaying(false);
      const msg = err instanceof Error ? err.message : text.paymentErrorMessage;
      Alert.alert(text.paymentErrorTitle, msg);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={s.header}>
        <TouchableOpacity onPress={handleBack} style={s.backBtn} activeOpacity={0.8}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{text.title}</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        <Text style={s.heroTitle}>{text.heroTitle}</Text>

        <View style={s.goldCard}>
          <Text style={s.goldCardTitle}>{text.vipCardTitle}</Text>
        </View>

        <View style={s.whiteCard}>
          {text.benefits.map((benefit) => (
            <BenefitItem key={benefit} text={benefit} />
          ))}

          <Text style={s.sectionTitle}>{text.pickPlan}</Text>
          <View style={s.planRow}>
            {PLANS.map((plan) => {
              const isActive = selectedPlanId === plan.id;
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[s.planCard, isActive && s.planCardActive]}
                  onPress={() => setSelectedPlanId(plan.id)}
                  activeOpacity={0.85}
                >
                  <Text style={[s.planLabel, isActive && s.planLabelActive]}>
                    {useEnglish ? plan.labelEn : plan.labelVi}
                  </Text>
                  <Text style={[s.planPrice, isActive && s.planPriceActive]}>
                    {formatPlanPrice(plan, useEnglish, storeProductsBySku)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[s.payBtn, isPaying && s.payBtnDisabled]}
            onPress={handlePurchase}
            activeOpacity={0.9}
            disabled={isPaying}
          >
            {isPaying || storeSyncing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={s.payBtnText}>{text.payWith(currentPaymentProvider)}</Text>
            )}
          </TouchableOpacity>

          <Text style={s.noteText}>{text.autoRenewNote}</Text>

          {user?.isVipMember ? (
            <Text style={s.vipActiveText}>
              {text.activeUntil(user.vipExpiresAt ? formatDate(user.vipExpiresAt, useEnglish) : '')}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BenefitItem({ text }: { text: string }) {
  return (
    <View style={s.benefitRow}>
      <Text style={s.benefitIcon}>🪙</Text>
      <Text style={s.benefitText}>{text}</Text>
    </View>
  );
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function formatDate(value: string, useEnglish: boolean) {
  const d = new Date(value);
  if (useEnglish) {
    return new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }).format(d);
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function getPlanByStoreSku(productId: string) {
  return PLANS.find((plan) => plan.iosSku === productId || plan.androidSku === productId) ?? null;
}

function formatPlanPrice(plan: VipPlan, useEnglish: boolean, storeProductsBySku: Map<string, ProductSubscription>) {
  const sku = Platform.OS === 'ios' ? plan.iosSku : plan.androidSku;
  const storeProduct = storeProductsBySku.get(sku);
  if (storeProduct?.displayPrice) return storeProduct.displayPrice;

  if (useEnglish) {
    const usd = plan.priceVnd / USD_RATE;
    return `$${usd.toFixed(2)}`;
  }
  return `${plan.priceVnd.toLocaleString('vi-VN')}đ`;
}


const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  headerSpacer: { width: 36 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 36 },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 30,
    textAlign: 'center',
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 14,
  },
  goldCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: C.goldA,
  },
  goldCardTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  goldCardSub: { color: '#5F4A2F', fontSize: 13, marginTop: 4 },
  whiteCard: {
    marginTop: 12,
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.lightBorder,
    padding: 14,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F2E7CE',
    backgroundColor: '#FFFDF6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 10,
  },
  benefitIcon: { fontSize: 14 },
  benefitText: { color: '#3D3528', fontSize: 14, fontWeight: '500' },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 10,
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
  },
  planRow: { flexDirection: 'row', gap: 10 },
  planCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.lightBorder,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  planCardActive: {
    borderColor: C.primary,
    backgroundColor: C.primarySoft,
  },
  planLabel: { color: C.text, fontSize: 13, fontWeight: '500' },
  planLabelActive: { color: C.primary, fontWeight: '700' },
  planPrice: {
    marginTop: 8,
    color: C.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  planPriceActive: { color: C.primary },
  payBtn: {
    marginTop: 14,
    backgroundColor: C.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
  },
  payBtnDisabled: { opacity: 0.8 },
  payBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  noteText: { marginTop: 10, color: C.sub, fontSize: 12, lineHeight: 18 },
  vipActiveText: { marginTop: 8, color: C.success, fontSize: 13, fontWeight: '600' },
});
