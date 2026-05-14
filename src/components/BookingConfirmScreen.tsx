import { type BookingStatus, type SharedBooking, useBookings } from '@/contexts/BookingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { getMergedTherapistRating } from '@/lib/therapistRating';
import { checkPayOSPaymentStatus, createPayOSPayment } from '@/lib/payosService';
import { debugLog } from '@/lib/debugLog';
import { clearPendingCustomerBookingBanner } from '@/lib/pendingCustomerBookingBanner';
import {
  addSavedAddress,
  computePromoDiscount,
  consumePromotionUse,
  createSharedBookingRecord,
  deleteBookingRecord,
  deleteSavedAddress,
  getSharedBookingRecordById,
  getBookingStatus,
  getOrCreateWallet,
  getSavedAddresses,
  filterTherapistsEligibleForBookingNow,
  getTherapistById,
  getTherapists,
  mergeBookingPayload,
  notifyAssignedTherapistJob,
  notifyCustomerNoApplicantsYet,
  notifyCustomerPrimaryWindowElapsed,
  notifyNewJobForCity,
  reassignSharedBookingTherapist,
  cancelSharedBookingAsCustomer,
  recordCancelledBooking,
  therapistEligibleForInstantBookNow,
  verifyPromoCode,
  walletDeduct,
  walletRefund,
} from '@/lib/supabaseService';
import { applyCustomerDistanceToTherapists } from '@/lib/location';
import type { Promotion, Therapist } from '@/lib/types';
import { replayServicesFromBooking } from '@/lib/bookingReplay';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { AppColors } from '@/constants/appColors';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import BookingMapFindingView from './BookingMapFindingView';
import ChatScreen from './ChatScreen';

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
  userId?: string;
  label?: string;
  name: string;
  phone: string;
  address: string;
  note: string;
  isDefault: boolean;
}

const DEFAULT_ADDRESS_KEY_PREFIX = 'booking_default_address:';

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Tiền mặt', icon: '💵' },
  { id: 'zena', label: 'Số dư Zena', icon: '💰' },
  { id: 'card', label: 'Thẻ Visa/MasterCard/JCB', icon: '💳' },
  { id: 'payos', label: 'Chuyển khoản QR (PayOS)', icon: '🏦' },
  { id: 'atm', label: 'Thẻ ATM (liên kết ngân hàng, tự động trừ tiền)', icon: '🏧' },
];

const PAYMENT_IDS = PAYMENT_METHODS.map((x) => x.id);

export default function BookingConfirmScreen({
  therapist,
  selectedServices,
  totalPrice,
  /** Khi tái đặt từ đơn đã huỷ ở Hoạt động — hydrate cart/địa chỉ/phương thức thanh toán đúng payload cũ. */
  reopenBookingSnapshot,
  onClose,
  onChatClose,
  resumeBookingId,
}: {
  therapist: Therapist;
  selectedServices: SelectedService[];
  totalPrice: number;
  reopenBookingSnapshot?: SharedBooking | null;
  onClose: () => void;
  /** Gọi khi user đóng chat sau khi KTV xác nhận — thường dùng để đóng luôn cả màn hình cha. */
  onChatClose?: () => void;
  /** ID đơn pending đang chờ — tự mở lại màn search và tiếp tục chờ KTV xác nhận. */
  resumeBookingId?: string;
}) {
  const router = useRouter();
  const { user } = useUser();
  const { updateStatus, refreshBookings, refreshCancelledBookings, getReviewsForTherapist } = useBookings();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const headerTopPadding = Math.max(insets.top, Platform.OS === 'ios' ? 44 : 10);
  const [subScreen, setSubScreen] = useState<'main' | 'address' | 'addAddress' | 'payment'>('main');
  const [selectedAddress, setSelectedAddress] = useState<SavedAddr | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddr[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [promoCode, setPromoCode] = useState('');
  const [cartServices, setCartServices] = useState<SelectedService[]>(selectedServices);
  const [nearbyTherapists, setNearbyTherapists] = useState<NearbyTherapist[]>([]);
  const [zenaBalance, setZenaBalance] = useState(0);

  useEffect(() => {
    if (!user?.authUid) return;
    getOrCreateWallet(user.authUid)
      .then((w) => setZenaBalance(w.balance))
      .catch(() => {});
  }, [user?.authUid]);

  useEffect(() => {
    const uid = user?.authUid;
    if (!uid) return;
    const key = `${DEFAULT_ADDRESS_KEY_PREFIX}${uid}`;
    (async () => {
      try {
        const [rows, storedDefaultId] = await Promise.all([
          getSavedAddresses(uid),
          AsyncStorage.getItem(key),
        ]);
        const mapped: SavedAddr[] = rows.map((row) => {
          const payload = row as unknown as Partial<SavedAddr> & { label?: string };
          return {
            id: row.id,
            userId: row.userId,
            label: row.label,
            name: payload.name?.trim() || row.label || user?.displayName || '',
            phone: payload.phone?.trim() || user?.phoneNumber || '',
            address: row.address,
            note: payload.note?.trim() || '',
            isDefault: Boolean(row.isDefault || (storedDefaultId && row.id === storedDefaultId)),
          };
        });

        setSavedAddresses(mapped);
        const preferred =
          mapped.find((a) => storedDefaultId && a.id === storedDefaultId) ??
          mapped.find((a) => a.isDefault) ??
          mapped[0] ??
          null;
        setSelectedAddress(preferred);
      } catch {
        setSavedAddresses([]);
      }
    })();
  }, [user?.authUid, user?.displayName, user?.phoneNumber]);

  useEffect(() => {
    if (!reopenBookingSnapshot) return;
    const rows = replayServicesFromBooking(reopenBookingSnapshot, therapist);
    if (rows.length > 0) {
      setCartServices(rows.map((s) => ({ ...s })));
    }
    const pm = reopenBookingSnapshot.paymentMethod;
    if (typeof pm === 'string' && PAYMENT_IDS.includes(pm)) {
      setPaymentMethod(pm);
    }
    setSubScreen('main');
  }, [reopenBookingSnapshot?.id, therapist.id]);

  useEffect(() => {
    const snap = reopenBookingSnapshot;
    if (!snap?.address?.trim()) return;
    const line = snap.address.trim();
    const synth: SavedAddr = {
      id: `replay:${snap.id}`,
      userId: user?.authUid,
      label: `${snap.date} • ${snap.time}`,
      name: snap.customerName?.trim() || user?.displayName || '',
      phone: snap.customerPhone?.trim() || user?.phoneNumber || '',
      address: line,
      note: '',
      isDefault: false,
    };
    const match = savedAddresses.find((a) => a.address.trim().toLowerCase() === line.toLowerCase());
    setSelectedAddress(match ?? synth);
  }, [
    reopenBookingSnapshot?.id,
    reopenBookingSnapshot?.address,
    reopenBookingSnapshot?.customerName,
    reopenBookingSnapshot?.customerPhone,
    reopenBookingSnapshot?.date,
    reopenBookingSnapshot?.time,
    savedAddresses,
    user?.authUid,
    user?.displayName,
    user?.phoneNumber,
  ]);

  useEffect(() => {
    (async () => {
      try {
        const rows = await getTherapists();
        const eligible = await filterTherapistsEligibleForBookingNow(rows);
        setNearbyTherapists(eligible.map((item) => ({
          id: item.id,
          name: item.name,
          avatar: item.avatar || 'https://picsum.photos/seed/therapist-default/200/200',
          rating: item.rating ?? 5,
          reviewCount: item.reviewCount ?? 0,
          distance: Math.max(0.2, Number(item.distanceFromCenter) || 5),
          latitude: item.currentLatitude,
          longitude: item.currentLongitude,
          locationUpdatedAt: item.locationUpdatedAt,
          workingCity: item.workingCity ?? '',
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

  const baseCartTotal = useMemo(
    () => cartServices.reduce((sum, s) => sum + s.price, 0),
    [cartServices],
  );
  const [appliedPromo, setAppliedPromo] = useState<Promotion | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);

  useEffect(() => {
    setAppliedPromo(null);
  }, [cartServices]);

  const promoDiscount = appliedPromo ? computePromoDiscount(baseCartTotal, appliedPromo) : 0;
  const cartTotal = Math.max(0, baseCartTotal - promoDiscount);
  const [showSearchScreen, setShowSearchScreen] = useState(() => Boolean(resumeBookingId));
  const [bookNowChecking, setBookNowChecking] = useState(false);

  const handleApplyPromo = async () => {
    const raw = promoCode.trim().toUpperCase();
    if (!raw) return;
    setPromoApplying(true);
    try {
      const p = await verifyPromoCode(raw);
      if (!p) {
        Alert.alert('Thông báo', 'Mã giảm giá không hợp lệ hoặc đã hết lượt.');
        return;
      }
      const discount = computePromoDiscount(baseCartTotal, p);
      if (discount <= 0) {
        Alert.alert('Thông báo', 'Đơn hàng chưa đủ điều kiện áp dụng mã này.');
        return;
      }
      setAppliedPromo(p);
    } finally {
      setPromoApplying(false);
    }
  };

  const removeService = (name: string) => {
    const next = cartServices.filter((s) => s.name !== name);
    if (next.length === 0) {
      onClose();
    } else {
      setCartServices(next);
    }
  };

  const handleConfirmAddress = async () => {
    if (!addrName.trim() || !addrPhone.trim() || !addrAddress.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng điền đầy đủ các trường bắt buộc');
      return;
    }
    if (!user?.authUid) {
      Alert.alert('Chưa đăng nhập', 'Vui lòng đăng nhập để lưu địa chỉ.');
      return;
    }
    try {
      const addressPayload = {
        userId: user.authUid,
        label: addrName.trim(),
        address: addrAddress.trim(),
        coordinates: { latitude: 0, longitude: 0 },
        isDefault: addrDefault,
        createdAt: new Date().toISOString(),
        name: addrName.trim(),
        phone: addrPhone.trim(),
        note: addrNote.trim(),
      };
      const savedId = await addSavedAddress(addressPayload as unknown as Parameters<typeof addSavedAddress>[0]);
      const newAddr: SavedAddr = {
        id: savedId,
        userId: user.authUid,
        label: addrName.trim(),
        name: addrName.trim(),
        phone: addrPhone.trim(),
        address: addrAddress.trim(),
        note: addrNote.trim(),
        isDefault: addrDefault,
      };
      const next = [
        ...(addrDefault ? savedAddresses.map((a) => ({ ...a, isDefault: false })) : savedAddresses),
        newAddr,
      ];
      setSavedAddresses(next);
      setSelectedAddress(newAddr);
      if (addrDefault) {
        await AsyncStorage.setItem(`${DEFAULT_ADDRESS_KEY_PREFIX}${user.authUid}`, savedId);
      }
      setSubScreen('main');
      // Reset form
      setAddrName(user?.displayName || '');
      setAddrPhone(user?.phoneNumber || '');
      setAddrAddress('');
      setAddrNote('');
      setAddrDefault(true);
    } catch {
      Alert.alert('Lưu địa chỉ thất bại', 'Không thể lưu địa chỉ. Vui lòng thử lại.');
    }
  };

  const handleDeleteAddress = async (addr: SavedAddr) => {
    if (!user?.authUid) return;
    Alert.alert('Xóa địa chỉ', 'Bạn có chắc chắn muốn xóa địa chỉ này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSavedAddress(addr.id);
            const remaining = savedAddresses.filter((a) => a.id !== addr.id);
            let nextSelected = selectedAddress && selectedAddress.id === addr.id ? null : selectedAddress;
            if (!nextSelected && remaining.length > 0) {
              nextSelected = remaining.find((a) => a.isDefault) ?? remaining[0];
            }
            setSavedAddresses(remaining);
            setSelectedAddress(nextSelected);

            const key = `${DEFAULT_ADDRESS_KEY_PREFIX}${user.authUid}`;
            const currentDefaultId = await AsyncStorage.getItem(key);
            if (currentDefaultId === addr.id) {
              if (nextSelected?.id) {
                await AsyncStorage.setItem(key, nextSelected.id);
              } else {
                await AsyncStorage.removeItem(key);
              }
            }
          } catch {
            Alert.alert('Xóa thất bại', 'Không thể xóa địa chỉ. Vui lòng thử lại.');
          }
        },
      },
    ]);
  };

  const handleBookNow = async () => {
    if (!selectedAddress) {
      Alert.alert('Chưa chọn địa chỉ', 'Vui lòng chọn địa chỉ trước khi đặt lịch');
      return;
    }
    setBookNowChecking(true);
    try {
      const fresh = await getTherapistById(therapist.id);
      if (fresh && !fresh.isAvailable) {
        Alert.alert(
          language === 'en' ? 'Therapist is resting' : 'Kỹ thuật viên đang nghỉ',
          language === 'en'
            ? 'This therapist is resting. Please try booking again later.'
            : 'Kỹ thuật viên này đang nghỉ ngơi, vui lòng đặt lại sau.',
        );
        return;
      }
      const ok = await therapistEligibleForInstantBookNow(therapist.id);
      if (!ok) {
        Alert.alert(
          language === 'en' ? 'Cannot book' : 'Không thể đặt lịch',
          language === 'en'
            ? 'This therapist has not registered a work shift for today or is outside working hours. Please choose another therapist.'
            : 'Kỹ thuật viên chưa đăng ký ca làm hôm nay hoặc hiện không trong khung giờ làm việc. Vui lòng chọn KTV khác.',
        );
        return;
      }
      setShowSearchScreen(true);
    } catch {
      Alert.alert(
        language === 'en' ? 'Cannot book' : 'Không thể đặt lịch',
        language === 'en'
          ? 'Could not verify therapist schedule. Please try again.'
          : 'Không kiểm tra được lịch làm của KTV. Vui lòng thử lại.',
      );
    } finally {
      setBookNowChecking(false);
    }
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
                {pm.id === 'zena' && (
                  <View style={s.zenaBalanceRow}>
                    <Text style={s.zenaBalanceText}>đ {zenaBalance.toLocaleString('vi-VN')}</Text>
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
            autoCapitalize="words"
            autoCorrect
            spellCheck
            keyboardType="default"
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
            autoCapitalize="words"
            autoCorrect
            spellCheck
            keyboardType="default"
          />

          <Text style={s.formLabel}>Ghi chú</Text>
          <TextInput
            style={[s.formInput, { height: 80, textAlignVertical: 'top' }]}
            value={addrNote}
            onChangeText={setAddrNote}
            placeholder="Ghi chú thêm (không bắt buộc)"
            placeholderTextColor="#999"
            multiline
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            keyboardType="default"
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
                <TouchableOpacity
                  onPress={() => handleDeleteAddress(addr)}
                  style={s.deleteAddrBtn}
                  hitSlop={8}
                >
                  <Text style={s.deleteAddrText}>Xóa</Text>
                </TouchableOpacity>
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
  const mergedTherapistRating = getMergedTherapistRating(
    therapist,
    getReviewsForTherapist(therapist.id),
  );

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
                  <Text style={s.ratingValue}>{mergedTherapistRating.rating.toFixed(1)}</Text>
                  <Text style={s.reviewCount}>({mergedTherapistRating.reviewCount} đánh giá)</Text>
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
            <Text style={s.paymentSelectedIcon}>{selectedPayment?.icon || '💵'}</Text>
            <Text style={s.paymentSelectedLabel}>{selectedPayment?.label || 'Tiền mặt'}</Text>
          </View>
        </View>

        {/* Promo code */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Mã giảm giá</Text>
          <View style={s.promoRow}>
            <TextInput
              style={s.promoInput}
              value={promoCode}
              onChangeText={(text) => {
                setPromoCode(text);
                setAppliedPromo(null);
              }}
              placeholder="Nhập mã giảm giá"
              placeholderTextColor="#999"
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              editable={!promoApplying}
            />
            <TouchableOpacity
              style={[s.promoBtn, promoApplying && s.promoBtnDisabled]}
              disabled={promoApplying}
              onPress={() => {
                void handleApplyPromo();
              }}
            >
              {promoApplying ? (
                <ActivityIndicator color={COLORS.green} size="small" />
              ) : (
                <Text style={s.promoBtnText}>Áp dụng</Text>
              )}
            </TouchableOpacity>
          </View>
          {appliedPromo ? (
            <Text style={s.promoAppliedHint}>
              Đã áp dụng {appliedPromo.code}: −{promoDiscount.toLocaleString('vi-VN')} đ
            </Text>
          ) : null}
        </View>

        {/* Payment details */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Chi tiết thanh toán</Text>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Tạm tính</Text>
            <Text style={s.detailValue}>{baseCartTotal.toLocaleString('vi-VN')} đ</Text>
          </View>
          {promoDiscount > 0 ? (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Giảm giá</Text>
              <Text style={[s.detailValue, { color: '#2E7D32' }]}>
                −{promoDiscount.toLocaleString('vi-VN')} đ
              </Text>
            </View>
          ) : null}
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Thanh toán</Text>
            <Text style={s.detailValue}>{cartTotal.toLocaleString('vi-VN')} đ</Text>
          </View>
          <Text style={{ fontSize: 12, color: '#666', marginTop: 10, lineHeight: 18 }}>
            {(searchTranslations[language as keyof typeof searchTranslations] || searchTranslations.vi).remoteFeeNote}
          </Text>
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
          style={[s.greenBtn, (!selectedAddress || bookNowChecking) && s.greenBtnDisabled]}
          onPress={() => {
            void handleBookNow();
          }}
          disabled={!selectedAddress || bookNowChecking}
          activeOpacity={0.8}
        >
          {bookNowChecking ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={[s.greenBtnText, !selectedAddress && s.greenBtnTextDisabled]}>Đặt ngay</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Booking Search Screen */}
      {showSearchScreen && (
        <BookingSearchModal
          therapist={therapist}
          onDismiss={() => setShowSearchScreen(false)}
          onExitBooking={onClose}
          onChatClose={onChatClose}
          existingBookingId={resumeBookingId}
          cartServices={cartServices}
          cartTotal={cartTotal}
          appliedPromotionId={appliedPromo?.id ?? null}
          addressLabel={selectedAddress?.address || 'Địa chỉ khách hàng'}
          paymentMethod={paymentMethod}
          therapists={nearbyTherapists}
          updateStatus={updateStatus}
          refreshBookings={refreshBookings}
          refreshCancelledBookings={refreshCancelledBookings}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Mock Nearby Therapists ─────────────────────────────────
/** GPS của KTV cũ hơn 20 phút thì bỏ, tránh hiện khoảng cách sai khi KTV không còn ở đó. */
const MAX_GPS_AGE_MS = 20 * 60 * 1000;

function isFreshGps(locationUpdatedAt: string | undefined): boolean {
  if (!locationUpdatedAt) return false;
  const updated = new Date(locationUpdatedAt).getTime();
  if (!Number.isFinite(updated)) return false;
  return Date.now() - updated <= MAX_GPS_AGE_MS;
}

interface NearbyTherapist {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  reviewCount: number;
  distance: number;
  latitude?: number;
  longitude?: number;
  locationUpdatedAt?: string;
  /** Dùng với applyCustomerDistanceToTherapists khi KTV chưa có GPS */
  workingCity?: string;
  /** KTV đang được đặt trong luồng này — luôn hiện trên bản đồ */
  isAssigned?: boolean;
  /** Khoảng cách thực từ vị trí khách (km), tính sau khi ghim marker */
  distanceFromUser?: number;
  /** Phụ phí đi xa (đ) khi đã chốt KTV */
  distanceSurcharge?: number;
}

/** Ghép NearbyTherapist → Therapist tối thiểu để tính lại km từ GPS khách + tỉnh/GPS KTV */
function nearbyToPseudoTherapist(n: NearbyTherapist): Therapist {
  return {
    id: n.id,
    name: n.name,
    phoneNumber: '',
    email: '',
    gender: 'female',
    avatar: n.avatar,
    bio: '',
    bioEn: '',
    specialties: [],
    experience: 0,
    rating: n.rating,
    reviewCount: n.reviewCount,
    hourlyRate: 0,
    distanceFromCenter: Number(n.distance) || 0.2,
    currentLatitude: n.latitude,
    currentLongitude: n.longitude,
    workingCity: n.workingCity ?? '',
    isAvailable: true,
    availability: {},
    languages: [],
    certifications: [],
    createdAt: '',
  };
}

/** Điểm KTV đã có tọa độ trên bản đồ + khoảng cách từ khách */
type TherapistMapPoint = NearbyTherapist & {
  coordinate: { latitude: number; longitude: number };
  distanceFromUser: number;
};

const KM_PER_DEG_LAT = 111;
/** Từ 10 km trở lên: phụ phí cố định (đồng) */
const REMOTE_DISTANCE_SURCHARGE_KM = 10;
const REMOTE_DISTANCE_SURCHARGE_VND = 100_000;

function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function stableBearingRadians(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 360) * (Math.PI / 180);
}

function coordinateAtDistanceKm(
  center: { latitude: number; longitude: number },
  distanceKm: number,
  bearingRad: number,
) {
  const d = Math.max(0.12, distanceKm);
  const cosLat = Math.cos((center.latitude * Math.PI) / 180);
  const latDelta = (d / KM_PER_DEG_LAT) * Math.cos(bearingRad);
  const lngDelta = cosLat > 1e-6 ? (d / (KM_PER_DEG_LAT * cosLat)) * Math.sin(bearingRad) : 0;
  return {
    latitude: center.latitude + latDelta,
    longitude: center.longitude + lngDelta,
  };
}

function getRemoteDistanceSurcharge(distanceKm: number): number {
  return distanceKm >= REMOTE_DISTANCE_SURCHARGE_KM ? REMOTE_DISTANCE_SURCHARGE_VND : 0;
}

const searchTranslations = {
  vi: {
    waitingTitle: 'Đang chờ {name} xác nhận...',
    autoCancel: 'Đơn đặt sẽ tự động hủy trong vòng',
    cancelOrder: 'Hủy đơn',
    cancelConfirmTitle: 'Bạn có chắc muốn hủy đơn?',
    cancelConfirmMessage:
      'Bạn thực sự muốn hủy đơn đặt lịch này? Đơn đang chờ KTV sẽ được đóng và tiền tạm giữ (nếu có) sẽ được hoàn theo quy định.',
    cancelConfirmDismiss: 'Huỷ bỏ',
    cancelConfirmAgree: 'Đồng ý',
    ktvCount: '{count} KTV đang muốn phục vụ bạn',
    replaceFor: 'thay cho {name}',
    ready: 'Sẵn sàng',
    choose: 'Chọn',
    noWaitTitle: 'Không cần chờ lâu',
    noWaitDesc: 'Các kỹ thuật viên dưới đây thấy bạn có nhu cầu đặt dịch vụ và sẵn sàng phục vụ bạn ngay lập tức',
    viewKtvList: 'Xem danh sách KTV',
    searchingNearby: 'Đang tìm kỹ thuật viên gần bạn...',
    radarHeadline: 'Đang quét quanh bạn',
    radarSub: 'Vị trí tương đối trên radar',
    mapMainTitle: 'Kỹ thuật viên quanh bạn',
    mapSubTitle: 'Vị trí và km tính theo GPS của bạn (và GPS KTV khi có)',
    mapStatusPill: 'Đang hiển thị KTV và khoảng cách từ vị trí của bạn',
    alternativesLabel: 'KTV thay thế',
    emptyAlternatives: 'Chưa có KTV nào khác sẵn sàng trong ca này.',
    viewingTherapist: 'Bạn đang xem {name}',
    viewingTherapistSub: '⭐ {rating} · {reviews} đánh giá · {km} km',
    reviewCount: 'đánh giá',
    km: 'km',
    autoCancelledTitle: 'Đơn đã bị hủy',
    autoCancelledMsg:
      'Hết 15 phút: KTV không xác nhận hoặc bạn chưa đặt được KTV thay thế. Đơn đặt đã tự động hủy.',
    primaryWaitNote: 'KTV bạn chọn có tối đa 15 phút để chấp nhận hoặc hủy. Các KTV cùng tỉnh/thành cũng thấy đơn và có thể ứng tuyển.',
    applicantsSection: 'KTV đã ứng tuyển',
    applicantsSub: 'Chọn một người để tiếp tục',
    fallbackSection: 'Gợi ý KTV gần bạn (đang rảnh)',
    fallbackSub: 'Sau 5 phút chưa có ứng tuyển — danh sách KTV gần vị trí của bạn',
    connectedState: 'Đã kết nối',
    refundedToZena: 'Số dư Zena đã được hoàn lại vào ví của bạn.',
    insufficientZenaTitle: 'Không đủ số dư Zena',
    insufficientZenaMsg: 'Vui lòng nạp tiền hoặc chọn phương thức thanh toán khác.',
    insufficientZenaSurchargeMsg:
      'Số dư Zena không đủ để cộng phụ phí đi xa (100.000đ cho KTV từ 10 km trở lên). Vui lòng nạp thêm hoặc chọn KTV gần hơn.',
    remoteFeeNote:
      'Phụ phí 100.000đ sẽ được cộng vào hoá đơn nếu KTV phục vụ cách bạn từ 10 km trở lên (theo vị trí khi đặt).',
    remoteFeeRow: 'Phụ phí khoảng cách (≥10 km)',
    remoteFeeBadge: '+100.000đ (≥10 km)',
    assignedBadge: 'Đặt lịch',
    ok: 'Đồng ý',
    connecting: 'Đang kết nối với {name}...',
    busyTitle: 'KTV đang bận',
    busyMsg: '{name} đang bận phục vụ khách khác. Vui lòng chọn kỹ thuật viên khác.',
    chooseOther: 'Chọn KTV khác',
    connected: 'Đã kết nối',
    viewDetails: 'Xem chi tiết',
    payosQrTitle: 'Quét mã PayOS',
    payosQrHint: 'Mở app ngân hàng hoặc ví để quét mã QR bên dưới.',
    payosOpenLink: 'Mở trang thanh toán',
    payosClose: 'Đóng',
    payosCreating: 'Đang tạo mã thanh toán...',
    payosWaiting: 'Đang chờ thanh toán...',
    payosExpired: 'Mã thanh toán không còn hiệu lực.',
    payosCreateFailed: 'Không tạo được thanh toán PayOS.',
    payosPendingUpdate: 'Thanh toán đã nhận, đơn đang được cập nhật. Vui lòng kiểm tra lại sau ít phút.',
    bookingTime: 'Thời gian đặt hẹn:',
    noteWarning: '❗ LƯU Ý: Zena KHÔNG cho phép hành vi: Yêu cầu hủy đơn để làm ngoài/Cung cấp thông tin liên hệ/Sử dụng các từ ngữ nhạy cảm...',
    noteWarning2: 'Vui lòng chỉ trao đổi trên Zena. Zena không chịu trách nhiệm và hỗ trợ nếu bạn liên hệ ngoài ứng dụng Zena.',
    systemNotice: '[Thông báo Zena] Khách mới, chưa hoàn thành đơn nào. KTV đến nơi, vui lòng thu tiền trước khi làm.',
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
    cancelConfirmTitle: 'Cancel this booking?',
    cancelConfirmMessage:
      'Are you sure you want to cancel? Your pending request will be closed and any hold will be refunded per policy.',
    cancelConfirmDismiss: 'Cancel',
    cancelConfirmAgree: 'Confirm',
    ktvCount: '{count} therapists want to serve you',
    replaceFor: 'instead of {name}',
    ready: 'Ready',
    choose: 'Choose',
    noWaitTitle: 'No need to wait long',
    noWaitDesc: 'The therapists below see your booking request and are ready to serve you right away',
    viewKtvList: 'View therapist list',
    searchingNearby: 'Searching for nearby therapists...',
    radarHeadline: 'Scanning around you',
    radarSub: 'Approximate positions on radar',
    mapMainTitle: 'Therapists near you',
    mapSubTitle: 'Positions and km use your GPS (and therapist GPS when available)',
    mapStatusPill: 'Showing therapists and distance from your location',
    alternativesLabel: 'Alternatives',
    emptyAlternatives: 'No other therapists are available to switch right now.',
    viewingTherapist: 'Viewing {name}',
    viewingTherapistSub: '⭐ {rating} · {reviews} reviews · {km} km',
    reviewCount: 'reviews',
    km: 'km',
    autoCancelledTitle: 'Order Cancelled',
    autoCancelledMsg:
      'After 15 minutes: the therapist did not confirm or you did not book a replacement. Your booking was automatically cancelled.',
    primaryWaitNote:
      'Your chosen therapist has up to 15 minutes to accept or decline. Therapists in the same city also see this job and can apply.',
    applicantsSection: 'Therapists who applied',
    applicantsSub: 'Pick one to continue',
    fallbackSection: 'Nearby suggestions (available)',
    fallbackSub: 'No applications after 5 minutes — therapists near your location',
    connectedState: 'Connected',
    refundedToZena: 'Your Zena balance has been refunded to your wallet.',
    insufficientZenaTitle: 'Insufficient Zena balance',
    insufficientZenaMsg: 'Please top up or choose another payment method.',
    insufficientZenaSurchargeMsg:
      'Your Zena balance is not enough for the remote distance fee (100,000đ for therapists 10+ km away). Please top up or pick a closer therapist.',
    remoteFeeNote:
      'A 100,000đ distance surcharge applies if the serving therapist is 10 km or farther from you (at booking time).',
    remoteFeeRow: 'Distance fee (≥10 km)',
    remoteFeeBadge: '+100,000đ (≥10 km)',
    assignedBadge: 'Your booking',
    ok: 'OK',
    connecting: 'Connecting to {name}...',
    busyTitle: 'Therapist Busy',
    busyMsg: '{name} is currently serving another client. Please choose a different therapist.',
    chooseOther: 'Choose Another',
    connected: 'Connected',
    viewDetails: 'View details',
    payosQrTitle: 'Scan PayOS QR',
    payosQrHint: 'Open your banking or wallet app and scan the QR code below.',
    payosOpenLink: 'Open payment page',
    payosClose: 'Close',
    payosCreating: 'Creating payment QR...',
    payosWaiting: 'Waiting for payment...',
    payosExpired: 'The payment code is no longer valid.',
    payosCreateFailed: 'Could not create PayOS payment.',
    payosPendingUpdate: 'Payment received, booking is being updated. Please check again in a moment.',
    bookingTime: 'Booking time:',
    noteWarning: '❗ NOTE: Zena does NOT allow: Requesting cancellation to work outside/Sharing contact information/Using inappropriate language...',
    noteWarning2: 'Please only communicate on Zena. Zena is not responsible if you contact outside the app.',
    systemNotice: '[Zena Notice] New customer, no completed orders yet. Please collect payment before starting service.',
    greeting: 'Hello!',
    translate: 'Translate',
    library: 'Library',
    location: 'Location',
    typeMessage: 'Message',
    newCustomer: 'New customer',
    collectFirst: 'Collect payment first',
  },
};

/** Ghim KTV quanh vị trí khách: góc ổn định theo id (không nhảy mỗi lần render), khoảng cách hiển thị = haversine thực. */
function generateNearbyPositions(
  center: { latitude: number; longitude: number },
  therapists: NearbyTherapist[],
): TherapistMapPoint[] {
  const rows: TherapistMapPoint[] = therapists.map((t) => {
    const hasFreshGps =
      Number.isFinite(t.latitude) &&
      Number.isFinite(t.longitude) &&
      isFreshGps(t.locationUpdatedAt);
    const hasExactCoordinate = hasFreshGps;
    const coordinate = hasExactCoordinate
      ? { latitude: Number(t.latitude), longitude: Number(t.longitude) }
      : coordinateAtDistanceKm(
          center,
          Math.max(0.12, Number(t.distance) || 0.12),
          stableBearingRadians(t.id),
        );
    const distanceFromUser = Math.round(haversineKm(center, coordinate) * 10) / 10;
    return {
      ...t,
      coordinate,
      distanceFromUser,
    };
  });
  return rows.sort((a, b) => a.distanceFromUser - b.distanceFromUser);
}

// Default to Ha Noi if location not available
const DEFAULT_LOCATION = { latitude: 21.0285, longitude: 105.8542 };

// ─── Booking Search Modal ───────────────────────────────────
function BookingSearchModal({
  therapist,
  onDismiss,
  onExitBooking,
  onChatClose,
  existingBookingId,
  cartServices,
  cartTotal,
  appliedPromotionId = null,
  addressLabel,
  paymentMethod,
  therapists,
  updateStatus,
  refreshBookings,
  refreshCancelledBookings,
}: {
  therapist: Therapist;
  /** Chỉ tắt overlay tìm KTV — KHÔNG unmount cả BookingConfirmScreen (tránh crash bản đồ / Modal lồng). */
  onDismiss: () => void;
  /** Đóng hẳn luồng đặt lịch (từ màn Thông tin đặt lịch). */
  onExitBooking: () => void;
  /** Đóng hết màn hình khi user back từ chat sau khi KTV xác nhận. */
  onChatClose?: () => void;
  /** Tiếp tục đơn pending đã tạo trước — bỏ qua bước tạo đơn mới. */
  existingBookingId?: string;
  cartServices: SelectedService[];
  cartTotal: number;
  appliedPromotionId?: string | null;
  addressLabel: string;
  paymentMethod: string;
  therapists: NearbyTherapist[];
  updateStatus: (bookingId: string, status: BookingStatus) => void;
  refreshBookings: () => Promise<void>;
  refreshCancelledBookings: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const floatingTop = Math.max(insets.top, Platform.OS === 'ios' ? 44 : 16);
  const { language } = useLanguage();
  const strings = searchTranslations[language as keyof typeof searchTranslations] || searchTranslations.vi;
  const { user } = useUser();

  /** Luôn gồm KTV đang đặt + các KTV khác (tránh trùng id) — dùng để ghim map & tính khoảng cách */
  const therapistsForMapBase = useMemo((): NearbyTherapist[] => {
    const assigned: NearbyTherapist = {
      id: therapist.id,
      name: therapist.name,
      avatar:
        therapist.avatar?.trim() ||
        'https://picsum.photos/seed/therapist-default/200/200',
      rating: therapist.rating,
      reviewCount: therapist.reviewCount,
      distance: Math.max(0.12, Number(therapist.distanceFromCenter) || 0.5),
      latitude: therapist.currentLatitude,
      longitude: therapist.currentLongitude,
      locationUpdatedAt: therapist.locationUpdatedAt,
      workingCity: therapist.workingCity ?? '',
      isAssigned: true,
    };
    const rest = therapists.filter((x) => x.id !== therapist.id);
    return [assigned, ...rest];
  }, [therapist, therapists]);

  const holdReferenceIdRef = useRef(
    `zena-wait-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  );
  const zenaWalletHeldRef = useRef(false);
  const refundIssuedRef = useRef(false);

  const [countdown, setCountdown] = useState(15 * 60);
  const [showPopup, setShowPopup] = useState(false);
  const [highlightedTherapistId, setHighlightedTherapistId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState(DEFAULT_LOCATION);
  const userLocationRef = useRef(DEFAULT_LOCATION);
  userLocationRef.current = userLocation;
  const [connectingTherapist, setConnectingTherapist] = useState<NearbyTherapist | null>(null);
  const [nearbyPositions, setNearbyPositions] = useState<TherapistMapPoint[]>([]);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(existingBookingId ?? null);
  const [activeTherapistId, setActiveTherapistId] = useState(therapist.id);
  const [chatBookingId, setChatBookingId] = useState<string | null>(null);
  const [payosPaid, setPayosPaid] = useState(paymentMethod !== 'payos');
  const [showPayosQr, setShowPayosQr] = useState(false);
  const [payosQrCode, setPayosQrCode] = useState('');
  const [payosCheckoutUrl, setPayosCheckoutUrl] = useState('');
  const [payosAmount, setPayosAmount] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  /** Gỡ Mapbox khỏi cây React trước khi đóng overlay — tránh crash native khi unmount đồng thời với Modal. */
  const [detachMapSurface, setDetachMapSurface] = useState(false);
  const leaveTransitionLockRef = useRef(false);
  const createdBookingIdRef = useRef<string | null>(existingBookingId ?? null);
  const activeTherapistIdRef = useRef(therapist.id);
  const payosPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bootstrappedBookingRef = useRef(Boolean(existingBookingId));
  const isMountedRef = useRef(true);
  useEffect(() => { return () => { isMountedRef.current = false; }; }, []);
  const [liveBookingRow, setLiveBookingRow] = useState<Record<string, unknown> | null>(null);
  const [primarySeconds, setPrimarySeconds] = useState(15 * 60);

  const [liveTherapistById, setLiveTherapistById] = useState<
    Record<string, { latitude?: number; longitude?: number; distance?: number }>
  >({});

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const rows = await getTherapists({ bypassCache: true });
        const eligible = await filterTherapistsEligibleForBookingNow(rows);
        const next: Record<string, { latitude?: number; longitude?: number; locationUpdatedAt?: string; distance?: number }> = {};
        for (const r of eligible) {
          next[r.id] = {
            latitude: r.currentLatitude,
            longitude: r.currentLongitude,
            locationUpdatedAt: r.locationUpdatedAt,
            distance: Math.max(0.1, Number(r.distanceFromCenter) || 0),
          };
        }
        if (!cancelled) setLiveTherapistById(next);
      } catch {
        /* empty */
      }
    };
    void tick();
    const iv = setInterval(tick, 18000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const therapistsForMapMerged = useMemo(() => {
    return therapistsForMapBase.map((t) => {
      const L = liveTherapistById[t.id];
      if (!L) return t;
      return {
        ...t,
        ...(typeof L.latitude === 'number' && typeof L.longitude === 'number'
          ? { latitude: L.latitude, longitude: L.longitude, locationUpdatedAt: L.locationUpdatedAt }
          : {}),
        ...(typeof L.distance === 'number' && Number.isFinite(L.distance)
          ? { distance: Math.max(0.1, L.distance) }
          : {}),
      };
    });
  }, [therapistsForMapBase, liveTherapistById]);

  const therapistsForMap = useMemo(() => {
    const pseudo = therapistsForMapMerged.map(nearbyToPseudoTherapist);
    const adj = applyCustomerDistanceToTherapists(pseudo, userLocation);
    return therapistsForMapMerged.map((n, i) => {
      const a = adj[i];
      if (!a) return n;
      const d = a.distanceFromCenter;
      const distOk = typeof d === 'number' && Number.isFinite(d) && d !== Number.POSITIVE_INFINITY;
      return {
        ...n,
        distance: distOk ? Math.max(0.1, d) : n.distance,
        latitude: a.currentLatitude ?? n.latitude,
        longitude: a.currentLongitude ?? n.longitude,
      };
    });
  }, [therapistsForMapMerged, userLocation]);

  const releaseZenaWalletHold = useCallback(async () => {
    if (refundIssuedRef.current) return;
    if (paymentMethod !== 'zena' || !zenaWalletHeldRef.current) return;
    const uid = user?.authUid;
    const amount = Math.round(Number(cartTotal));
    if (!uid || amount <= 0) return;
    refundIssuedRef.current = true;
    try {
      await walletRefund(
        uid,
        amount,
        'Hoàn tiền — hết thời gian chờ xác nhận KTV / huỷ đơn',
        holdReferenceIdRef.current,
      );
    } catch {
      refundIssuedRef.current = false;
    }
  }, [paymentMethod, user?.authUid, cartTotal]);

  /**
   * Build snapshot 1 đơn huỷ để ghi vào bảng `cancelled_bookings` (Activity → tab "Đã huỷ").
   * Lấy mọi info từ giỏ hàng + KTV được nhắm đặt + địa chỉ + user hiện tại.
   */
  const buildCancellationSnapshot = useCallback(
    (opts: { bookingId?: string | null; reason: string; cancelledBy?: 'customer' | 'system' }) => {
      const assignedId = activeTherapistIdRef.current || therapist.id;
      const assigned =
        therapistsForMap.find((t) => t.id === assignedId) ??
        ({
          id: therapist.id,
          name: therapist.name,
          avatar: therapist.avatar,
        } as NearbyTherapist);
      const now = new Date();
      return {
        bookingId: opts.bookingId ?? null,
        customerUserId: user?.authUid || user?.phoneNumber || null,
        customerPhone: user?.phoneNumber || user?.email || null,
        customerName: user?.displayName || user?.email || user?.phoneNumber || 'Khách',
        customerEmail: user?.email || null,
        therapistId: assigned?.id || null,
        therapistName: assigned?.name || therapist.name,
        therapistAvatar: assigned?.avatar || therapist.avatar || null,
        service: cartServices.map((s) => s.name).join(', '),
        date: now.toISOString().slice(0, 10),
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        address: addressLabel,
        price: Math.max(0, Math.round(Number(cartTotal) || 0)),
        paymentMethod,
        cancelReason: opts.reason,
        cancelledBy: opts.cancelledBy ?? 'customer',
        cancelledAt: now.toISOString(),
        customerCartSnapshot: cartServices.map((s) => ({
          name: s.name,
          duration: s.duration,
          price: s.price,
        })),
        customerLat: Number.isFinite(userLocation?.latitude) ? userLocation.latitude : null,
        customerLng: Number.isFinite(userLocation?.longitude) ? userLocation.longitude : null,
        extras: {
          appliedPromotionId: appliedPromotionId ?? null,
          requestedTherapistId: therapist.id,
        },
      };
    },
    [
      addressLabel,
      appliedPromotionId,
      cartServices,
      cartTotal,
      paymentMethod,
      therapist,
      therapistsForMap,
      user?.authUid,
      user?.displayName,
      user?.email,
      user?.phoneNumber,
      userLocation,
    ],
  );

  const runCancelSideEffectsAfterDismiss = useCallback(() => {
    void (async () => {
      try {
        if (payosPollRef.current) {
          clearInterval(payosPollRef.current);
          payosPollRef.current = null;
        }
        const bid = createdBookingIdRef.current;
        // Luôn ghi vào bảng `cancelled_bookings` — kể cả khi backend RPC fail
        // hoặc đơn chưa kịp ghi vào `bookings` (mạng chậm) → vẫn xuất hiện ở Activity.
        await recordCancelledBooking(
          buildCancellationSnapshot({
            bookingId: bid,
            reason: 'customer_cancelled',
            cancelledBy: 'customer',
          }),
        ).catch(() => null);
        if (bid) {
          await cancelSharedBookingAsCustomer(
            bid,
            user?.authUid ?? undefined,
            'customer_cancelled',
          ).catch(() => false);
          updateStatus(bid, 'cancelled');
          await refreshBookings().catch(() => {});
        }
        await refreshCancelledBookings().catch(() => {});
        await releaseZenaWalletHold();
      } catch {
        /* empty */
      }
    })();
  }, [
    buildCancellationSnapshot,
    refreshBookings,
    refreshCancelledBookings,
    releaseZenaWalletHold,
    updateStatus,
    user?.authUid,
  ]);

  const handleExitSearch = useCallback(() => {
    if (leaveTransitionLockRef.current) {
      return;
    }
    leaveTransitionLockRef.current = true;
    void clearPendingCustomerBookingBanner().catch(() => {});
    requestAnimationFrame(() => {
      setDetachMapSurface(true);
    });
  }, []);

  // Đóng chat khi booking đã confirmed — KHÔNG huỷ đơn, chỉ đóng overlay.
  const handleChatClose = useCallback(() => {
    void clearPendingCustomerBookingBanner().catch(() => {});
    if (onChatClose) {
      onChatClose();
    } else {
      onExitBooking();
    }
  }, [onChatClose, onExitBooking]);

  useEffect(() => {
    createdBookingIdRef.current = createdBookingId;
  }, [createdBookingId]);

  useEffect(() => {
    activeTherapistIdRef.current = activeTherapistId;
  }, [activeTherapistId]);

  useEffect(() => {
    if (!detachMapSurface) {
      return undefined;
    }
    const delayMs = Platform.OS === 'android' ? 280 : 220;
    const id = setTimeout(() => {
      onDismiss();
      runCancelSideEffectsAfterDismiss();
      leaveTransitionLockRef.current = false;
    }, delayMs);
    return () => {
      clearTimeout(id);
      leaveTransitionLockRef.current = false;
    };
  }, [detachMapSurface, onDismiss, runCancelSideEffectsAfterDismiss]);

  const handleCancelOrderPress = useCallback(() => {
    setShowCancelConfirm(true);
  }, []);

  const confirmCancelOrder = useCallback(() => {
    setShowCancelConfirm(false);
    handleExitSearch();
  }, [handleExitSearch]);

  // Khoá nút back cứng Android trên màn chờ KTV — chỉ thoát qua Huỷ đơn / KTV xác nhận / hết hạn.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (chatBookingId) {
        return false;
      }
      return true;
    });
    return () => sub.remove();
  }, [chatBookingId]);

  const therapistsForMapRef = useRef(therapistsForMap);
  therapistsForMapRef.current = therapistsForMap;

  // GPS một lần khi mở modal — không gắn vào `therapistsForMap` (tránh refetch + giật map).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) {
            setNearbyPositions(generateNearbyPositions(DEFAULT_LOCATION, therapistsForMapRef.current));
          }
          return;
        }
        let seed = DEFAULT_LOCATION;
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (
            last?.coords &&
            Number.isFinite(last.coords.latitude) &&
            Number.isFinite(last.coords.longitude)
          ) {
            seed = { latitude: last.coords.latitude, longitude: last.coords.longitude };
          }
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          setUserLocation(seed);
          setNearbyPositions(generateNearbyPositions(seed, therapistsForMapRef.current));
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        if (!cancelled) {
          setUserLocation(coords);
          setNearbyPositions(generateNearbyPositions(coords, therapistsForMapRef.current));
        }
      } catch {
        if (!cancelled) {
          setUserLocation(DEFAULT_LOCATION);
          setNearbyPositions(generateNearbyPositions(DEFAULT_LOCATION, therapistsForMapRef.current));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setNearbyPositions(generateNearbyPositions(userLocation, therapistsForMap));
  }, [therapistsForMap, userLocation]);

  const radarMarkers = useMemo(
    () =>
      nearbyPositions.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        latitude: p.coordinate.latitude,
        longitude: p.coordinate.longitude,
        rating: p.rating,
        reviewCount: p.reviewCount,
        isAssigned: p.id === activeTherapistId,
      })),
    [nearbyPositions, activeTherapistId],
  );

  // Trừ ví Zena khi vào màn chờ KTV; nếu đóng trước khi RPC xong thì hoàn lại ngay.
  useEffect(() => {
    if (paymentMethod !== 'zena') return;
    const uid = user?.authUid;
    const amount = Math.round(Number(cartTotal));
    if (!uid || amount <= 0) return;
    if (zenaWalletHeldRef.current) return;

    let unmounted = false;
    const refId = holdReferenceIdRef.current;
    (async () => {
      try {
        await walletDeduct(
          uid,
          amount,
          'payment',
          'Tạm giữ — chờ KTV xác nhận (tối đa 15 phút)',
          refId,
        );
        if (unmounted) {
          try {
            await walletRefund(
              uid,
              amount,
              'Hoàn tiền — đóng màn hình trước khi khóa giao dịch',
              refId,
            );
          } catch {
            /* empty */
          }
          return;
        }
        zenaWalletHeldRef.current = true;
      } catch {
        if (!unmounted) {
          Alert.alert(strings.insufficientZenaTitle, strings.insufficientZenaMsg, [
            { text: strings.ok, onPress: onDismiss },
          ]);
        }
      }
    })();
    return () => {
      unmounted = true;
    };
  }, [
    paymentMethod,
    user?.authUid,
    cartTotal,
    strings.insufficientZenaTitle,
    strings.insufficientZenaMsg,
    strings.ok,
    onDismiss,
  ]);

  useEffect(() => {
    if (chatBookingId) return;
    const timer = setInterval(() => {
      setPrimarySeconds((p) => Math.max(0, p - 1));
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void (async () => {
            // Ghi snapshot vào bảng `cancelled_bookings` ngay cả khi chưa có bookingId.
            await recordCancelledBooking(
              buildCancellationSnapshot({
                bookingId: createdBookingId,
                reason: 'timeout_no_confirmation',
                cancelledBy: 'system',
              }),
            ).catch(() => null);
            if (createdBookingId) {
              await cancelSharedBookingAsCustomer(
                createdBookingId,
                user?.authUid ?? undefined,
                'timeout_no_confirmation',
              ).catch(() => false);
              updateStatus(createdBookingId, 'cancelled');
              await refreshBookings().catch(() => {});
            }
            await refreshCancelledBookings().catch(() => {});
            await releaseZenaWalletHold();
            const detailMsg =
              paymentMethod === 'zena'
                ? `${strings.autoCancelledMsg}\n\n${strings.refundedToZena}`
                : strings.autoCancelledMsg;
            Alert.alert(
              strings.autoCancelledTitle,
              detailMsg,
              [{ text: strings.ok, onPress: onExitBooking }],
              { cancelable: false },
            );
          })();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [
    buildCancellationSnapshot,
    chatBookingId,
    createdBookingId,
    strings,
    onExitBooking,
    paymentMethod,
    releaseZenaWalletHold,
    refreshBookings,
    refreshCancelledBookings,
    updateStatus,
    user?.authUid,
  ]);

  useEffect(() => {
    if (createdBookingId) {
      setPrimarySeconds(15 * 60);
    }
  }, [createdBookingId]);

  useEffect(() => {
    if (!createdBookingId) return;
    const timer = setTimeout(() => setShowPopup(true), 3000);
    return () => clearTimeout(timer);
  }, [createdBookingId]);

  const stopPayosPolling = useCallback(() => {
    if (payosPollRef.current) {
      clearInterval(payosPollRef.current);
      payosPollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPayosPolling(), [stopPayosPolling]);

  useEffect(() => {
    debugLog('booking-search-chat', {
      createdBookingId,
      chatBookingId,
      activeTherapistId,
      paymentMethod,
    });
  }, [activeTherapistId, chatBookingId, createdBookingId, paymentMethod]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }, []);

  const currentAssignedTherapist = useMemo(() => {
    return (
      nearbyPositions.find((item) => item.id === activeTherapistId) ??
      therapistsForMap.find((item) => item.id === activeTherapistId) ??
      therapistsForMap[0] ??
      null
    );
  }, [activeTherapistId, nearbyPositions, therapistsForMap]);
  const assignedName = currentAssignedTherapist?.name || therapist.name;
  const suggestedTherapists = nearbyPositions.filter((item) => item.id !== activeTherapistId);
  const currentCityLabel = user?.selectedCity || user?.workingCity || 'Hà Nội';

  const liveApplications = useMemo(() => {
    const raw = liveBookingRow?.applications;
    if (!Array.isArray(raw)) {
      return [];
    }
    const out: { therapistId: string; therapistName: string; therapistAvatar?: string }[] = [];
    for (const row of raw) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      const o = row as Record<string, unknown>;
      if (typeof o.therapistId !== 'string' || typeof o.therapistName !== 'string') {
        continue;
      }
      out.push({
        therapistId: o.therapistId,
        therapistName: o.therapistName,
        therapistAvatar: typeof o.therapistAvatar === 'string' ? o.therapistAvatar : undefined,
      });
    }
    return out;
  }, [liveBookingRow]);

  useEffect(() => {
    if (liveBookingRow && String(liveBookingRow.primaryAction ?? 'pending') !== 'pending') {
      setPrimarySeconds(0);
    }
  }, [liveBookingRow]);

  const highlightedPoint = useMemo(
    () => nearbyPositions.find((p) => p.id === highlightedTherapistId) ?? null,
    [nearbyPositions, highlightedTherapistId],
  );

  const getTherapistPricing = useCallback(
    (t: NearbyTherapist | TherapistMapPoint) => {
      const rawDistance =
        'distanceFromUser' in t && typeof t.distanceFromUser === 'number'
          ? t.distanceFromUser
          : Number(t.distance) || 0;
      const distanceKm = Math.max(0, Math.round(rawDistance * 10) / 10);
      const surcharge = getRemoteDistanceSurcharge(distanceKm);
      return {
        distanceKm,
        surcharge,
        finalTotal: cartTotal + surcharge,
      };
    },
    [cartTotal],
  );

  const buildAssignedBookingPayload = useCallback(
    (
      t: TherapistMapPoint,
      dist: number,
      finalTotal: number,
      now: Date,
      effectivePaymentMethod: string,
      jobCity: string,
      coords: { latitude: number; longitude: number },
    ) => ({
      customerUserId: user?.authUid || user?.phoneNumber || 'test-user',
      customerName: user?.displayName || user?.email || user?.phoneNumber || 'Khách',
      customerPhone: user?.phoneNumber || user?.email || '',
      therapistId: t.id,
      therapistName: t.name,
      therapistAvatar: t.avatar || '',
      service: cartServices.map((s) => s.name).join(', '),
      /** Lưu giỏ hàng chi tiết để Hoạt động → “Đặt lại” tái đúng dịch vụ/phút/giá. */
      customerCartSnapshot: cartServices.map((s) => ({ name: s.name, duration: s.duration, price: s.price })),
      date: now.toISOString().slice(0, 10),
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      address: addressLabel,
      price: finalTotal,
      status: 'pending',
      paymentMethod: effectivePaymentMethod,
      paymentStatus: effectivePaymentMethod === 'cash' ? 'unpaid' : 'pending',
      distanceKm: dist,
      assignmentFlow: 'nominated_city_broadcast',
      jobCity,
      requestedTherapistId: t.id,
      primaryAction: 'pending',
      applications: [],
      skippedTherapistIds: [],
      broadcastClosed: false,
      fallbackSuggested: false,
      customerUiPhase: 'awaiting_primary',
      customerLat: coords.latitude,
      customerLng: coords.longitude,
    }),
    [addressLabel, cartServices, user?.authUid, user?.displayName, user?.email, user?.phoneNumber],
  );

  const startPayosPolling = useCallback(
    (orderCode: number, bookingId: string) => {
      stopPayosPolling();
      let attempts = 0;
      payosPollRef.current = setInterval(async () => {
        attempts += 1;
        if (attempts > 72) {
          stopPayosPolling();
          setShowPayosQr(false);
          setPayosAmount(0);
          Alert.alert('PayOS', strings.payosExpired);
          return;
        }
        try {
          const res = await checkPayOSPaymentStatus(orderCode);
          if (res.success && res.data?.status === 'PAID') {
            stopPayosPolling();
            setShowPayosQr(false);
            setPayosQrCode('');
            setPayosCheckoutUrl('');
            setPayosAmount(0);
            try {
              await mergeBookingPayload(
                bookingId,
                {
                  paymentMethod: 'payos',
                  paymentStatus: 'paid',
                  paidAt: new Date().toISOString(),
                  payosOrderCode: orderCode,
                },
              );
              setPayosPaid(true);
            } catch {
              Alert.alert('PayOS', strings.payosPendingUpdate);
              return;
            }
            const status = await getBookingStatus(bookingId);
            if (status === 'confirmed' || status === 'in-progress') {
              setChatBookingId(bookingId);
            }
          } else if (res.success && (res.data?.status === 'CANCELLED' || res.data?.status === 'EXPIRED')) {
            stopPayosPolling();
            setShowPayosQr(false);
            setPayosQrCode('');
            setPayosCheckoutUrl('');
            setPayosAmount(0);
            Alert.alert('PayOS', strings.payosExpired);
          }
        } catch {
          /* retry */
        }
      }, 5000);
    },
    [stopPayosPolling, strings.payosExpired, strings.payosPendingUpdate],
  );

  useEffect(() => {
    if (bootstrappedBookingRef.current || !currentAssignedTherapist) return;
    bootstrappedBookingRef.current = true;

    let cancelled = false;
    void (async () => {
      const now = new Date();
      const { distanceKm, finalTotal } = getTherapistPricing(currentAssignedTherapist);
      try {
        const jobCity = user?.selectedCity || user?.workingCity || currentCityLabel;
        const bookingPayload = buildAssignedBookingPayload(
          currentAssignedTherapist as TherapistMapPoint,
          distanceKm,
          finalTotal,
          now,
          paymentMethod,
          jobCity,
          userLocationRef.current,
        );
        const bookingId = await createSharedBookingRecord(bookingPayload);
        if (cancelled && !isMountedRef.current) {
          // Component truly unmounted — clean up orphan booking.
          await deleteBookingRecord(bookingId).catch(() => {});
          return;
        }
        createdBookingIdRef.current = bookingId;
        setCreatedBookingId(bookingId);
        if (paymentMethod === 'zena') {
          await mergeBookingPayload(bookingId, {
            zenaHoldReferenceId: holdReferenceIdRef.current,
            zenaHoldAmount: Math.round(Number(cartTotal)),
          }).catch(() => {});
        }
        if (appliedPromotionId) {
          const consumed = await consumePromotionUse(appliedPromotionId);
          if (!consumed) {
            debugLog('booking-promo-consume-failed', { appliedPromotionId, bookingId });
          }
        }
        notifyAssignedTherapistJob(
          currentAssignedTherapist.id,
          bookingId,
          user?.displayName || user?.email || user?.phoneNumber || 'Khách',
          cartServices.map((s) => s.name).join(', '),
          bookingPayload.date,
          bookingPayload.time,
          addressLabel,
        ).catch((e) => console.warn('[Booking] notifyAssignedTherapistJob failed:', e));

        notifyNewJobForCity(
          jobCity,
          bookingId,
          user?.displayName || user?.email || user?.phoneNumber || 'Khách',
          cartServices.map((s) => s.name).join(', '),
          bookingPayload.date,
          bookingPayload.time,
          addressLabel,
          currentAssignedTherapist.id,
        ).catch((e) => console.warn('[Booking] notifyNewJobForCity failed:', e));

        if (paymentMethod === 'payos' && user?.authUid) {
          const payosRes = await createPayOSPayment(user.authUid, finalTotal, 'Dat lich Zena', bookingId);
          if (!payosRes.success || !payosRes.data) {
            Alert.alert('PayOS', payosRes.message || strings.payosCreateFailed);
            return;
          }
          setPayosQrCode(payosRes.data.qrCode);
          setPayosCheckoutUrl(payosRes.data.checkoutUrl);
          setPayosAmount(finalTotal);
          setShowPayosQr(true);
          startPayosPolling(payosRes.data.orderCode, bookingId);
        }
      } catch (err) {
        if (!cancelled) {
          Alert.alert(
            language === 'en' ? 'Booking error' : 'Lỗi đặt lịch',
            (err as Error)?.message || (language === 'en' ? 'Could not create booking.' : 'Không thể tạo đơn đặt lịch.'),
            [{ text: strings.ok, onPress: onExitBooking }],
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    addressLabel,
    buildAssignedBookingPayload,
    cartServices,
    currentAssignedTherapist,
    getTherapistPricing,
    language,
    onExitBooking,
    paymentMethod,
    startPayosPolling,
    strings.ok,
    strings.payosCreateFailed,
    user?.authUid,
    user?.displayName,
    user?.email,
    user?.phoneNumber,
    appliedPromotionId,
    currentCityLabel,
    user?.selectedCity,
    user?.workingCity,
  ]);

  useEffect(() => {
    if (!createdBookingId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const booking = await getSharedBookingRecordById(createdBookingId);
        if (cancelled || !booking) return;

        setLiveBookingRow(booking);

        const status = String(booking.status ?? '');
        const nextTherapistId = typeof booking.therapistId === 'string' ? booking.therapistId : '';
        if (nextTherapistId) {
          setActiveTherapistId(nextTherapistId);
        }

        const customerUid = typeof user?.authUid === 'string' ? user.authUid : '';
        const assignmentFlow = String(booking.assignmentFlow ?? '');
        const createdRaw = booking.createdAt;
        const createdMs =
          createdRaw != null && (typeof createdRaw === 'string' || typeof createdRaw === 'number')
            ? new Date(createdRaw as string | number).getTime()
            : Date.now();
        const elapsed = Date.now() - createdMs;
        const applicantList = Array.isArray(booking.applications) ? booking.applications : [];
        const applicantCount = applicantList.length;

        if (assignmentFlow === 'nominated_city_broadcast' && customerUid) {
          if (elapsed >= 5 * 60 * 1000 && !booking.fallbackSuggested && applicantCount === 0) {
            await mergeBookingPayload(createdBookingId, {
              fallbackSuggested: true,
              customerUiPhase: 'fallback_suggestions',
            }).catch(() => {});
            await notifyCustomerNoApplicantsYet(customerUid, createdBookingId).catch(() => {});
          }
          if (elapsed >= 15 * 60 * 1000 && String(booking.primaryAction ?? 'pending') === 'pending') {
            await mergeBookingPayload(createdBookingId, { primaryAction: 'timeout' }).catch(() => {});
            await notifyCustomerPrimaryWindowElapsed(customerUid, createdBookingId, applicantCount).catch(
              () => {},
            );
          }
        }

        if (status === 'cancelled') {
          await releaseZenaWalletHold();
          onDismiss();
          return;
        }

        if ((status === 'confirmed' || status === 'in-progress') && (paymentMethod !== 'payos' || payosPaid)) {
          setChatBookingId(createdBookingId);
        }
      } catch {
        // Polling is best-effort.
      }
    };

    void poll();
    const intervalId = setInterval(() => {
      void poll();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [createdBookingId, onDismiss, paymentMethod, payosPaid, releaseZenaWalletHold, user?.authUid]);

  const handleChooseTherapist = (t: TherapistMapPoint) => {
    if (!createdBookingId || !currentAssignedTherapist || t.id === activeTherapistId) return;
    setConnectingTherapist(t);
    setTimeout(() => {
      void (async () => {
        try {
          const uid = user?.authUid;
          const currentPricing = getTherapistPricing(currentAssignedTherapist);
          const nextPricing = getTherapistPricing(t);
          if (paymentMethod === 'zena' && uid) {
            const surchargeDelta = nextPricing.surcharge - currentPricing.surcharge;
            if (surchargeDelta > 0) {
              await walletDeduct(
                uid,
                surchargeDelta,
                'payment',
                language === 'en' ? 'Remote distance fee adjustment' : 'Điều chỉnh phụ phí khoảng cách',
                `${holdReferenceIdRef.current}-km-${t.id}`,
              );
            }
          }

          await reassignSharedBookingTherapist(createdBookingId, {
            therapistId: t.id,
            therapistName: t.name,
            therapistAvatar: t.avatar || '',
            price: nextPricing.finalTotal,
            distanceKm: nextPricing.distanceKm,
          });
          const flowSnap = await getSharedBookingRecordById(createdBookingId);
          if (flowSnap && String(flowSnap.assignmentFlow) === 'nominated_city_broadcast') {
            await mergeBookingPayload(
              createdBookingId,
              { assignmentFlow: null, broadcastClosed: true },
              'confirmed',
            );
          }
          notifyAssignedTherapistJob(
            t.id,
            createdBookingId,
            user?.displayName || user?.email || user?.phoneNumber || 'Khách',
            cartServices.map((s) => s.name).join(', '),
            new Date().toISOString().slice(0, 10),
            `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
            addressLabel,
          ).catch((e) => console.warn('[Booking] notifyAssignedTherapistJob (swap) failed:', e));
          setActiveTherapistId(t.id);
          setShowPopup(false);
        } catch {
          try {
            const uid = user?.authUid;
            if (paymentMethod === 'zena' && uid) {
              Alert.alert(strings.insufficientZenaTitle, strings.insufficientZenaSurchargeMsg, [
                { text: strings.ok },
              ]);
            } else {
              Alert.alert(
                language === 'en' ? 'Cannot change therapist' : 'Không thể đổi kỹ thuật viên',
                language === 'en' ? 'Please try again.' : 'Vui lòng thử lại.',
              );
            }
          } finally {
            setConnectingTherapist(null);
          }
        }
        setConnectingTherapist(null);
      })();
    }, 700);
  };

  const resolveTherapistMapPoint = useCallback(
    (id: string): TherapistMapPoint | null => {
      const pool: NearbyTherapist[] = [...therapistsForMap, ...suggestedTherapists];
      const hit = pool.find((x) => x.id === id);
      if (!hit) {
        return null;
      }
      const lat = hit.latitude != null ? Number(hit.latitude) : NaN;
      const lng = hit.longitude != null ? Number(hit.longitude) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      const dist = haversineKm(userLocation, { latitude: lat, longitude: lng });
      return {
        ...hit,
        coordinate: { latitude: lat, longitude: lng },
        distanceFromUser: dist,
      };
    },
    [suggestedTherapists, therapistsForMap, userLocation],
  );

  const handleChooseApplicant = (app: {
    therapistId: string;
    therapistName: string;
    therapistAvatar?: string;
  }) => {
    const pt = resolveTherapistMapPoint(app.therapistId);
    if (!pt) {
      Alert.alert(
        language === 'en' ? 'Unavailable' : 'Không khả dụng',
        language === 'en'
          ? 'Therapist position is not available. Try again later.'
          : 'Không lấy được vị trí KTV. Vui lòng thử lại sau.',
      );
      return;
    }
    handleChooseTherapist(pt);
  };

  if (chatBookingId) {
    return (
      <View style={bs.searchOverlayRoot}>
        <ChatScreen onClose={handleChatClose} bookingId={chatBookingId} />
      </View>
    );
  }

  return (
    <View style={bs.searchOverlayRoot}>
      <View style={bs.container}>
        <StatusBar barStyle="dark-content" />

        <View style={bs.mapScreenRoot}>
          {detachMapSurface ? (
            <View style={bs.mapDetachedPlaceholder} />
          ) : (
            <BookingMapFindingView
              userCenter={userLocation}
              markers={radarMarkers}
              selectedId={highlightedTherapistId}
              onSelectTech={(id) => setHighlightedTherapistId((prev) => (prev === id ? null : id))}
              topInset={floatingTop}
              cityLabel={currentCityLabel}
              onCancel={handleCancelOrderPress}
              cancelLabel={strings.cancelOrder}
              mainTitle={strings.mapMainTitle}
              subTitle={strings.mapSubTitle}
              statusPillText={strings.mapStatusPill}
              headerVariant="compact"
              userAvatarUri={user?.avatarUri}
              userDisplayName={user?.displayName}
              onNativeGpsLocation={(coords) => {
                setUserLocation(coords);
                setNearbyPositions(generateNearbyPositions(coords, therapistsForMap));
              }}
            />
          )}

          <View
            style={[
              bs.sheetAbs,
              {
                height: Dimensions.get('window').height * 0.52,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View style={bs.sheetHandle} />
            <LinearGradient
              colors={[AppColors.accent, AppColors.accentMuted]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={bs.sheetAccentBar}
            />

            <View style={bs.primaryCard}>
              <View style={bs.waitingRow}>
                <View style={bs.hourIcon}>
                  <Ionicons name="hourglass-outline" size={22} color={AppColors.accent} />
                </View>
                <View style={bs.waitingTextWrap}>
                  <Text style={bs.waitingTitleNew}>
                    {strings.waitingTitle.replace('{name}', assignedName)}
                  </Text>
                  <View style={bs.countdownRow}>
                    <Text style={bs.waitingSubNew}>{strings.autoCancel}</Text>
                    <View style={[bs.countdownPill, bs.countdownPillSpaced]}>
                      <Text style={bs.timeTextNew}>{formatTime(countdown)}</Text>
                    </View>
                  </View>
                  {currentAssignedTherapist &&
                  'distanceFromUser' in currentAssignedTherapist &&
                  typeof (currentAssignedTherapist as TherapistMapPoint).distanceFromUser === 'number' ? (
                    <Text style={bs.distanceToAssigned}>
                      {language === 'en'
                        ? `Straight-line on map: ${(currentAssignedTherapist as TherapistMapPoint).distanceFromUser.toFixed(1)} km to ${assignedName}`
                        : `Đường chim bay trên bản đồ: ${(currentAssignedTherapist as TherapistMapPoint).distanceFromUser.toFixed(1)} km tới ${assignedName}`}
                    </Text>
                  ) : null}
                  {String(liveBookingRow?.assignmentFlow ?? '') === 'nominated_city_broadcast' ? (
                    <>
                      <Text style={bs.primaryFlowHint}>{strings.primaryWaitNote}</Text>
                      {String(liveBookingRow?.primaryAction ?? 'pending') === 'pending' ? (
                        <View style={bs.countdownRow}>
                          <Text style={bs.waitingSubNew}>
                            {language === 'en' ? 'Chosen therapist window' : 'Thời gian cho KTV bạn chọn'}
                          </Text>
                          <View style={[bs.countdownPill, bs.countdownPillSpaced]}>
                            <Text style={bs.timeTextNew}>{formatTime(primarySeconds)}</Text>
                          </View>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </View>
            </View>

            {liveApplications.length > 0 ? (
              <View style={bs.applicantsBlock}>
                <Text style={bs.sectionEyebrow}>{strings.applicantsSection}</Text>
                <Text style={bs.applicantsSub}>{strings.applicantsSub}</Text>
                {liveApplications.map((app) => (
                  <Pressable
                    key={app.therapistId}
                    style={bs.applicantRow}
                    onPress={() => !connectingTherapist && handleChooseApplicant(app)}
                    disabled={!!connectingTherapist}
                  >
                    <Image
                      source={{ uri: app.therapistAvatar || 'https://picsum.photos/seed/app/200/200' }}
                      style={bs.applicantAvatar}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={bs.techName}>{app.therapistName}</Text>
                      <Text style={bs.applicantHint}>
                        {language === 'en' ? 'Tap to choose' : 'Chạm để chọn'}
                      </Text>
                    </View>
                    <Text style={bs.chooseTextNew}>{strings.choose}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {Boolean(liveBookingRow?.fallbackSuggested) ? (
              <View style={bs.applicantsBlock}>
                <Text style={bs.sectionEyebrow}>{strings.fallbackSection}</Text>
                <Text style={bs.applicantsSub}>{strings.fallbackSub}</Text>
              </View>
            ) : null}

            {highlightedPoint ? (
              <View style={bs.selectedBox}>
                <Text style={bs.selectedTitle}>
                  {strings.viewingTherapist.replace('{name}', highlightedPoint.name)}
                </Text>
                <Text style={bs.selectedSub}>
                  {strings.viewingTherapistSub
                    .replace('{rating}', highlightedPoint.rating.toFixed(1))
                    .replace('{reviews}', String(highlightedPoint.reviewCount))
                    .replace('{km}', highlightedPoint.distanceFromUser.toFixed(1))}
                </Text>
              </View>
            ) : null}

            <View style={bs.sectionHeader}>
              <Text style={bs.sectionEyebrow}>{strings.alternativesLabel}</Text>
              <Text style={bs.sectionTitle}>
                {strings.ktvCount.replace('{count}', String(suggestedTherapists.length))}
              </Text>
              <Text style={bs.sectionSub}>{strings.replaceFor.replace('{name}', assignedName)}</Text>
            </View>

            <View style={bs.sheetScrollWrap}>
            <ScrollView
              style={bs.sheetScroll}
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={bs.listContent}
            >
              {suggestedTherapists.map((t) => (
                <Pressable
                  key={t.id}
                  style={[bs.techCard, highlightedTherapistId === t.id && bs.techCardActive]}
                  onPress={() => setHighlightedTherapistId((prev) => (prev === t.id ? null : t.id))}
                >
                  <View style={bs.avatarBox}>
                    <Image source={{ uri: t.avatar }} style={bs.techAvatar} />
                    <View style={bs.avatarOnlineNew} />
                  </View>
                  <View style={bs.techInfo}>
                    <Text numberOfLines={1} style={bs.techName}>
                      {t.name}
                    </Text>
                    <View style={bs.metaRow}>
                      <Ionicons name="star" size={16} color="#FFB020" />
                      <Text style={bs.ratingTextNew}>{t.rating.toFixed(1)}</Text>
                      <Text style={bs.reviewTextNew}>
                        ({t.reviewCount} {strings.reviewCount})
                      </Text>
                    </View>
                    <Text style={bs.distanceTextNew}>
                      • {t.distanceFromUser.toFixed(1)} {strings.km}
                    </Text>
                    {getRemoteDistanceSurcharge(t.distanceFromUser) > 0 ? (
                      <View style={bs.remoteFeeChip}>
                        <Text style={bs.remoteFeeChipText}>{strings.remoteFeeBadge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={bs.actionCol}>
                    <View style={bs.readyPill}>
                      <Text style={bs.readyTextNew}>{strings.ready}</Text>
                    </View>
                    <Pressable
                      style={[bs.chooseButtonNew, connectingTherapist?.id === t.id && bs.chooseBtnDisabled]}
                      onPress={() => !connectingTherapist && handleChooseTherapist(t)}
                      disabled={!!connectingTherapist}
                    >
                      {connectingTherapist?.id === t.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={bs.chooseTextNew}>{strings.choose}</Text>
                      )}
                    </Pressable>
                  </View>
                </Pressable>
              ))}

              {suggestedTherapists.length === 0 ? (
                <LinearGradient
                  colors={[AppColors.accentSoft2, AppColors.white]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={bs.emptyBox}
                >
                  <View style={bs.emptyIconRing}>
                    <Ionicons name="people-outline" size={30} color={AppColors.accent} />
                  </View>
                  <Text style={bs.emptyText}>{strings.emptyAlternatives}</Text>
                </LinearGradient>
              ) : null}

              <View style={{ height: 40 }} />
            </ScrollView>
            </View>
          </View>
        </View>

        {/* Popup - no wait */}
        {showPopup && !connectingTherapist && !chatBookingId && (
          <View style={bs.popupOverlay} pointerEvents="box-none">
            <View style={bs.popupCard} pointerEvents="auto">
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
          <View style={bs.popupOverlay} pointerEvents="box-none">
            <View style={bs.popupCard} pointerEvents="auto">
              <Image source={{ uri: connectingTherapist.avatar }} style={bs.connectingAvatar} />
              <ActivityIndicator size="large" color={COLORS.green} style={{ marginVertical: 16 }} />
              <Text style={bs.popupTitle}>
                {strings.connecting.replace('{name}', connectingTherapist.name)}
              </Text>
            </View>
          </View>
        )}

        {showPayosQr && (
          <View style={bs.popupOverlay} pointerEvents="box-none">
            <View style={bs.qrCard} pointerEvents="auto">
              <Text style={bs.qrTitle}>{strings.payosQrTitle}</Text>
              <Text style={bs.qrAmount}>{payosAmount.toLocaleString('vi-VN')} đ</Text>
              {payosQrCode ? (
                <View style={bs.qrWrap}>
                  <QRCode value={payosQrCode} size={220} />
                </View>
              ) : (
                <View style={bs.qrPlaceholder}>
                  <ActivityIndicator size="large" color={COLORS.green} />
                  <Text style={bs.qrPlaceholderText}>{strings.payosCreating}</Text>
                </View>
              )}
              <Text style={bs.qrHint}>{strings.payosQrHint}</Text>
              <View style={bs.qrWaitingRow}>
                <ActivityIndicator size="small" color={COLORS.green} />
                <Text style={bs.qrWaitingText}>{strings.payosWaiting}</Text>
              </View>
              {payosCheckoutUrl ? (
                <TouchableOpacity style={bs.qrLinkBtn} onPress={() => Linking.openURL(payosCheckoutUrl)}>
                  <Text style={bs.qrLinkBtnText}>{strings.payosOpenLink}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={bs.qrCloseBtn}
                onPress={() => {
                  stopPayosPolling();
                  setShowPayosQr(false);
                  setPayosQrCode('');
                  setPayosCheckoutUrl('');
                  setPayosAmount(0);
                }}
              >
                <Text style={bs.qrCloseBtnText}>{strings.payosClose}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <Modal
        visible={showCancelConfirm}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowCancelConfirm(false)}
      >
        <Pressable style={bs.cancelConfirmBackdrop} onPress={() => setShowCancelConfirm(false)}>
          <View style={bs.cancelConfirmCard}>
            <Text style={bs.cancelConfirmTitle}>{strings.cancelConfirmTitle}</Text>
            <Text style={bs.cancelConfirmMessage}>{strings.cancelConfirmMessage}</Text>
            <View style={bs.cancelConfirmRow}>
              <TouchableOpacity
                style={[bs.cancelConfirmBtn, bs.cancelConfirmBtnGhost]}
                onPress={() => setShowCancelConfirm(false)}
                activeOpacity={0.85}
              >
                <Text style={bs.cancelConfirmBtnGhostText}>{strings.cancelConfirmDismiss}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[bs.cancelConfirmBtn, bs.cancelConfirmBtnDanger]}
                onPress={confirmCancelOrder}
                activeOpacity={0.85}
              >
                <Text style={bs.cancelConfirmBtnDangerText}>{strings.cancelConfirmAgree}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const bs = StyleSheet.create({
  searchOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    elevation: 200,
    backgroundColor: AppColors.bg,
  },
  container: { flex: 1, backgroundColor: AppColors.bg },
  mapScreenRoot: { flex: 1 },
  mapDetachedPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: AppColors.bg,
  },
  findTopPad: { paddingHorizontal: 22 },
  findHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtnNew: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(90, 125, 108, 0.12)',
    shadowColor: '#2A4A3A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cancelBtnNew: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(107, 84, 52, 0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cancelBtnTextNew: { color: '#5C4A3A', fontSize: 15, fontWeight: '700' },
  titleWrap: { alignItems: 'center', marginTop: 10, paddingHorizontal: 8 },
  pinIcon: { fontSize: 28, marginBottom: 6, opacity: 0.92 },
  titleMain: {
    color: '#2D4A3E',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    paddingHorizontal: 16,
  },
  titleSub: {
    marginTop: 6,
    color: '#6B8578',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  cityChip: {
    marginTop: 12,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(90, 125, 108, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cityChipText: { color: '#3D5C4F', fontSize: 16, fontWeight: '700' },
  sheetAbs: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: AppColors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: AppColors.primarySoft,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetAccentBar: {
    alignSelf: 'center',
    width: '42%',
    height: 3,
    borderRadius: 2,
    marginBottom: 14,
  },
  primaryCard: {
    backgroundColor: AppColors.bgAlt,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderLeftWidth: 4,
    borderLeftColor: AppColors.accent,
    marginBottom: 6,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  waitingRow: { flexDirection: 'row', alignItems: 'center' },
  hourIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: AppColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  waitingTextWrap: { flex: 1 },
  waitingTitleNew: { color: AppColors.text, fontSize: 17, fontWeight: '800', lineHeight: 24 },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  waitingSubNew: { color: AppColors.textMuted, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  primaryFlowHint: {
    marginTop: 10,
    color: AppColors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  applicantsBlock: {
    marginTop: 12,
    paddingBottom: 4,
  },
  applicantsSub: {
    color: AppColors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    lineHeight: 18,
  },
  applicantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  applicantAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  applicantHint: { color: AppColors.textMuted, fontSize: 12, marginTop: 2 },
  countdownPill: {
    backgroundColor: AppColors.accentSoft2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(13, 180, 108, 0.28)',
  },
  countdownPillSpaced: { marginLeft: 10 },
  timeTextNew: { color: AppColors.accent, fontWeight: '800', fontSize: 16 },
  distanceToAssigned: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.primaryDark,
  },
  selectedBox: {
    marginTop: 12,
    backgroundColor: AppColors.accentSoft2,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  selectedTitle: { color: AppColors.text, fontSize: 15, fontWeight: '800' },
  selectedSub: { marginTop: 5, color: AppColors.textMuted, fontSize: 13, fontWeight: '600' },
  sectionHeader: {
    marginTop: 18,
    paddingTop: 4,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: AppColors.primaryMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionTitle: { color: AppColors.text, fontSize: 16, fontWeight: '800', lineHeight: 22 },
  sectionSub: { color: AppColors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 4, lineHeight: 18 },
  sheetScrollWrap: { flex: 1, minHeight: 0 },
  sheetScroll: { flex: 1 },
  listContent: { paddingTop: 10, paddingBottom: 36 },
  techCard: {
    minHeight: 92,
    borderRadius: 18,
    backgroundColor: AppColors.white,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  techCardActive: {
    borderColor: AppColors.accent,
    backgroundColor: AppColors.accentSoft2,
  },
  avatarBox: { width: 72, height: 72, borderRadius: 22, position: 'relative' },
  techAvatar: { width: 72, height: 72, borderRadius: 22, backgroundColor: AppColors.primarySoft2 },
  avatarOnlineNew: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: AppColors.accent,
    borderWidth: 2.5,
    borderColor: AppColors.white,
  },
  techInfo: { flex: 1, marginLeft: 14, paddingRight: 8 },
  techName: { color: AppColors.text, fontSize: 18, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  ratingTextNew: { color: '#F4A51C', fontSize: 14, fontWeight: '900', marginLeft: 4 },
  reviewTextNew: { color: AppColors.textMuted, fontSize: 13, fontWeight: '700', marginLeft: 4 },
  distanceTextNew: { color: AppColors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 5 },
  actionCol: { alignItems: 'center', justifyContent: 'center' },
  readyPill: {
    backgroundColor: AppColors.successBg,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 16,
    marginBottom: 9,
  },
  readyTextNew: { color: AppColors.accent, fontSize: 13, fontWeight: '800' },
  chooseButtonNew: {
    minWidth: 82,
    height: 42,
    borderRadius: 22,
    backgroundColor: AppColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  chooseTextNew: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  emptyBox: {
    marginTop: 8,
    paddingVertical: 26,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  emptyIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: AppColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(13, 180, 108, 0.25)',
    shadowColor: AppColors.accent,
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  emptyText: {
    marginTop: 14,
    color: AppColors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  assignedBadge: {
    backgroundColor: AppColors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  assignedBadgeText: { fontSize: 11, fontWeight: '800', color: AppColors.primaryDark },
  remoteFeeChip: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: 'rgba(230, 126, 34, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(230, 126, 34, 0.35)',
  },
  remoteFeeChipText: { fontSize: 11, fontWeight: '800', color: '#C45C12' },
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
  cancelConfirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  cancelConfirmCard: {
    backgroundColor: COLORS.white,
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  cancelConfirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  cancelConfirmMessage: {
    fontSize: 14,
    color: COLORS.subText,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
  },
  cancelConfirmRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelConfirmBtnGhost: {
    backgroundColor: AppColors.bgAlt,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  cancelConfirmBtnGhostText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  cancelConfirmBtnDanger: {
    backgroundColor: COLORS.red,
  },
  cancelConfirmBtnDangerText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  popupCard: {
    backgroundColor: COLORS.white, borderRadius: 24, padding: 28,
    alignItems: 'center', width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  qrCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
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
  qrTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  qrAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: AppColors.primaryDark,
    marginBottom: 16,
  },
  qrWrap: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  qrPlaceholder: {
    width: 244,
    height: 244,
    borderRadius: 18,
    backgroundColor: AppColors.bgAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  qrPlaceholderText: {
    marginTop: 12,
    color: COLORS.subText,
    fontWeight: '600',
  },
  qrHint: {
    marginTop: 16,
    textAlign: 'center',
    color: COLORS.subText,
    lineHeight: 20,
  },
  qrWaitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  qrWaitingText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  qrLinkBtn: {
    width: '100%',
    marginTop: 16,
    backgroundColor: AppColors.accent,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
  },
  qrLinkBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
  qrCloseBtn: {
    marginTop: 10,
    paddingVertical: 10,
  },
  qrCloseBtnText: {
    color: COLORS.subText,
    fontWeight: '700',
  },
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
  promoBtnDisabled: {
    opacity: 0.65,
  },
  promoBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  promoAppliedHint: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.subText,
    lineHeight: 17,
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
  zenaBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  zenaBalanceText: {
    fontSize: 12,
    fontWeight: '400',
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
  deleteAddrBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FDECEC',
    marginLeft: 10,
  },
  deleteAddrText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.red,
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
