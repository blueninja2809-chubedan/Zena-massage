import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pending_customer_booking_banner_v1';

export type PendingCustomerBookingBanner = {
  bookingId: string;
  therapistId: string;
  therapistName: string;
  /** Hết hạn tự hủy / hết cửa sổ chờ (ISO) */
  deadlineIso: string;
  paymentMethod?: string;
  zenaHoldReferenceId?: string;
  zenaHoldAmount?: number;
};

export async function persistPendingCustomerBookingBanner(
  data: PendingCustomerBookingBanner,
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* best-effort */
  }
}

export async function loadPendingCustomerBookingBanner(): Promise<PendingCustomerBookingBanner | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PendingCustomerBookingBanner>;
    if (
      typeof parsed.bookingId !== 'string' ||
      typeof parsed.therapistId !== 'string' ||
      typeof parsed.therapistName !== 'string' ||
      typeof parsed.deadlineIso !== 'string'
    ) {
      return null;
    }
    return {
      bookingId: parsed.bookingId,
      therapistId: parsed.therapistId,
      therapistName: parsed.therapistName,
      deadlineIso: parsed.deadlineIso,
      paymentMethod: typeof parsed.paymentMethod === 'string' ? parsed.paymentMethod : undefined,
      zenaHoldReferenceId:
        typeof parsed.zenaHoldReferenceId === 'string' ? parsed.zenaHoldReferenceId : undefined,
      zenaHoldAmount: typeof parsed.zenaHoldAmount === 'number' ? parsed.zenaHoldAmount : undefined,
    };
  } catch {
    return null;
  }
}

export async function clearPendingCustomerBookingBanner(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
