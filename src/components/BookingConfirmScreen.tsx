import { useActiveBooking } from '@/contexts/ActiveBookingContext';
import { useBookings } from '@/contexts/BookingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { getOrCreateWallet, getTherapists, getTherapistShifts } from '@/lib/supabaseService';
import type { Therapist } from '@/lib/types';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { AppColors } from '@/constants/appColors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// react-native-maps is not supported on web – lazy import for native only
let MapView: React.ComponentType<any> | null = null;
let Circle: React.ComponentType<any> | null = null;
let Marker: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  const RNMaps = require('react-native-maps');
  MapView = RNMaps.default;
  Circle = RNMaps.Circle;
  Marker = RNMaps.Marker;
}

const COLORS = {
  green: AppColors.primaryDark,
  greenLight: AppColors.primarySoft,
  greenBorder: '#D1D9E6',
  bg: AppColors.bg,
  white: AppColors.white,
  text: AppColors.text,
  subText: AppColors.textMuted,
  border: AppColors.border,
  gold: '#F5A623',
  red: AppColors.danger,
};

interface SelectedService {
  name: string;
  duration: number;
  price: number;
}

interface SavedAddr {
  id: string;
  name: string;
  phone: string;
  address: string;
  note: string;
  isDefault: boolean;
}

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Tiền mặt', icon: '💵' },
  { id: 'glow', label: 'Số dư Glow', icon: '💰' },
  { id: 'card', label: 'Thẻ Visa/MasterCard/JCB', icon: '💳' },
  { id: 'transfer', label: 'Chuyển khoản', icon: '🏦' },
  { id: 'atm', label: 'Thanh toán qua thẻ ATM', icon: '🏧' },
];

export default function BookingConfirmScreen({
  therapist,
  selectedServices,
  totalPrice,
  onClose,
}: {
  therapist: Therapist;
  selectedServices: SelectedService[];
  totalPrice: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const headerTopPadding = Math.max(insets.top, 10);
  const [subScreen, setSubScreen] = useState<'main' | 'address' | 'addAddress' | 'payment'>('main');
  const [selectedAddress, setSelectedAddress] = useState<SavedAddr | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddr[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [promoCode, setPromoCode] = useState('');
  const [cartServices, setCartServices] = useState<SelectedService[]>(selectedServices);
  const [nearbyTherapists, setNearbyTherapists] = useState<NearbyTherapist[]>([]);
  const [glowBalance, setGlowBalance] = useState(0);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);

  useEffect(() => {
    if (!user?.authUid) return;
    getOrCreateWallet(user.authUid)
      .then((w) => setGlowBalance(w.balance))
      .catch(() => {});
  }, [user?.authUid]);

  // Fetch therapist shifts for today
  useEffect(() => {
    (async () => {
      setLoadingSlots(true);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const shifts = await getTherapistShifts(therapist.id, today, today);
        const todayShift = shifts.find((s) => s.shiftDate === today);
        setAvailableSlots(todayShift?.slots || []);
      } catch {
        setAvailableSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, [therapist.id]);

  useEffect(() => {
    (async () => {
      try {
        const rows = await getTherapists();
        setNearbyTherapists(rows.map((item) => ({
          id: item.id,
          name: item.name,
          avatar: item.avatar || 'https://picsum.photos/seed/therapist-default/200/200',
          rating: item.rating ?? 5,
          reviewCount: item.reviewCount ?? 0,
          distance: Math.max(1, Math.round(item.distanceFromCenter || 5)),
        })));
      } catch {
        setNearbyTherapists([]);
      }
    })();
  }, []);

  // Add address form state
  const [addrName, setAddrName] = useState(user?.displayName || '');
  const [addrPhone, setAddrPhone] = useState(user?.phoneNumber || '');
  const [addrAddress, setAddrAddress] = useState('');
  const [addrNote, setAddrNote] = useState('');
  const [addrDefault, setAddrDefault] = useState(true);

  const cartTotal = cartServices.reduce((sum, s) => sum + s.price, 0);
  const [showSearchScreen, setShowSearchScreen] = useState(false);

  const removeService = (name: string) => {
    const next = cartServices.filter((s) => s.name !== name);
    if (next.length === 0) {
      onClose();
    } else {
      setCartServices(next);
    }
  };

  const handleConfirmAddress = () => {
    if (!addrName.trim() || !addrPhone.trim() || !addrAddress.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng điền đầy đủ các trường bắt buộc');
      return;
    }
    const newAddr: SavedAddr = {
      id: Date.now().toString(),
      name: addrName.trim(),
      phone: addrPhone.trim(),
      address: addrAddress.trim(),
      note: addrNote.trim(),
      isDefault: addrDefault,
    };
    if (addrDefault) {
      setSavedAddresses((prev) => prev.map((a) => ({ ...a, isDefault: false })));
    }
    setSavedAddresses((prev) => [...prev, newAddr]);
    setSelectedAddress(newAddr);
    setSubScreen('main');
    // Reset form
    setAddrName(user?.displayName || '');
    setAddrPhone(user?.phoneNumber || '');
    setAddrAddress('');
    setAddrNote('');
    setAddrDefault(true);
  };

  const handleBookNow = () => {
    if (!selectedAddress) {
      Alert.alert('Chưa chọn địa chỉ', 'Vui lòng chọn địa chỉ trước khi đặt lịch');
      return;
    }
    if (!selectedSlot) {
      Alert.alert('Chưa chọn khung giờ', 'Vui lòng chọn khung giờ trước khi đặt lịch');
      return;
    }
    setShowSearchScreen(true);
  };

  // ===== PAYMENT METHODS SCREEN =====
  if (subScreen === 'payment') {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <View style={s.header}>
          <TouchableOpacity style={s.headerBackBtn} onPress={() => setSubScreen('main')}>
            <Text style={s.headerBackIcon}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Phương thức thanh toán</Text>
          <View style={{ width: 38 }} />
        </View>
        <ScrollView style={s.body}>
          {PAYMENT_METHODS.map((pm) => (
            <TouchableOpacity
              key={pm.id}
              style={s.paymentRow}
              onPress={() => {
                setPaymentMethod(pm.id);
                setSubScreen('main');
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.paymentLabel}>{pm.label}</Text>
                {pm.id === 'glow' && (
                  <View style={s.glowBalanceRow}>
                    <Text style={s.glowBalanceText}>đ {glowBalance.toLocaleString('vi-VN')}</Text>
                    <TouchableOpacity style={s.topUpBtn} onPress={() => router.push('/therapist-topup')}>
                      <Text style={s.topUpBtnText}>Nạp tiền</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <View style={[s.radioCircle, paymentMethod === pm.id && s.radioCircleActive]}>
                {paymentMethod === pm.id && <View style={s.radioInner} />}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

      </SafeAreaView>
    );
  }

  // ===== ADD ADDRESS SCREEN =====
  if (subScreen === 'addAddress') {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={[s.header, { paddingTop: headerTopPadding }]}>
          <TouchableOpacity style={s.headerBackBtn} onPress={() => setSubScreen('address')}>
            <Text style={s.headerBackIcon}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Thêm địa chỉ mới</Text>
          <View style={{ width: 38 }} />
        </View>
        <ScrollView style={s.body} contentContainerStyle={{ padding: 20 }}>
          <Text style={s.formLabel}>
            Tên khách hàng <Text style={s.required}>*</Text>
          </Text>
          <TextInput
            style={s.formInput}
            value={addrName}
            onChangeText={setAddrName}
            placeholder="Nhập tên"
            placeholderTextColor="#999"
          />

          <Text style={s.formLabel}>
            Số điện thoại <Text style={s.required}>*</Text>
          </Text>
          <TextInput
            style={s.formInput}
            value={addrPhone}
            onChangeText={setAddrPhone}
            placeholder="Nhập số điện thoại"
            placeholderTextColor="#999"
            keyboardType="phone-pad"
          />

          <Text style={s.formLabel}>
            Địa chỉ <Text style={s.required}>*</Text>
          </Text>
          <TextInput
            style={s.formInput}
            value={addrAddress}
            onChangeText={setAddrAddress}
            placeholder="Nhập địa chỉ"
            placeholderTextColor="#999"
          />

          <Text style={s.formLabel}>Ghi chú</Text>
          <TextInput
            style={[s.formInput, { height: 80, textAlignVertical: 'top' }]}
            value={addrNote}
            onChangeText={setAddrNote}
            placeholder="Ghi chú thêm (không bắt buộc)"
            placeholderTextColor="#999"
            multiline
          />

          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Đặt làm địa chỉ mặc định</Text>
            <Switch
              value={addrDefault}
              onValueChange={setAddrDefault}
              trackColor={{ false: '#D1D5DB', true: COLORS.greenLight }}
              thumbColor={addrDefault ? COLORS.green : '#f4f3f4'}
            />
          </View>
        </ScrollView>
        <View style={s.footerBar}>
          <TouchableOpacity style={s.greenBtn} onPress={handleConfirmAddress} activeOpacity={0.8}>
            <Text style={s.greenBtnText}>Xác nhận</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ===== ADDRESS LIST SCREEN =====
  if (subScreen === 'address') {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={[s.header, { paddingTop: headerTopPadding }]}>
          <TouchableOpacity style={s.headerBackBtn} onPress={() => setSubScreen('main')}>
            <Text style={s.headerBackIcon}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Địa chỉ của tôi</Text>
          <View style={{ width: 38 }} />
        </View>
        {savedAddresses.length === 0 ? (
          <View style={s.emptyAddress}>
            <Text style={s.emptyMapEmoji}>🗺️</Text>
            <Text style={s.emptyMapText}>Chưa có địa chỉ nào. Vui lòng bổ sung</Text>
          </View>
        ) : (
          <ScrollView style={s.body}>
            {savedAddresses.map((addr) => (
              <TouchableOpacity
                key={addr.id}
                style={[
                  s.addressCard,
                  selectedAddress?.id === addr.id && s.addressCardActive,
                ]}
                onPress={() => {
                  setSelectedAddress(addr);
                  setSubScreen('main');
                }}
              >
                <View style={s.addressIcon}>
                  <Text style={{ fontSize: 20 }}>📍</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.addressName}>
                    {addr.name} • {addr.phone}
                  </Text>
                  <Text style={s.addressText}>{addr.address}</Text>
                  {addr.isDefault && (
                    <View style={s.defaultBadge}>
                      <Text style={s.defaultBadgeText}>Mặc định</Text>
                    </View>
                  )}
                </View>
                {selectedAddress?.id === addr.id && (
                  <Text style={s.addressCheck}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <View style={s.footerBar}>
          <TouchableOpacity
            style={s.greenBtn}
            onPress={() => setSubScreen('addAddress')}
            activeOpacity={0.8}
          >
            <Text style={s.greenBtnText}>Thêm địa chỉ</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ===== MAIN BOOKING CONFIRM SCREEN =====
  const selectedPayment = PAYMENT_METHODS.find((pm) => pm.id === paymentMethod);

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={[s.header, { paddingTop: headerTopPadding }]}>
        <TouchableOpacity style={s.headerBackBtn} onPress={onClose}>
          <Text style={s.headerBackIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Thông tin đặt lịch</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        {/* Address section */}
        <TouchableOpacity style={s.card} onPress={() => setSubScreen('address')}>
          <View style={s.cardRowBetween}>
            <Text style={s.cardLabel}>Địa chỉ của tôi</Text>
            <Text style={s.cardArrow}>›</Text>
          </View>
          {selectedAddress ? (
            <View>
              <Text style={s.addressSelectedName}>
                {selectedAddress.name} • {selectedAddress.phone}
              </Text>
              <Text style={s.addressSelectedText}>{selectedAddress.address}</Text>
            </View>
          ) : (
            <Text style={s.noAddressText}>Chưa chọn địa chỉ</Text>
          )}
        </TouchableOpacity>

        {/* Selected services */}
        {cartServices.map((svc) => (
          <View key={svc.name} style={s.card}>
            <View style={s.cardRowBetween}>
              <Text style={s.serviceTitle}>{svc.name}</Text>
              <TouchableOpacity onPress={() => removeService(svc.name)}>
                <Text style={s.removeIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={s.serviceMetaRow}>
              <Text style={s.serviceMeta}>🕐  {svc.duration} phút</Text>
              <Text style={s.serviceMetaDivider}>|</Text>
              <Text style={s.serviceMeta}>{svc.price.toLocaleString('vi-VN')} đ</Text>
            </View>
            {/* Dashed divider */}
            <View style={s.dashedDivider} />
            {/* Therapist info */}
            <View style={s.therapistRow}>
              <View style={s.therapistAvatar}>
                <Text style={{ fontSize: 28 }}>
                  {therapist.gender === 'female' ? '👩' : '👨'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.therapistName}>{therapist.name}</Text>
                <View style={s.therapistRatingRow}>
                  <Text style={s.starIcon}>⭐</Text>
                  <Text style={s.ratingValue}>{therapist.rating.toFixed(1)}</Text>
                  <Text style={s.reviewCount}>({therapist.reviewCount} đánh giá)</Text>
                </View>
              </View>
            </View>
          </View>
        ))}

        {/* Payment method */}
        <View style={s.card}>
          <View style={s.cardRowBetween}>
            <Text style={s.cardLabel}>Phương thức thanh toán</Text>
            <TouchableOpacity onPress={() => setSubScreen('payment')}>
              <Text style={s.viewAllLink}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>
          <View style={s.paymentSelectedRow}>
            <Text style={s.paymentSelectedIcon}>💵</Text>
            <Text style={s.paymentSelectedLabel}>{selectedPayment?.label || 'Tiền mặt'}</Text>
          </View>
        </View>

        {/* Time slot picker */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Khung giờ đặt lịch</Text>
          {loadingSlots ? (
            <ActivityIndicator size="small" color={COLORS.green} style={{ marginTop: 12 }} />
          ) : availableSlots.length === 0 ? (
            <Text style={s.noSlotText}>
              KTV chưa đăng ký khung giờ nào hôm nay
            </Text>
          ) : (
            <View style={s.slotGrid}>
              {availableSlots.map((slot) => (
                <TouchableOpacity
                  key={slot}
                  style={[
                    s.slotChip,
                    selectedSlot === slot && s.slotChipActive,
                  ]}
                  onPress={() => setSelectedSlot(slot)}
                >
                  <Text
                    style={[
                      s.slotChipText,
                      selectedSlot === slot && s.slotChipTextActive,
                    ]}
                  >
                    {slot}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Promo code */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Mã giảm giá</Text>
          <View style={s.promoRow}>
            <TextInput
              style={s.promoInput}
              value={promoCode}
              onChangeText={setPromoCode}
              placeholder="Nhập mã giảm giá"
              placeholderTextColor="#999"
            />
            <TouchableOpacity
              style={s.promoBtn}
              onPress={() => {
                if (promoCode.trim()) {
                  Alert.alert('Thông báo', 'Mã giảm giá không hợp lệ hoặc đã hết hạn');
                }
              }}
            >
              <Text style={s.promoBtnText}>Áp dụng</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment details */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Chi tiết thanh toán</Text>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Tạm tính</Text>
            <Text style={s.detailValue}>{cartTotal.toLocaleString('vi-VN')} đ</Text>
          </View>
        </View>

        <View style={{ height: 140 }} />
      </ScrollView>

      {/* Bottom bar */}
      <View style={s.bottomBar}>
        <View style={s.bottomInfo}>
          <Text style={s.bottomLabel}>
            Tổng: <Text style={s.bottomCount}>{cartServices.length}</Text> dịch vụ
          </Text>
          <Text style={s.bottomPrice}>{cartTotal.toLocaleString('vi-VN')} đ</Text>
        </View>
        <TouchableOpacity
          style={[s.greenBtn, (!selectedAddress || !selectedSlot) && s.greenBtnDisabled]}
          onPress={handleBookNow}
          activeOpacity={0.8}
        >
          <Text style={[s.greenBtnText, (!selectedAddress || !selectedSlot) && s.greenBtnTextDisabled]}>
            Đặt ngay
          </Text>
        </TouchableOpacity>
      </View>

      {/* Booking Search Screen */}
      {showSearchScreen && (
        <BookingSearchModal
          therapist={therapist}
          onClose={onClose}
          cartServices={cartServices}
          cartTotal={cartTotal}
          paymentMethod={paymentMethod}
          therapists={nearbyTherapists}
          selectedSlot={selectedSlot || ''}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Mock Nearby Therapists ─────────────────────────────────
interface NearbyTherapist {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  reviewCount: number;
  distance: number;
}

const searchTranslations = {
  vi: {
    waitingTitle: 'Đang chờ {name} xác nhận...',
    autoCancel: 'Đơn đặt sẽ tự động hủy trong vòng',
    cancelOrder: 'Hủy đơn',
    ktvCount: '{count} KTV đang muốn phục vụ bạn',
    replaceFor: 'thay cho {name}',
    ready: 'Sẵn sàng',
    choose: 'Chọn',
    noWaitTitle: 'Không cần chờ lâu',
    noWaitDesc: 'Các kỹ thuật viên dưới đây thấy bạn có nhu cầu đặt dịch vụ và sẵn sàng phục vụ bạn ngay lập tức',
    viewKtvList: 'Xem danh sách KTV',
    searchingNearby: 'Đang tìm kỹ thuật viên gần bạn...',
    reviewCount: 'đánh giá',
    km: 'km',
    autoCancelledTitle: 'Đơn đã bị hủy',
    autoCancelledMsg: 'Kỹ thuật viên không xác nhận trong thời gian quy định. Đơn đặt của bạn đã tự động hủy.',
    ok: 'Đồng ý',
    connecting: 'Đang kết nối với {name}...',
    busyTitle: 'KTV đang bận',
    busyMsg: '{name} đang bận phục vụ khách khác. Vui lòng chọn kỹ thuật viên khác.',
    chooseOther: 'Chọn KTV khác',
    connected: 'Đã kết nối',
    viewDetails: 'Xem chi tiết',
    bookingTime: 'Thời gian đặt hẹn:',
    noteWarning: '❗ LƯU Ý: Glow KHÔNG cho phép hành vi: Yêu cầu hủy đơn để làm ngoài/Cung cấp thông tin liên hệ/Sử dụng các từ ngữ nhạy cảm...',
    noteWarning2: 'Vui lòng chỉ trao đổi trên Glow. Glow không chịu trách nhiệm và hỗ trợ nếu bạn liên hệ ngoài ứng dụng Glow.',
    systemNotice: '[Thông báo Glow] Khách mới, chưa hoàn thành đơn nào. KTV đến nơi, vui lòng thu tiền trước khi làm.',
    greeting: 'E chào anh',
    translate: 'Dịch',
    library: 'Thư viện',
    location: 'Vị trí',
    typeMessage: 'Tin nhắn',
    newCustomer: 'Khách mới',
    collectFirst: 'Thu tiền trước',
  },
  en: {
    waitingTitle: 'Waiting for {name} to confirm...',
    autoCancel: 'Order will auto-cancel in',
    cancelOrder: 'Cancel Order',
    ktvCount: '{count} therapists want to serve you',
    replaceFor: 'instead of {name}',
    ready: 'Ready',
    choose: 'Choose',
    noWaitTitle: 'No need to wait long',
    noWaitDesc: 'The therapists below see your booking request and are ready to serve you right away',
    viewKtvList: 'View therapist list',
    searchingNearby: 'Searching for nearby therapists...',
    reviewCount: 'reviews',
    km: 'km',
    autoCancelledTitle: 'Order Cancelled',
    autoCancelledMsg: 'The therapist did not confirm in time. Your booking has been automatically cancelled.',
    ok: 'OK',
    connecting: 'Connecting to {name}...',
    busyTitle: 'Therapist Busy',
    busyMsg: '{name} is currently serving another client. Please choose a different therapist.',
    chooseOther: 'Choose Another',
    connected: 'Connected',
    viewDetails: 'View details',
    bookingTime: 'Booking time:',
    noteWarning: '❗ NOTE: Glow does NOT allow: Requesting cancellation to work outside/Sharing contact information/Using inappropriate language...',
    noteWarning2: 'Please only communicate on Glow. Glow is not responsible if you contact outside the app.',
    systemNotice: '[Glow Notice] New customer, no completed orders yet. Please collect payment before starting service.',
    greeting: 'Hello!',
    translate: 'Translate',
    library: 'Library',
    location: 'Location',
    typeMessage: 'Message',
    newCustomer: 'New customer',
    collectFirst: 'Collect payment first',
  },
};

const { width: BSCREEN_W } = Dimensions.get('window');

// Generate random therapist positions around the user
function generateNearbyPositions(
  center: { latitude: number; longitude: number },
  therapists: NearbyTherapist[]
) {
  return therapists.map((t) => {
    const angle = Math.random() * 2 * Math.PI;
    const radiusKm = t.distance;
    const latOffset = (radiusKm / 111) * Math.cos(angle);
    const lngOffset = (radiusKm / (111 * Math.cos((center.latitude * Math.PI) / 180))) * Math.sin(angle);
    return {
      ...t,
      coordinate: {
        latitude: center.latitude + latOffset,
        longitude: center.longitude + lngOffset,
      },
    };
  });
}

// Default to Ha Noi if location not available
const DEFAULT_LOCATION = { latitude: 21.0285, longitude: 105.8542 };

// ─── Booking Search Modal ───────────────────────────────────
function BookingSearchModal({
  therapist,
  onClose,
  cartServices,
  cartTotal,
  paymentMethod,
  therapists,
  selectedSlot,
}: {
  therapist: Therapist;
  onClose: () => void;
  cartServices: SelectedService[];
  cartTotal: number;
  paymentMethod: string;
  therapists: NearbyTherapist[];
  selectedSlot: string;
}) {
  const { language } = useLanguage();
  const strings = searchTranslations[language as keyof typeof searchTranslations] || searchTranslations.vi;
  const [countdown, setCountdown] = useState(12 * 60);
  const [showPopup, setShowPopup] = useState(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const radarAnim = useRef(new Animated.Value(0)).current;
  const [userLocation, setUserLocation] = useState(DEFAULT_LOCATION);
  const [connectingTherapist, setConnectingTherapist] = useState<NearbyTherapist | null>(null);
  const [connectedTherapist, setConnectedTherapist] = useState<NearbyTherapist | null>(null);
  const [busyTherapist, setBusyTherapist] = useState<NearbyTherapist | null>(null);
  const [nearbyPositions, setNearbyPositions] = useState<
    (NearbyTherapist & { coordinate: { latitude: number; longitude: number } })[]
  >([]);
  const mapRef = useRef<any>(null);

  // Get user location
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setUserLocation(coords);
          setNearbyPositions(generateNearbyPositions(coords, therapists));
        } else {
          setNearbyPositions(generateNearbyPositions(DEFAULT_LOCATION, therapists));
        }
      } catch {
        // Location can fail in simulator / test mode; fallback to default coords.
        setUserLocation(DEFAULT_LOCATION);
        setNearbyPositions(generateNearbyPositions(DEFAULT_LOCATION, therapists));
      }
    })();
  }, [therapists]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto-cancel when countdown reaches 0
          Alert.alert(
            strings.autoCancelledTitle,
            strings.autoCancelledMsg,
            [{ text: strings.ok, onPress: onClose }],
            { cancelable: false }
          );
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [strings, onClose]);

  // Pulse animation for the center marker
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Radar sweep animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(radarAnim, { toValue: 1, duration: 3000, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [radarAnim]);

  useEffect(() => {
    const timer = setTimeout(() => setShowPopup(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }, []);

  const assignedName = therapist.name;
  const suggestedTherapists = therapists;

  const { setActiveBooking } = useActiveBooking();
  const { addBooking } = useBookings();
  const { user } = useUser();

  const handleChooseTherapist = (t: NearbyTherapist) => {
    setConnectingTherapist(t);
    // Simulate: 60% chance accepted, 40% busy (after 2-3s delay)
    const delay = 2000 + Math.random() * 1500;
    setTimeout(() => {
      setConnectingTherapist(null);
      if (Math.random() < 0.6) {
        setConnectedTherapist(t);
        // Set active booking in global context for home screen banner
        setActiveBooking({
          therapist: t,
          services: cartServices,
          totalPrice: cartTotal,
          paymentMethod,
          connectedAt: new Date(),
        });
        // Add to shared bookings context so therapist can see it
        const now = new Date();
        const timeStr = selectedSlot;
        addBooking({
          customerUserId: user?.authUid || user?.phoneNumber || 'test-user',
          customerName: user?.displayName || user?.email || user?.phoneNumber || 'Khách',
          customerPhone: user?.phoneNumber || user?.email || '',
          therapistId: t.id,
          therapistName: t.name,
          therapistAvatar: t.avatar || '',
          service: cartServices.map(s => s.name).join(', '),
          date: now.toISOString().slice(0, 10),
          time: timeStr,
          address: 'Địa chỉ khách hàng',
          price: cartTotal,
          status: 'pending',
        }, {
          userId: user?.authUid || user?.phoneNumber || '',
          city: user?.selectedCity || user?.workingCity || 'Hà Nội',
        });
      } else {
        setBusyTherapist(t);
      }
    }, delay);
  };

  // If connected, show chat screen
  if (connectedTherapist) {
    return (
      <ConnectedChatScreen
        therapist={connectedTherapist}
        onClose={onClose}
        cartServices={cartServices}
        cartTotal={cartTotal}
        paymentMethod={paymentMethod}
      />
    );
  }

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const radarRotate = radarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={bs.container}>
        <StatusBar barStyle="dark-content" />

        {/* Real Map area */}
        <View style={bs.mapArea}>
          {Platform.OS !== 'web' && MapView && Circle && Marker ? (
          <MapView
            ref={mapRef}
            style={bs.mapView}
            initialRegion={{
              ...userLocation,
              latitudeDelta: 0.12,
              longitudeDelta: 0.12,
            }}
            region={{
              ...userLocation,
              latitudeDelta: 0.12,
              longitudeDelta: 0.12,
            }}
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={false}
            toolbarEnabled={false}
          >
            {/* Scanning radius circles */}
            <Circle
              center={userLocation}
              radius={3000}
              fillColor="rgba(45, 134, 83, 0.08)"
              strokeColor="rgba(45, 134, 83, 0.25)"
              strokeWidth={1}
            />
            <Circle
              center={userLocation}
              radius={6000}
              fillColor="rgba(45, 134, 83, 0.04)"
              strokeColor="rgba(45, 134, 83, 0.15)"
              strokeWidth={1}
            />
            <Circle
              center={userLocation}
              radius={10000}
              fillColor="rgba(45, 134, 83, 0.02)"
              strokeColor="rgba(45, 134, 83, 0.1)"
              strokeWidth={1}
            />

            {/* Therapist markers */}
            {nearbyPositions.map((t) => (
              <Marker key={t.id} coordinate={t.coordinate} title={t.name}>
                <View style={bs.markerWrap}>
                  <Image source={{ uri: t.avatar }} style={bs.markerAvatar} />
                </View>
              </Marker>
            ))}

            {/* User center marker */}
            <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={bs.userMarkerOuter}>
                <View style={bs.userMarkerInner} />
              </View>
            </Marker>
          </MapView>
          ) : (
            <View style={[bs.mapView, { backgroundColor: AppColors.accentSoft, justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ fontSize: 48 }}>📍</Text>
              <Text style={{ color: AppColors.primaryDark, fontWeight: '600', marginTop: 8 }}>Đang tìm kỹ thuật viên gần bạn...</Text>
            </View>
          )}

          {/* Animated radar overlay on map */}
          <View style={bs.radarOverlay} pointerEvents="none">
            <Animated.View style={[
              bs.radarPulse,
              { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
            ]} />
            <Animated.View style={[
              bs.radarSweep,
              { transform: [{ rotate: radarRotate }] },
            ]}>
              <View style={bs.radarSweepWedge} />
            </Animated.View>
            <View style={bs.radarCenterDot} />
          </View>

          {/* Map overlay buttons */}
          <TouchableOpacity style={bs.backBtn} onPress={onClose}>
            <Text style={bs.backBtnText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={bs.cancelBtn} onPress={onClose}>
            <Text style={bs.cancelBtnText}>{strings.cancelOrder}</Text>
          </TouchableOpacity>
          <View style={bs.cityLabel}>
            <Text style={bs.cityText}>Hà Nội</Text>
          </View>
        </View>

        {/* Bottom sheet */}
        <ScrollView style={bs.bottomSheet} bounces={false}>
          <View style={bs.waitingSection}>
            <Text style={bs.waitingTitle}>
              {strings.waitingTitle.replace('{name}', assignedName)}
            </Text>
            <Text style={bs.autoCancelText}>
              {strings.autoCancel}{' '}
              <Text style={bs.countdownText}>{formatTime(countdown)}</Text>
            </Text>
          </View>

          <View style={bs.searchingRow}>
            <ActivityIndicator size="small" color={COLORS.green} />
            <Text style={bs.searchingText}>{strings.searchingNearby}</Text>
          </View>

          <View style={bs.suggestHeader}>
            <Text style={bs.suggestTitle}>
              {strings.ktvCount.replace('{count}', String(suggestedTherapists.length))}
            </Text>
            <Text style={bs.suggestSub}>
              {strings.replaceFor.replace('{name}', assignedName)}
            </Text>
          </View>

          {suggestedTherapists.map((t) => (
            <View key={t.id} style={bs.therapistCard}>
              <Image source={{ uri: t.avatar }} style={bs.therapistAvatar} />
              <View style={bs.therapistInfo}>
                <Text style={bs.therapistName}>{t.name}</Text>
                <View style={bs.therapistMeta}>
                  <Text style={bs.therapistStar}>⭐</Text>
                  <Text style={bs.therapistRating}>{t.rating.toFixed(1)}</Text>
                  <Text style={bs.therapistReviews}>
                    ({t.reviewCount} {strings.reviewCount})
                  </Text>
                </View>
                <Text style={bs.therapistDistance}>⊙ {t.distance} {strings.km}</Text>
              </View>
              <View style={bs.therapistRight}>
                <Text style={bs.readyText}>{strings.ready}</Text>
                <TouchableOpacity
                  style={[bs.chooseBtn, connectingTherapist?.id === t.id && bs.chooseBtnDisabled]}
                  onPress={() => !connectingTherapist && handleChooseTherapist(t)}
                  disabled={!!connectingTherapist}
                >
                  {connectingTherapist?.id === t.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={bs.chooseBtnText}>{strings.choose}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Popup - no wait */}
        {showPopup && !connectingTherapist && !busyTherapist && (
          <View style={bs.popupOverlay}>
            <View style={bs.popupCard}>
              <Text style={bs.popupTitle}>{strings.noWaitTitle}</Text>
              <Text style={bs.popupDesc}>{strings.noWaitDesc}</Text>
              <View style={bs.popupAvatars}>
                {suggestedTherapists.slice(0, 2).map((t) => (
                  <Image key={t.id} source={{ uri: t.avatar }} style={bs.popupAvatar} />
                ))}
              </View>
              <TouchableOpacity style={bs.popupBtn} onPress={() => setShowPopup(false)}>
                <Text style={bs.popupBtnText}>{strings.viewKtvList}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Connecting overlay */}
        {connectingTherapist && (
          <View style={bs.popupOverlay}>
            <View style={bs.popupCard}>
              <Image source={{ uri: connectingTherapist.avatar }} style={bs.connectingAvatar} />
              <ActivityIndicator size="large" color={COLORS.green} style={{ marginVertical: 16 }} />
              <Text style={bs.popupTitle}>
                {strings.connecting.replace('{name}', connectingTherapist.name)}
              </Text>
            </View>
          </View>
        )}

        {/* Busy popup */}
        {busyTherapist && (
          <View style={bs.popupOverlay}>
            <View style={bs.popupCard}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>😔</Text>
              <Text style={bs.popupTitle}>{strings.busyTitle}</Text>
              <Text style={bs.popupDesc}>
                {strings.busyMsg.replace('{name}', busyTherapist.name)}
              </Text>
              <TouchableOpacity style={bs.popupBtn} onPress={() => setBusyTherapist(null)}>
                <Text style={bs.popupBtnText}>{strings.chooseOther}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Connected Chat Screen (Glow-style) ────────────────────
function ConnectedChatScreen({
  therapist,
  onClose,
  cartServices,
  cartTotal,
  paymentMethod,
}: {
  therapist: NearbyTherapist;
  onClose: () => void;
  cartServices: SelectedService[];
  cartTotal: number;
  paymentMethod: string;
}) {
  const { language } = useLanguage();
  const { clearActiveBooking } = useActiveBooking();
  const strings = searchTranslations[language as keyof typeof searchTranslations] || searchTranslations.vi;
  const [messageText, setMessageText] = useState('');
  const [showOrderDetail, setShowOrderDetail] = useState(false);

  // When closing the connected chat, clear the active booking (order done)
  const handleClose = () => {
    clearActiveBooking();
    onClose();
  };
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

  interface ChatMsg {
    id: string;
    type: 'system' | 'warning' | 'therapist';
    text: string;
    time?: string;
  }

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: '1',
      type: 'system',
      text: `🟢 ${strings.connected}\n\n${strings.bookingTime} ${timeStr} ${dateStr}`,
    },
    {
      id: '2',
      type: 'warning',
      text: `${strings.noteWarning}\n\n${strings.noteWarning2}`,
    },
    {
      id: '3',
      type: 'system',
      text: strings.systemNotice,
      time: timeStr,
    },
    {
      id: '4',
      type: 'therapist',
      text: strings.greeting,
      time: timeStr,
    },
  ]);

  const handleSend = () => {
    if (!messageText.trim()) return;
    const newMsg: ChatMsg = {
      id: Date.now().toString(),
      type: 'therapist',
      text: messageText.trim(),
      time: `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`,
    };
    setMessages((prev) => [...prev, newMsg]);
    setMessageText('');
  };

  const renderMessage = ({ item }: { item: ChatMsg }) => {
    if (item.type === 'system') {
      return (
        <View style={cs.systemBubble}>
          <Text style={cs.systemText}>{item.text}</Text>
          {item.time && <Text style={cs.msgTime}>{item.time}</Text>}
        </View>
      );
    }
    if (item.type === 'warning') {
      return (
        <View style={cs.warningBubble}>
          <Text style={cs.warningText}>{item.text}</Text>
        </View>
      );
    }
    // therapist message
    return (
      <View style={cs.therapistMsgRow}>
        <View style={cs.therapistMsgAvatarWrap}>
          <Image source={{ uri: therapist.avatar }} style={cs.therapistMsgAvatar} />
        </View>
        <View style={cs.therapistBubble}>
          <Text style={cs.therapistMsgText}>{item.text}</Text>
          <View style={cs.therapistMsgFooter}>
            <Text style={cs.msgTime}>{item.time}</Text>
            <TouchableOpacity style={cs.translateBtn}>
              <Text style={cs.translateIcon}>🌐</Text>
              <Text style={cs.translateText}>{strings.translate}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const orderCode = now.getTime().toString(16).toUpperCase().substring(0, 16);
  const selectedPaymentLabel = PAYMENT_METHODS.find((pm) => pm.id === paymentMethod)?.label || 'Tiền mặt';

  if (showOrderDetail) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setShowOrderDetail(false)}>
        <SafeAreaView style={od.container} edges={['top']}>
          <StatusBar barStyle="dark-content" />
          {/* Header */}
          <View style={od.header}>
            <TouchableOpacity style={od.backBtn} onPress={() => setShowOrderDetail(false)}>
              <Text style={od.backIcon}>←</Text>
            </TouchableOpacity>
            <Text style={od.headerTitle}>{language === 'en' ? 'Order Details' : 'Chi tiết đơn'}</Text>
            <View style={{ width: 38 }} />
          </View>

          <ScrollView style={od.body} showsVerticalScrollIndicator={false}>
            {/* Illustration */}
            <View style={od.illustrationWrap}>
              <Text style={od.illustrationEmoji}>🛵💨</Text>
              <Text style={od.illustrationSubText}>
                {language === 'en' ? 'Therapist is on the way!' : 'KTV đang trên đường đến!'}
              </Text>
            </View>

            {/* Order info card */}
            <View style={od.card}>
              <View style={od.orderCodeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={od.label}>{language === 'en' ? 'Code' : 'Mã'}: <Text style={od.orderCode}>{orderCode}</Text></Text>
                </View>
                <View style={od.statusBadge}>
                  <Text style={od.statusBadgeText}>{strings.connected}</Text>
                </View>
              </View>

              <View style={od.infoRow}>
                <Text style={od.infoIcon}>🕐</Text>
                <Text style={od.infoText}>{language === 'en' ? 'Working time' : 'Giờ làm việc'}: <Text style={od.infoBold}>{timeStr} {dateStr}</Text></Text>
              </View>

              <View style={od.infoRow}>
                <Text style={od.infoIcon}>💳</Text>
                <Text style={od.infoText}>{language === 'en' ? 'Payment' : 'Phương thức thanh toán'}: <Text style={od.infoBold}>{selectedPaymentLabel}</Text></Text>
              </View>
            </View>

            {/* Services card */}
            <View style={od.card}>
              {cartServices.map((svc, idx) => (
                <View key={svc.name}>
                  <View style={od.serviceRow}>
                    <Text style={od.serviceName}>{svc.name}</Text>
                    <View style={od.serviceDurationRow}>
                      <Text style={od.serviceDurationIcon}>🕐</Text>
                      <Text style={od.serviceDuration}>{svc.duration} {language === 'en' ? 'min' : 'phút'}</Text>
                    </View>
                  </View>
                  {idx < cartServices.length - 1 && <View style={od.divider} />}
                </View>
              ))}

              <View style={od.totalRow}>
                <Text style={od.totalLabel}>{language === 'en' ? 'Total' : 'Tổng'}: {cartServices.length} {language === 'en' ? 'service(s)' : 'dịch vụ'}</Text>
                <Text style={od.totalPrice}>{cartTotal.toLocaleString('vi-VN')} đ</Text>
              </View>
            </View>

            {/* Therapist card */}
            <View style={od.card}>
              <View style={od.therapistRow}>
                <Image source={{ uri: therapist.avatar }} style={od.therapistAvatar} />
                <View style={{ flex: 1 }}>
                  <Text style={od.therapistName}>{therapist.name} ›</Text>
                  <View style={od.therapistRatingRow}>
                    <Text style={od.starIcon}>⭐</Text>
                    <Text style={od.ratingValue}>{therapist.rating.toFixed(1)}</Text>
                    <Text style={od.reviewCount}>({therapist.reviewCount} {language === 'en' ? 'reviews' : 'đánh giá'})</Text>
                  </View>
                </View>
                <TouchableOpacity style={od.heartBtn}>
                  <Text style={od.heartIcon}>♡</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: 120 }} />
          </ScrollView>

          {/* Bottom buttons */}
          <View style={od.bottomBar}>
            <TouchableOpacity style={od.messageBtn} onPress={() => setShowOrderDetail(false)}>
              <Text style={od.messageBtnIcon}>💬</Text>
              <Text style={od.messageBtnText}>{language === 'en' ? 'Message Therapist' : 'Nhắn tin với KTV'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={od.complaintBtn} onPress={handleClose}>
              <Text style={od.complaintBtnText}>{language === 'en' ? 'End Order' : 'Kết thúc đơn'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={cs.container} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        {/* Header */}
        <View style={cs.header}>
          <TouchableOpacity style={cs.backBtn} onPress={handleClose}>
            <Text style={cs.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={cs.headerName}>{therapist.name}</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Connected banner */}
        <View style={cs.connectedBanner}>
          <View style={cs.connectedDot} />
          <Text style={cs.connectedLabel}>{strings.connected}</Text>
          <TouchableOpacity onPress={() => setShowOrderDetail(true)}>
            <Text style={cs.viewDetailsLink}>{strings.viewDetails} ›</Text>
          </TouchableOpacity>
        </View>

        {/* Chat messages */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <FlatList
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={cs.messagesList}
            showsVerticalScrollIndicator={false}
          />

          {/* Bottom input area */}
          <View style={cs.inputArea}>
            <View style={cs.inputToolbar}>
              <TouchableOpacity style={cs.toolbarBtn}>
                <Text style={cs.toolbarIcon}>📷</Text>
                <Text style={cs.toolbarLabel}>{strings.library}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={cs.toolbarBtn}>
                <Text style={cs.toolbarIcon}>📍</Text>
                <Text style={cs.toolbarLabel}>{strings.location}</Text>
              </TouchableOpacity>
            </View>
            <View style={cs.inputRow}>
              <TextInput
                style={cs.textInput}
                value={messageText}
                onChangeText={setMessageText}
                placeholder={strings.typeMessage}
                placeholderTextColor="#999"
              />
              <TouchableOpacity style={cs.sendBtn} onPress={handleSend}>
                <Text style={cs.sendIcon}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const bs = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  mapArea: {
    height: BSCREEN_W * 0.65,
    backgroundColor: '#E8EBE4',
    position: 'relative',
    overflow: 'hidden',
  },
  mapView: { width: '100%', height: '100%' },
  backBtn: {
    position: 'absolute', top: 50, left: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15, shadowRadius: 3, elevation: 3,
  },
  backBtnText: { fontSize: 24, lineHeight: 28, fontWeight: '600', color: COLORS.text },
  cancelBtn: {
    position: 'absolute', top: 50, right: 16,
    backgroundColor: AppColors.primaryDark,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  cancelBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cityLabel: {
    position: 'absolute', bottom: 30, alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 16,
  },
  cityText: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  // Therapist markers on map
  markerWrap: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2.5, borderColor: '#fff', overflow: 'hidden',
    backgroundColor: COLORS.bg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25, shadowRadius: 3, elevation: 4,
  },
  markerAvatar: { width: '100%', height: '100%' },
  // User center marker
  userMarkerOuter: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(45, 134, 83, 0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  userMarkerInner: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.green,
    borderWidth: 2.5, borderColor: '#fff',
  },
  // Radar overlay
  radarOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  radarPulse: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(45, 134, 83, 0.2)',
  },
  radarSweep: {
    position: 'absolute',
    width: 160, height: 160,
  },
  radarSweepWedge: {
    width: 80, height: 80,
    borderTopLeftRadius: 80,
    backgroundColor: 'rgba(45, 134, 83, 0.12)',
    alignSelf: 'flex-start',
  },
  radarCenterDot: {
    position: 'absolute',
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: COLORS.green,
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },
  bottomSheet: {
    flex: 1, backgroundColor: COLORS.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    marginTop: -20, paddingTop: 20,
  },
  waitingSection: {
    paddingHorizontal: 24, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  waitingTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  autoCancelText: { fontSize: 13, color: COLORS.subText },
  countdownText: { fontWeight: '700', color: COLORS.text },
  searchingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  searchingText: { fontSize: 13, color: COLORS.subText },
  suggestHeader: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 14 },
  suggestTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  suggestSub: { fontSize: 13, color: COLORS.subText },
  therapistCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  therapistAvatar: {
    width: 70, height: 70, borderRadius: 10,
    marginRight: 14, backgroundColor: COLORS.bg,
  },
  therapistInfo: { flex: 1 },
  therapistName: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  therapistMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  therapistStar: { fontSize: 14 },
  therapistRating: { fontSize: 14, fontWeight: '700', color: COLORS.gold },
  therapistReviews: { fontSize: 12, color: COLORS.subText },
  therapistDistance: { fontSize: 13, color: COLORS.subText },
  therapistRight: { alignItems: 'flex-end', gap: 8 },
  readyText: { fontSize: 12, color: COLORS.green, fontWeight: '600' },
  chooseBtn: {
    backgroundColor: COLORS.green,
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 18,
  },
  chooseBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  chooseBtnDisabled: { opacity: 0.6 },
  connectingAvatar: {
    width: 70, height: 70, borderRadius: 35,
    marginBottom: 8, borderWidth: 2, borderColor: COLORS.greenLight,
  },
  popupOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30,
  },
  popupCard: {
    backgroundColor: COLORS.white, borderRadius: 24, padding: 28,
    alignItems: 'center', width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  popupTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 10 },
  popupDesc: { fontSize: 14, color: COLORS.subText, textAlign: 'center', lineHeight: 22, marginBottom: 18 },
  popupAvatars: { flexDirection: 'row', marginBottom: 22, gap: -10 },
  popupAvatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: '#fff' },
  popupBtn: {
    width: '100%', backgroundColor: COLORS.green,
    paddingVertical: 16, borderRadius: 30, alignItems: 'center',
  },
  popupBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBackBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackIcon: {
    fontSize: 22,
    color: COLORS.text,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  body: {
    flex: 1,
  },

  // Cards
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 14,
    padding: 16,
  },
  cardRowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  cardArrow: {
    fontSize: 22,
    color: COLORS.subText,
  },

  // Address
  noAddressText: {
    fontSize: 14,
    color: COLORS.red,
    fontWeight: '600',
  },
  addressSelectedName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  addressSelectedText: {
    fontSize: 13,
    color: COLORS.subText,
  },

  // Service in cart
  serviceTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  removeIcon: {
    fontSize: 16,
    color: COLORS.subText,
    padding: 4,
  },
  serviceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceMeta: {
    fontSize: 14,
    color: COLORS.subText,
  },
  serviceMetaDivider: {
    fontSize: 14,
    color: COLORS.border,
    marginHorizontal: 10,
  },
  dashedDivider: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },

  // Therapist in card
  therapistRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  therapistAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  therapistName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  therapistRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gold,
    marginRight: 4,
  },
  reviewCount: {
    fontSize: 13,
    color: COLORS.subText,
  },

  // Payment selected
  paymentSelectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentSelectedIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  paymentSelectedLabel: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '600',
  },
  viewAllLink: {
    fontSize: 14,
    color: COLORS.green,
    fontWeight: '600',
  },

  // Promo
  promoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    overflow: 'hidden',
  },
  promoInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
  },
  promoBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  promoBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },

  // Payment details
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: COLORS.subText,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  bottomInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bottomLabel: {
    fontSize: 15,
    color: COLORS.subText,
  },
  bottomCount: {
    fontWeight: '700',
    color: COLORS.text,
  },
  bottomPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },

  // Green button
  greenBtn: {
    backgroundColor: COLORS.green,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  greenBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  greenBtnDisabled: {
    backgroundColor: '#D1D5DB',
  },
  greenBtnTextDisabled: {
    color: '#9CA3AF',
  },

  // Slot picker
  noSlotText: {
    fontSize: 14,
    color: COLORS.red,
    fontWeight: '600',
    marginTop: 8,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  slotChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.greenBorder,
    backgroundColor: COLORS.greenLight,
  },
  slotChipActive: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  slotChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.green,
  },
  slotChipTextActive: {
    color: '#fff',
  },

  footerBar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  // Payment methods screen
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  paymentLabel: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: COLORS.green,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.green,
  },
  glowBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  glowBalanceText: {
    fontSize: 13,
    color: COLORS.subText,
    marginRight: 10,
  },
  topUpBtn: {
    backgroundColor: COLORS.green,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  topUpBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // Address list screen
  emptyAddress: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMapEmoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  emptyMapText: {
    fontSize: 15,
    color: COLORS.subText,
    textAlign: 'center',
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  addressCardActive: {
    borderColor: COLORS.green,
  },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addressName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  addressText: {
    fontSize: 13,
    color: COLORS.subText,
    marginBottom: 4,
  },
  defaultBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.greenLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  defaultBadgeText: {
    fontSize: 11,
    color: COLORS.green,
    fontWeight: '600',
  },
  addressCheck: {
    fontSize: 18,
    color: COLORS.green,
    fontWeight: '800',
    marginLeft: 10,
  },

  // Add address form
  formLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 16,
  },
  required: {
    color: COLORS.red,
  },
  formInput: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.text,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
  },
  switchLabel: {
    fontSize: 15,
    color: COLORS.text,
  },
});

// ─── Chat Screen Styles ─────────────────────────────────────
const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F0' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#E8E8E8',
  },
  backBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 22, color: COLORS.text, fontWeight: '600' },
  headerName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  connectedBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E8E8E8', gap: 8,
  },
  connectedDot: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center',
  },
  connectedLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  viewDetailsLink: { fontSize: 13, color: COLORS.green, fontWeight: '600' },
  messagesList: { padding: 16, paddingBottom: 8 },
  systemBubble: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14,
    marginBottom: 12, alignSelf: 'center', maxWidth: '90%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  systemText: { fontSize: 13, color: COLORS.text, lineHeight: 20, textAlign: 'center' },
  warningBubble: {
    backgroundColor: '#FFF9E6', borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: '#F5E6B8',
  },
  warningText: { fontSize: 12, color: '#8B6914', lineHeight: 18 },
  therapistMsgRow: {
    flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, gap: 8,
  },
  therapistMsgAvatarWrap: {
    width: 32, height: 32, borderRadius: 16, overflow: 'hidden',
  },
  therapistMsgAvatar: { width: '100%', height: '100%' },
  therapistBubble: {
    backgroundColor: COLORS.white, borderRadius: 16,
    borderTopLeftRadius: 4, padding: 12, maxWidth: '75%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  therapistMsgText: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  therapistMsgFooter: {
    flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 10,
  },
  msgTime: { fontSize: 11, color: '#999', marginTop: 4 },
  translateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F0F0F0', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  translateIcon: { fontSize: 12 },
  translateText: { fontSize: 11, color: COLORS.green, fontWeight: '600' },
  inputArea: {
    backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: '#E8E8E8',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  inputToolbar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, gap: 20,
  },
  toolbarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toolbarIcon: { fontSize: 16 },
  toolbarLabel: { fontSize: 13, color: COLORS.green, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingVertical: 8, gap: 8,
  },
  textInput: {
    flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: COLORS.text,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center',
  },
  sendIcon: { fontSize: 18, color: '#fff' },
});

// ─── Order Detail Styles ────────────────────────────────────
const od = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#E8E8E8',
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 22, color: COLORS.text, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  body: { flex: 1 },

  // Illustration
  illustrationWrap: {
    backgroundColor: '#E8EBE4', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 36, paddingHorizontal: 20,
  },
  illustrationEmoji: { fontSize: 64, marginBottom: 8 },
  illustrationSubText: { fontSize: 14, color: COLORS.subText, fontWeight: '600' },

  // Card
  card: {
    backgroundColor: COLORS.white, marginHorizontal: 16, marginTop: 14,
    borderRadius: 14, padding: 16,
  },

  // Order code row
  orderCodeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: { fontSize: 14, color: COLORS.subText },
  orderCode: { fontWeight: '800', fontSize: 14, color: COLORS.text, letterSpacing: 0.5 },
  statusBadge: {
    backgroundColor: COLORS.greenLight, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.green },

  // Info rows
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  infoIcon: { fontSize: 16 },
  infoText: { fontSize: 14, color: COLORS.subText },
  infoBold: { fontWeight: '700', color: COLORS.text },

  // Service rows
  serviceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8,
  },
  serviceName: { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1 },
  serviceDurationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  serviceDurationIcon: { fontSize: 14 },
  serviceDuration: { fontSize: 14, color: COLORS.subText },
  divider: { height: 1, backgroundColor: '#F0F0F0' },

  // Total
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 12, marginTop: 8,
  },
  totalLabel: { fontSize: 14, color: COLORS.subText },
  totalPrice: { fontSize: 20, fontWeight: '800', color: COLORS.text },

  // Therapist
  therapistRow: { flexDirection: 'row', alignItems: 'center' },
  therapistAvatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#E8E8E8', marginRight: 12,
  },
  therapistName: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  therapistRatingRow: { flexDirection: 'row', alignItems: 'center' },
  starIcon: { fontSize: 14, marginRight: 4 },
  ratingValue: { fontSize: 14, fontWeight: '700', color: COLORS.gold, marginRight: 4 },
  reviewCount: { fontSize: 13, color: COLORS.subText },
  heartBtn: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#E0E0E0',
    alignItems: 'center', justifyContent: 'center',
  },
  heartIcon: { fontSize: 20, color: COLORS.subText },

  // Bottom bar
  bottomBar: {
    backgroundColor: COLORS.white, paddingHorizontal: 20, paddingTop: 12,
    paddingBottom: 28, borderTopWidth: 1, borderTopColor: '#E8E8E8',
  },
  messageBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.green, borderRadius: 28, paddingVertical: 16, marginBottom: 12,
    gap: 8,
  },
  messageBtnIcon: { fontSize: 18 },
  messageBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  complaintBtn: { alignItems: 'center', paddingVertical: 10 },
  complaintBtnText: { fontSize: 15, color: COLORS.subText, fontWeight: '600' },
});
