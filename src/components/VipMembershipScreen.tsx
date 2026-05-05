import Feather from '@expo/vector-icons/Feather';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  fetchProducts as fetchSubscriptionProductsFromStore,
  getAvailablePurchases,
  useIAP,
  type ActiveSubscription,
  type ProductSubscription,
  type Purchase,
} from 'react-native-iap';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLanguage } from '@/contexts/LanguageContext';
import { AppColors } from '@/constants/appColors';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/constants/legalUrls';
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
    productUnavailableAndroid: 'Gói đăng ký chưa sẵn sàng trên Google Play. Vui lòng kiểm tra Product ID và trạng thái bản kê khai.',
    productUnavailableIosSimulator:
      'Gói đăng ký không chạy trên simulator. Hãy dùng iPhone thật và build/TestFlight.',
    productUnavailableIosStore:
      'App Store chưa trả về gói đăng ký cho bản build này. Thường do: (1) Chưa ký đủ hợp đồng Paid Apps trên App Store Connect, (2) Bundle ID build khác app đã gắn subscription, (3) Cần tài khoản Sandbox khi test ngoài App Store chính thức, (4) Đợi vài giờ sau khi duyệt subscription. Bạn có thể bấm thử lại sau khi kiểm tra App Store Connect.',
    payButtonAndroid: 'Thanh toán qua Google Play',
    payButtonIos: 'Thanh toán qua App Store',
    autoRenewNote: 'Đăng ký sẽ được gia hạn tự động khi đến hạn. Bạn có thể hủy trong phần quản lý thuê bao của hệ điều hành.',
    activeUntil: (date: string) => `Bạn đang là hội viên VIP${date ? ` đến ${date}` : ''}.`,
    restorePurchases: 'Khôi phục giao dịch',
    restoreSuccessTitle: 'Đã khôi phục',
    restoreSuccessMessage: 'Hội viên VIP đã được khôi phục trên thiết bị này.',
    restoreNoneTitle: 'Không có gói đăng ký',
    restoreNoneMessage:
      'Không tìm thấy đăng ký VIP hoạt động cho tài khoản App Store / Google Play trên thiết bị này.',
    manageSubscriptions: 'Quản lý đăng ký',
    termsOfUse: 'Điều khoản sử dụng',
    privacyPolicy: 'Chính sách riêng tư',
    subscriptionDisclosureHeading: 'Thông tin đăng ký (tự động gia hạn)',
    subscriptionOfferingTitle: 'Zena VIP',
    subscriptionMetaLine: (periodLabel: string, price: string) =>
      `Thời hạn: ${periodLabel} · Giá: ${price}`,
    subscriptionDetailsHeading: 'Thông tin gói đăng ký trong app',
    subscriptionPlanLine: (periodLabel: string, price: string, storeName: string) =>
      `Gói ${periodLabel}: Truy cập Zena VIP · Giá theo ${storeName} (${price})`,
    subscriptionBulletsAndroid: [
      'Đây là gói đăng ký tự động gia hạn.',
      'Thanh toán được tính qua Google Play Billing khi bạn xác nhận.',
      'Gói sẽ tự động gia hạn trừ khi huỷ ít nhất 24 giờ trước kỳ tiếp theo.',
      'Bạn có thể quản lý hoặc huỷ đăng ký trong phần Đăng ký trên Google Play.',
    ],
    subscriptionBulletsIOS: [
      'Đây là gói đăng ký tự động gia hạn.',
      'Thanh toán qua App Store; bạn có thể dùng Apple Pay, thẻ hoặc phương thức đã lưu trên Apple ID.',
      'Gói sẽ tự động gia hạn trừ khi huỷ ít nhất 24 giờ trước kỳ tiếp theo.',
      'Bạn có thể quản lý hoặc huỷ đăng ký trong Cài đặt tài khoản App Store.',
    ],
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
    productUnavailableAndroid: 'Subscription is not available on Google Play yet. Please check Product IDs and Play Console setup.',
    productUnavailableIosSimulator:
      'Subscriptions do not work on the iOS simulator. Use a real device or TestFlight.',
    productUnavailableIosStore:
      'The App Store did not return subscription products for this build. Check Paid Apps agreements in App Store Connect, matching bundle ID, Sandbox account for testing, or wait after subscription approval.',
    payButtonAndroid: 'Pay with Google Play',
    payButtonIos: 'Pay with App Store',
    autoRenewNote: 'Your subscription will auto-renew unless canceled in your system subscription settings.',
    activeUntil: (date: string) => `You are a VIP member${date ? ` until ${date}` : ''}.`,
    restorePurchases: 'Restore purchases',
    restoreSuccessTitle: 'Restored',
    restoreSuccessMessage: 'Your VIP membership was restored on this device.',
    restoreNoneTitle: 'No active subscription',
    restoreNoneMessage:
      'No active VIP subscription was found for this App Store / Google Play account on this device.',
    manageSubscriptions: 'Manage subscription',
    termsOfUse: 'Terms of Use',
    privacyPolicy: 'Privacy Policy',
    subscriptionDisclosureHeading: 'Subscription info (auto-renewing)',
    subscriptionOfferingTitle: 'Zena VIP',
    subscriptionMetaLine: (periodLabel: string, price: string) =>
      `Term: ${periodLabel} · Price: ${price}`,
    subscriptionDetailsHeading: 'In-app subscription details',
    subscriptionPlanLine: (periodLabel: string, price: string, storeName: string) =>
      `${periodLabel} plan: Zena VIP access · ${storeName} price (${price})`,
    subscriptionBulletsAndroid: [
      'This is an auto-renewing subscription.',
      'Payment is processed with Google Play Billing when you confirm.',
      'Subscription renews automatically unless canceled at least 24 hours before renewal.',
      'You can manage or cancel in Google Play subscriptions.',
    ],
    subscriptionBulletsIOS: [
      'This is an auto-renewing subscription.',
      'Payment is processed through the App Store; you can use Apple Pay, a card, or your Apple ID payment methods.',
      'Subscription renews automatically unless canceled at least 24 hours before renewal.',
      'You can manage or cancel in App Store account settings.',
    ],
  },
};

const IOS_MANAGE_SUBS_URL = 'https://apps.apple.com/account/subscriptions';

export default function VipMembershipScreen({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const { language } = useLanguage();
  const { user, setUser } = useUser();

  const [selectedPlanId, setSelectedPlanId] = useState<VipPlan['id']>('vip_1m');
  const [isPaying, setIsPaying] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [storeSyncing, setStoreSyncing] = useState(false);

  const useEnglish = language === 'en';
  const baseCopy = useEnglish ? COPY.en : COPY.vi;
  const isNativeStore = Platform.OS === 'ios' || Platform.OS === 'android';
  const isAndroid = Platform.OS === 'android';
  const isIosSimulator = Platform.OS === 'ios' && !Device.isDevice;
  const priceStoreName = isAndroid ? 'Google Play' : 'App Store';
  const paymentSuccessProvider = isAndroid ? 'Google Play' : 'App Store';

  const text = useMemo(() => {
    const productUnavailableIos =
      isIosSimulator && Platform.OS === 'ios'
        ? baseCopy.productUnavailableIosSimulator
        : Platform.OS === 'ios'
          ? baseCopy.productUnavailableIosStore
          : baseCopy.productUnavailableAndroid;
    return {
      ...baseCopy,
      subscriptionBullets: isAndroid ? baseCopy.subscriptionBulletsAndroid : baseCopy.subscriptionBulletsIOS,
      payButtonLabel: isAndroid ? baseCopy.payButtonAndroid : baseCopy.payButtonIos,
      productUnavailable: isAndroid ? baseCopy.productUnavailableAndroid : productUnavailableIos,
    };
  }, [baseCopy, isAndroid, isIosSimulator]);

  const {
    connected,
    subscriptions,
    fetchProducts,
    requestPurchase,
    finishTransaction,
    getActiveSubscriptions,
    reconnect,
  } = useIAP({
    onError: (err) => {
      console.warn('[VIP] IAP error:', err);
    },
    onPurchaseSuccess: async (purchase: Purchase) => {
      if (!user) return;
      const purchasedPlan = getPlanByStoreSku(purchase.productId);
      if (!purchasedPlan) {
        console.warn('[VIP] purchase for unknown productId; finishing transaction to avoid stuck state:', purchase.productId);
        try {
          await finishTransaction({ purchase, isConsumable: false });
        } catch (e) {
          console.warn('[VIP] finishTransaction after unknown product failed:', e);
        }
        setIsPaying(false);
        return;
      }

      const expiresAt = addMonths(new Date(), purchasedPlan.durationMonths).toISOString();
      await setUser({
        ...user,
        isVipMember: true,
        vipPlanId: purchasedPlan.id,
        vipExpiresAt: expiresAt,
      });
      await finishTransaction({ purchase, isConsumable: false });
      setIsPaying(false);
      Alert.alert(text.paymentSuccessTitle, text.paymentSuccessMessage(paymentSuccessProvider));
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

  useEffect(() => {
    if (!__DEV__ || !isNativeStore) return;
    if (!TERMS_OF_USE_URL || !PRIVACY_POLICY_URL) {
      console.warn(
        '[VIP] Set EXPO_PUBLIC_TERMS_URL and EXPO_PUBLIC_PRIVACY_POLICY_URL for App Store Guideline 3.1.2.',
      );
    }
  }, [isNativeStore]);

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
      if (isIosSimulator) {
        throw new Error(text.productUnavailable);
      }

      const selectedStoreSku = Platform.OS === 'ios' ? selectedPlan.iosSku : selectedPlan.androidSku;
      const skus = Platform.OS === 'ios' ? PLANS.map((p) => p.iosSku) : PLANS.map((p) => p.androidSku);

      let storeOk = connected;
      if (!storeOk) {
        storeOk = await reconnect();
      }
      if (!storeOk) {
        throw new Error(text.paymentErrorMessage);
      }

      let foundInStore: ProductSubscription | undefined = storeProductsBySku.get(selectedStoreSku);
      if (!foundInStore) {
        try {
          const fresh = await fetchSubscriptionProductsFromStore({ skus, type: 'subs' });
          if (Array.isArray(fresh)) {
            const match = fresh.find((p) => p.id === selectedStoreSku);
            if (match?.type === 'subs') {
              foundInStore = match;
            }
          }
        } catch (e) {
          console.warn('[VIP] fetchSubscriptionProductsFromStore before purchase failed:', e);
        }
      }
      if (!foundInStore) {
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

  const openLegalUrl = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('unsupported');
      await Linking.openURL(url);
    } catch {
      Alert.alert(text.paymentErrorTitle, text.paymentErrorMessage);
    }
  };

  const handleRestore = async () => {
    if (!user) {
      Alert.alert(text.loginRequiredTitle, text.loginRequiredMessage);
      return;
    }
    if (!isNativeStore || !connected) {
      Alert.alert(text.paymentErrorTitle, text.paymentErrorMessage);
      return;
    }
    try {
      setIsRestoring(true);
      // Do not use useIAP().restorePurchases() on iOS: it always calls syncIOS() first (App Store
      // sync sheet). If the user dismisses/cancels, Nitro logs a console error and LogBox shows red.
      // Restoring VIP here only needs current entitlements from getActiveSubscriptions.
      if (Platform.OS === 'android') {
        await getAvailablePurchases({
          alsoPublishToEventListenerIOS: false,
          onlyIncludeActiveItemsIOS: true,
        });
      }
      const ids = Platform.OS === 'ios' ? PLANS.map((p) => p.iosSku) : PLANS.map((p) => p.androidSku);
      const subs = await getActiveSubscriptions(ids);
      const vipCandidates = subs
        .filter((s) => s.isActive)
        .map((s) => {
          const plan = resolvePlanFromActiveSub(s);
          return plan ? { sub: s, plan } : null;
        })
        .filter((x): x is { sub: ActiveSubscription; plan: VipPlan } => x !== null);
      if (vipCandidates.length === 0) {
        Alert.alert(text.restoreNoneTitle, text.restoreNoneMessage);
        return;
      }
      const best = vipCandidates.reduce((acc, cur) => {
        const endAcc = vipExpiresIsoFromActive(acc.sub, acc.plan);
        const endCur = vipExpiresIsoFromActive(cur.sub, cur.plan);
        return endCur > endAcc ? cur : acc;
      });
      const expiresAt = vipExpiresIsoFromActive(best.sub, best.plan);
      await setUser({
        ...user,
        isVipMember: true,
        vipPlanId: best.plan.id,
        vipExpiresAt: expiresAt,
      });
      Alert.alert(text.restoreSuccessTitle, text.restoreSuccessMessage);
    } catch (e) {
      console.warn('[VIP] restore failed:', e);
      Alert.alert(text.paymentErrorTitle, text.paymentErrorMessage);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleManageSubscriptions = () => {
    if (Platform.OS === 'ios') {
      void Linking.openURL(IOS_MANAGE_SUBS_URL);
      return;
    }
    void Linking.openURL('https://play.google.com/store/account/subscriptions');
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

          <View style={s.disclosureBox} accessibilityLabel={text.subscriptionDisclosureHeading}>
            <Text style={s.disclosureHeading}>{text.subscriptionDisclosureHeading}</Text>
            <Text style={s.disclosureTitle}>{text.subscriptionOfferingTitle}</Text>
            <Text style={s.disclosureMeta}>
              {text.subscriptionMetaLine(
                useEnglish ? selectedPlan.labelEn : selectedPlan.labelVi,
                formatPlanPrice(selectedPlan, useEnglish, storeProductsBySku),
              )}
            </Text>
          </View>

          <View style={s.subscriptionDetailsBox}>
            <Text style={s.subscriptionDetailsHeading}>{text.subscriptionDetailsHeading}</Text>
            {PLANS.map((plan) => (
              <Text key={`disclosure-${plan.id}`} style={s.subscriptionDetailsLine}>
                {text.subscriptionPlanLine(
                  useEnglish ? plan.labelEn : plan.labelVi,
                  formatPlanPrice(plan, useEnglish, storeProductsBySku),
                  priceStoreName,
                )}
              </Text>
            ))}
            <View style={s.subscriptionBulletWrap}>
              {text.subscriptionBullets.map((line, idx) => (
                <Text key={`${idx}-${line.slice(0, 24)}`} style={s.subscriptionBulletText}>
                  - {line}
                </Text>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[s.payBtn, (isPaying || isRestoring || storeSyncing || !connected) && s.payBtnDisabled]}
            onPress={handlePurchase}
            activeOpacity={0.9}
            disabled={isPaying || isRestoring || storeSyncing || !connected}
          >
            {isPaying || storeSyncing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={s.payBtnText}>{text.payButtonLabel}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.restoreBtn, (isPaying || isRestoring || storeSyncing) && s.restoreBtnDisabled]}
            onPress={handleRestore}
            activeOpacity={0.85}
            disabled={isPaying || isRestoring || storeSyncing}
          >
            {isRestoring ? (
              <ActivityIndicator color={C.primary} />
            ) : (
              <Text style={s.restoreBtnText}>{text.restorePurchases}</Text>
            )}
          </TouchableOpacity>

          {(TERMS_OF_USE_URL || PRIVACY_POLICY_URL) && (
            <View style={s.legalRow}>
              {TERMS_OF_USE_URL ? (
                <TouchableOpacity
                  onPress={() => void openLegalUrl(TERMS_OF_USE_URL)}
                  accessibilityRole="link"
                >
                  <Text style={s.legalLink}>{text.termsOfUse}</Text>
                </TouchableOpacity>
              ) : null}
              {TERMS_OF_USE_URL && PRIVACY_POLICY_URL ? <Text style={s.legalSep}> · </Text> : null}
              {PRIVACY_POLICY_URL ? (
                <TouchableOpacity
                  onPress={() => void openLegalUrl(PRIVACY_POLICY_URL)}
                  accessibilityRole="link"
                >
                  <Text style={s.legalLink}>{text.privacyPolicy}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          <TouchableOpacity onPress={handleManageSubscriptions} activeOpacity={0.85} accessibilityRole="link">
            <Text style={s.manageLink}>{text.manageSubscriptions}</Text>
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
  if (Number.isNaN(d.getTime())) {
    return '';
  }
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

function resolvePlanFromActiveSub(sub: ActiveSubscription): VipPlan | null {
  const ids = [sub.productId, sub.currentPlanId].filter(Boolean) as string[];
  for (const id of ids) {
    const plan = getPlanByStoreSku(id);
    if (plan) return plan;
  }
  return null;
}

function vipExpiresIsoFromActive(sub: ActiveSubscription, plan: VipPlan) {
  if (sub.expirationDateIOS != null) {
    return new Date(sub.expirationDateIOS).toISOString();
  }
  return addMonths(new Date(sub.transactionDate), plan.durationMonths).toISOString();
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
  disclosureBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  disclosureHeading: {
    color: C.sub,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  disclosureTitle: { color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  disclosureMeta: { color: C.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  subscriptionDetailsBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subscriptionDetailsHeading: {
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  subscriptionDetailsLine: {
    color: C.text,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
    fontWeight: '600',
  },
  subscriptionBulletWrap: {
    marginTop: 4,
    gap: 3,
  },
  subscriptionBulletText: {
    color: C.sub,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
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
  restoreBtn: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    backgroundColor: '#FFFFFF',
  },
  restoreBtnDisabled: { opacity: 0.65 },
  restoreBtnText: { color: C.primary, fontSize: 15, fontWeight: '700' },
  legalRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legalLink: {
    color: C.primary,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  legalSep: { color: C.sub, fontSize: 13 },
  manageLink: {
    marginTop: 10,
    textAlign: 'center',
    color: C.sub,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  noteText: { marginTop: 10, color: C.sub, fontSize: 12, lineHeight: 18 },
  vipActiveText: { marginTop: 8, color: C.success, fontSize: 13, fontWeight: '600' },
});
