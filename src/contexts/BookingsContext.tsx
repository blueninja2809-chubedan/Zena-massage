import {
    CancelledBookingRecord,
    completeTherapistBookingPayouts,
    createSharedBookingRecord,
    createSharedReviewRecord,
    deleteChatRoomByBooking,
    getCustomerCancelledBookings,
    getSharedBookingRecords,
    getSharedReviewRecords,
    mergeBookingPayload,
    notifyBookingCompleted,
    notifyBookingConfirmed,
    notifyAssignedTherapistJob,
    notifyNewJobForCity,
    notifyReviewReminder,
    updateSharedBookingStatus,
} from '@/lib/supabaseService';
import { useUser } from '@/contexts/UserContext';
import { cityLooseMatch } from '@/lib/cityMatch';
import { supabase } from '@/lib/supabase';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type BookingStatus = 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled';

export type BookingPrimaryAction = 'pending' | 'accepted' | 'declined' | 'timeout';

export interface BookingApplicationEntry {
  therapistId: string;
  therapistName: string;
  therapistAvatar?: string;
  appliedAt: string;
}

/** Snapshot đơn để “Đặt lại” y hệt giỏ hàng đã huỷ (lưu trong payload Supabase). */
export interface CustomerCartSnapshotRow {
  name: string;
  duration: number;
  price: number;
}

export interface SharedBooking {
  id: string;
  customerUserId?: string;
  customerName: string;
  customerPhone: string;
  therapistId: string;
  therapistName: string;
  therapistAvatar?: string;
  service: string;
  date: string;        // YYYY-MM-DD
  time: string;        // e.g. "14:00 - 15:30"
  address: string;
  price: number;
  status: BookingStatus;
  createdAt: string;
  reviewed?: boolean;
  /** Đặt KTV cụ thể + phát đơn cho cùng tỉnh/thành KTV đang nhận việc */
  assignmentFlow?: 'nominated_city_broadcast' | null;
  jobCity?: string;
  requestedTherapistId?: string;
  primaryAction?: BookingPrimaryAction;
  applications?: BookingApplicationEntry[];
  skippedTherapistIds?: string[];
  broadcastClosed?: boolean;
  customerUiPhase?: string;
  fallbackSuggested?: boolean;
  customerLat?: number;
  customerLng?: number;
  customerCartSnapshot?: CustomerCartSnapshotRow[];
  paymentMethod?: string;
}

export interface UserReview {
  id: string;
  bookingId: string;
  therapistId: string;
  therapistName: string;
  customerPhone: string;
  customerName: string;
  rating: number;
  comment: string;
  service: string;
  createdAt: string;
}

interface BookingsContextType {
  bookings: SharedBooking[];
  reviews: UserReview[];
  /** Đơn huỷ đọc từ bảng riêng `cancelled_bookings` (Activity → tab "Đã huỷ"). */
  cancelledBookings: CancelledBookingRecord[];
  addBooking: (booking: Omit<SharedBooking, 'id' | 'createdAt'>, opts?: { userId?: string; city?: string }) => void;
  updateStatus: (bookingId: string, status: BookingStatus, opts?: { userId?: string; therapistName?: string; service?: string }) => void;
  addReview: (review: Omit<UserReview, 'id' | 'createdAt'>) => void;
  getReviewsForTherapist: (therapistId: string) => UserReview[];
  hasReviewed: (bookingId: string) => boolean;
  getCustomerBookings: (phone: string) => SharedBooking[];
  getTherapistBookings: (name: string) => SharedBooking[];
  /** Đơn chờ: KTV được chỉ định + đơn cùng tỉnh/thành (phát sóng). */
  getTherapistJobInbox: (opts: { displayName: string; therapistUid: string; workingCity: string }) => SharedBooking[];
  getTodayBookings: (therapistName: string) => SharedBooking[];
  getCompletedEarnings: (therapistName: string) => number;
  refreshBookings: () => Promise<void>;
  refreshCancelledBookings: () => Promise<void>;
}

const BookingsContext = createContext<BookingsContextType | undefined>(undefined);

function parseApplications(raw: unknown): BookingApplicationEntry[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const out: BookingApplicationEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const o = row as Record<string, unknown>;
    const therapistId = typeof o.therapistId === 'string' ? o.therapistId : '';
    const therapistName = typeof o.therapistName === 'string' ? o.therapistName : '';
    const appliedAt = typeof o.appliedAt === 'string' ? o.appliedAt : '';
    if (!therapistId || !therapistName) {
      continue;
    }
    out.push({
      therapistId,
      therapistName,
      therapistAvatar: typeof o.therapistAvatar === 'string' ? o.therapistAvatar : undefined,
      appliedAt: appliedAt || new Date().toISOString(),
    });
  }
  return out.length ? out : undefined;
}

function parseCustomerCartSnapshot(raw: unknown): CustomerCartSnapshotRow[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const out: CustomerCartSnapshotRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const duration = Number(o.duration);
    const price = Number(o.price);
    if (!name || !Number.isFinite(duration) || !Number.isFinite(price)) continue;
    out.push({ name, duration, price });
  }
  return out.length ? out : undefined;
}

function toSharedBooking(item: Record<string, unknown> & { id: string }): SharedBooking | null {
  if (
    typeof item.customerPhone !== 'string' ||
    typeof item.therapistId !== 'string' ||
    typeof item.therapistName !== 'string'
  ) {
    return null;
  }
  const primaryRaw = item.primaryAction;
  const primaryAction: BookingPrimaryAction | undefined =
    primaryRaw === 'accepted' || primaryRaw === 'declined' || primaryRaw === 'timeout' || primaryRaw === 'pending'
      ? primaryRaw
      : undefined;
  return {
    id: item.id,
    customerUserId: typeof item.customerUserId === 'string' ? item.customerUserId : undefined,
    customerName: String(item.customerName ?? ''),
    customerPhone: item.customerPhone,
    therapistId: item.therapistId,
    therapistName: item.therapistName,
    therapistAvatar: typeof item.therapistAvatar === 'string' ? item.therapistAvatar : undefined,
    service: String(item.service ?? ''),
    date: String(item.date ?? ''),
    time: String(item.time ?? ''),
    address: String(item.address ?? ''),
    price: Number(item.price ?? 0),
    status: (item.status as BookingStatus) ?? 'pending',
    createdAt: String(item.createdAt ?? new Date().toISOString()),
    reviewed: Boolean(item.reviewed),
    assignmentFlow:
      item.assignmentFlow === 'nominated_city_broadcast' ? 'nominated_city_broadcast' : undefined,
    jobCity: typeof item.jobCity === 'string' ? item.jobCity : undefined,
    requestedTherapistId: typeof item.requestedTherapistId === 'string' ? item.requestedTherapistId : undefined,
    primaryAction,
    applications: parseApplications(item.applications),
    skippedTherapistIds: Array.isArray(item.skippedTherapistIds)
      ? (item.skippedTherapistIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined,
    broadcastClosed: Boolean(item.broadcastClosed),
    customerUiPhase: typeof item.customerUiPhase === 'string' ? item.customerUiPhase : undefined,
    fallbackSuggested: Boolean(item.fallbackSuggested),
    customerLat: typeof item.customerLat === 'number' ? item.customerLat : undefined,
    customerLng: typeof item.customerLng === 'number' ? item.customerLng : undefined,
    customerCartSnapshot: parseCustomerCartSnapshot(item.customerCartSnapshot),
    paymentMethod: typeof item.paymentMethod === 'string' ? item.paymentMethod : undefined,
  };
}

function toUserReview(item: Record<string, unknown> & { id: string }): UserReview | null {
  if (
    typeof item.bookingId !== 'string' ||
    typeof item.therapistId !== 'string' ||
    typeof item.customerPhone !== 'string'
  ) {
    return null;
  }
  return {
    id: item.id,
    bookingId: item.bookingId,
    therapistId: item.therapistId,
    therapistName: String(item.therapistName ?? ''),
    customerPhone: item.customerPhone,
    customerName: String(item.customerName ?? ''),
    rating: Number(item.rating ?? 0),
    comment: String(item.comment ?? ''),
    service: String(item.service ?? ''),
    createdAt: String(item.createdAt ?? new Date().toISOString()),
  };
}

export function BookingsProvider({ children }: { children: React.ReactNode }) {
  const [bookings, setBookings] = useState<SharedBooking[]>([]);
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [cancelledBookings, setCancelledBookings] = useState<CancelledBookingRecord[]>([]);
  const { user } = useUser();

  const refreshData = useCallback(async () => {
    try {
      const [bookingRows, reviewRows] = await Promise.all([
        getSharedBookingRecords(),
        getSharedReviewRecords(),
      ]);
      const nextBookings = bookingRows
        .map(toSharedBooking)
        .filter((item): item is SharedBooking => item !== null)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      console.log('[BookingsCtx] refreshData: total bookings=', nextBookings.length,
        'pending broadcast=', nextBookings.filter(b => b.assignmentFlow === 'nominated_city_broadcast' && b.status === 'pending').map(b => ({ id: b.id, jobCity: b.jobCity, status: b.status }))
      );
      const nextReviews = reviewRows
        .map(toUserReview)
        .filter((item): item is UserReview => item !== null)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBookings(nextBookings);
      setReviews(nextReviews);
    } catch (e) {
      console.warn('[BookingsCtx] refreshData error:', e);
      setBookings([]);
      setReviews([]);
    }
  }, []);

  const userIdRef = useRef<string | null>(null);
  const userPhoneRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = user?.authUid?.trim() || null;
    userPhoneRef.current = user?.phoneNumber?.trim() || null;
  }, [user?.authUid, user?.phoneNumber]);

  const refreshCancelledData = useCallback(async () => {
    const userId = userIdRef.current;
    const phone = userPhoneRef.current;
    if (!userId && !phone) {
      setCancelledBookings([]);
      return;
    }
    try {
      const rows = await getCustomerCancelledBookings({
        customerUserId: userId,
        customerPhone: phone,
        limit: 50,
      });
      setCancelledBookings(rows);
    } catch {
      // giữ nguyên cache nếu lỗi mạng
    }
  }, []);

  // Load bookings/reviews from Supabase and keep them reasonably fresh across devices.
  useEffect(() => {
    void refreshData();
    const intervalId = setInterval(() => {
      void refreshData();
    }, 10000);
    return () => clearInterval(intervalId);
  }, [refreshData]);

  // Realtime: refresh immediately when any booking is inserted or updated.
  useEffect(() => {
    const channel = supabase
      .channel('bookings-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, () => {
        void refreshData();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, () => {
        void refreshData();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refreshData]);

  // Load cancelled-bookings (bảng riêng) — refresh khi user đổi & chu kỳ.
  useEffect(() => {
    void refreshCancelledData();
    const intervalId = setInterval(() => {
      void refreshCancelledData();
    }, 15000);
    return () => clearInterval(intervalId);
  }, [refreshCancelledData, user?.authUid, user?.phoneNumber]);

  const addBooking = useCallback((data: Omit<SharedBooking, 'id' | 'createdAt'>, opts?: { userId?: string; city?: string }) => {
    const createdAt = new Date().toISOString();
    const optimisticId = `pending-${Date.now()}`;
    const optimisticBooking: SharedBooking = { ...data, id: optimisticId, createdAt };
    setBookings(prev => [optimisticBooking, ...prev]);

    (async () => {
      try {
        const docId = await createSharedBookingRecord({ ...data, createdAt });
        setBookings(prev =>
          prev.map((item) => (item.id === optimisticId ? { ...item, id: docId } : item)),
        );

        // Send booking confirmation notification to customer
        if (opts?.userId) {
          notifyBookingConfirmed(
            opts.userId, docId, data.therapistName, data.service, data.date, data.time,
          ).catch(() => {});
        }

        // If booking already has an assigned therapist, notify that therapist directly.
        if (data.therapistId) {
          notifyAssignedTherapistJob(
            data.therapistId,
            docId,
            data.customerName,
            data.service,
            data.date,
            data.time,
            data.address,
          ).catch(() => {});
        } else if (opts?.city) {
          // Otherwise broadcast new job in the same city.
          notifyNewJobForCity(
            opts.city, docId, data.customerName, data.service, data.date, data.time, data.address, data.therapistId,
          ).catch(() => {});
        }
      } catch {
        setBookings(prev => prev.filter((item) => item.id !== optimisticId));
      }
    })();
  }, []);

  const updateStatus = useCallback((bookingId: string, status: BookingStatus, opts?: { userId?: string; therapistName?: string; service?: string }) => {
    let payout: { therapistId: string; price: number } | null = null;

    setBookings((prev) => {
      const found = prev.find((b) => b.id === bookingId);
      if (status === 'completed' && found && found.therapistId && found.price > 0) {
        payout = { therapistId: found.therapistId, price: found.price };
      }
      return prev.map((b) => (b.id === bookingId ? { ...b, status } : b));
    });

    updateSharedBookingStatus(bookingId, status).catch(() => {});

    if (status === 'completed' && payout) {
      completeTherapistBookingPayouts(payout.therapistId, bookingId, payout.price)
        .catch((err) => console.warn('[completeTherapistBookingPayouts] Failed:', err));
    }

    // Đơn đóng (completed/cancelled) → xóa luôn chat ở phía server.
    // Trigger DB (migration 063) cũng sẽ xóa; gọi thêm ở client để chat
    // biến mất tức thì cho user vừa thao tác.
    if (status === 'completed' || status === 'cancelled') {
      deleteChatRoomByBooking(bookingId).catch(() => {});
    }

    // Send notifications on status changes
    if (status === 'completed' && opts?.userId) {
      notifyBookingCompleted(
        opts.userId, bookingId, opts.therapistName ?? '', opts.service ?? '',
      ).catch(() => {});
      // Also send review reminder
      notifyReviewReminder(
        opts.userId, bookingId, opts.therapistName ?? '',
      ).catch(() => {});
    }
  }, []);

  const addReview = useCallback((data: Omit<UserReview, 'id' | 'createdAt'>) => {
    const createdAt = new Date().toISOString();
    const optimisticId = `pending-rv-${Date.now()}`;
    const optimisticReview: UserReview = { ...data, id: optimisticId, createdAt };
    setReviews(prev => [optimisticReview, ...prev]);
    // Mark booking as reviewed
    setBookings(prev =>
      prev.map(b => (b.id === data.bookingId ? { ...b, reviewed: true } : b)),
    );

    (async () => {
      try {
        const docId = await createSharedReviewRecord({ ...data, createdAt });
        setReviews(prev =>
          prev.map((item) => (item.id === optimisticId ? { ...item, id: docId } : item)),
        );
        await mergeBookingPayload(data.bookingId, { reviewed: true }).catch(() => {});
      } catch {
        setReviews(prev => prev.filter((item) => item.id !== optimisticId));
        setBookings(prev =>
          prev.map(b => (b.id === data.bookingId ? { ...b, reviewed: false } : b)),
        );
      }
    })();
  }, []);

  const getReviewsForTherapist = useCallback(
    (therapistId: string) => reviews.filter(r => r.therapistId === therapistId),
    [reviews],
  );

  const hasReviewed = useCallback(
    (bookingId: string) => reviews.some(r => r.bookingId === bookingId),
    [reviews],
  );

  const getCustomerBookings = useCallback(
    (phone: string) => bookings.filter(b => b.customerPhone === phone),
    [bookings],
  );

  const getTherapistBookings = useCallback(
    (name: string) => bookings.filter(b => b.therapistName === name || name === 'KTV'),
    [bookings],
  );

  const getTherapistJobInbox = useCallback(
    (opts: { displayName: string; therapistUid: string; workingCity: string }) => {
      const { displayName, therapistUid, workingCity } = opts;
      const city = workingCity?.trim() || '';
      console.log('[JobInbox] filter params: displayName=', displayName, 'therapistUid=', therapistUid, 'city=', city, 'total bookings=', bookings.length);
      return bookings.filter((b) => {
        if (b.status === 'cancelled') {
          return false;
        }
        if (b.therapistName === displayName || displayName === 'KTV') {
          return true;
        }
        if (
          b.assignmentFlow === 'nominated_city_broadcast' &&
          b.status === 'pending' &&
          !b.broadcastClosed &&
          city &&
          b.jobCity &&
          cityLooseMatch(city, b.jobCity)
        ) {
          if (therapistUid && b.skippedTherapistIds?.includes(therapistUid)) {
            return false;
          }
          return true;
        }
        return false;
      });
    },
    [bookings],
  );

  const getTodayBookings = useCallback(
    (therapistName: string) => {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      return bookings.filter(
        b => b.date === today && (b.therapistName === therapistName || therapistName === 'KTV'),
      );
    },
    [bookings],
  );

  const getCompletedEarnings = useCallback(
    (therapistName: string) => {
      return bookings
        .filter(b => b.status === 'completed' && (b.therapistName === therapistName || therapistName === 'KTV'))
        .reduce((sum, b) => sum + b.price, 0);
    },
    [bookings],
  );

  const value = useMemo(
    () => ({
      bookings,
      reviews,
      cancelledBookings,
      addBooking,
      updateStatus,
      addReview,
      getReviewsForTherapist,
      hasReviewed,
      getCustomerBookings,
      getTherapistBookings,
      getTherapistJobInbox,
      getTodayBookings,
      getCompletedEarnings,
      refreshBookings: refreshData,
      refreshCancelledBookings: refreshCancelledData,
    }),
    [
      bookings,
      reviews,
      cancelledBookings,
      addBooking,
      updateStatus,
      addReview,
      getReviewsForTherapist,
      hasReviewed,
      getCustomerBookings,
      getTherapistBookings,
      getTherapistJobInbox,
      getTodayBookings,
      getCompletedEarnings,
      refreshData,
      refreshCancelledData,
    ],
  );

  return (
    <BookingsContext.Provider value={value}>
      {children}
    </BookingsContext.Provider>
  );
}

export function useBookings() {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error('useBookings must be used within BookingsProvider');
  return ctx;
}
