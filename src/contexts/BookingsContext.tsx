import {
    createSharedBookingRecord,
    createSharedReviewRecord,
    creditTherapistEarning,
    getSharedBookingRecords,
    getSharedReviewRecords,
    notifyBookingCompleted,
    notifyBookingConfirmed,
    notifyNewJobForCity,
    notifyReviewReminder,
    updateSharedBookingStatus,
} from '@/lib/supabaseService';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type BookingStatus = 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled';

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
  addBooking: (booking: Omit<SharedBooking, 'id' | 'createdAt'>, opts?: { userId?: string; city?: string }) => void;
  updateStatus: (bookingId: string, status: BookingStatus, opts?: { userId?: string; therapistName?: string; service?: string }) => void;
  addReview: (review: Omit<UserReview, 'id' | 'createdAt'>) => void;
  getReviewsForTherapist: (therapistId: string) => UserReview[];
  hasReviewed: (bookingId: string) => boolean;
  getCustomerBookings: (phone: string) => SharedBooking[];
  getTherapistBookings: (name: string) => SharedBooking[];
  getTodayBookings: (therapistName: string) => SharedBooking[];
  getCompletedEarnings: (therapistName: string) => number;
}

const BookingsContext = createContext<BookingsContextType | undefined>(undefined);

function toSharedBooking(item: Record<string, unknown> & { id: string }): SharedBooking | null {
  if (
    typeof item.customerPhone !== 'string' ||
    typeof item.therapistId !== 'string' ||
    typeof item.therapistName !== 'string'
  ) {
    return null;
  }
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

  // Load bookings/reviews from Supabase.
  useEffect(() => {
    (async () => {
      try {
        const [bookingRows, reviewRows] = await Promise.all([
          getSharedBookingRecords(),
          getSharedReviewRecords(),
        ]);
        const nextBookings = bookingRows
          .map(toSharedBooking)
          .filter((item): item is SharedBooking => item !== null)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const nextReviews = reviewRows
          .map(toUserReview)
          .filter((item): item is UserReview => item !== null)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setBookings(nextBookings);
        setReviews(nextReviews);
      } catch {
        setBookings([]);
        setReviews([]);
      }
    })();
  }, []);

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

        // Send new job notification to all therapists in the same city
        if (opts?.city) {
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
    setBookings(prev =>
      prev.map(b => (b.id === bookingId ? { ...b, status } : b)),
    );
    updateSharedBookingStatus(bookingId, status).catch(() => {});

    // Credit therapist 70% earning on completion
    if (status === 'completed') {
      const booking = bookings.find(b => b.id === bookingId);
      if (booking && booking.therapistId && booking.price > 0) {
        creditTherapistEarning(booking.therapistId, bookingId, booking.price, 0.7)
          .catch((err) => console.warn('[creditTherapistEarning] Failed:', err));
      }
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
  }, [bookings]);

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
      } catch {
        setReviews(prev => prev.filter((item) => item.id !== optimisticId));
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
    () => ({ bookings, reviews, addBooking, updateStatus, addReview, getReviewsForTherapist, hasReviewed, getCustomerBookings, getTherapistBookings, getTodayBookings, getCompletedEarnings }),
    [bookings, reviews, addBooking, updateStatus, addReview, getReviewsForTherapist, hasReviewed, getCustomerBookings, getTherapistBookings, getTodayBookings, getCompletedEarnings],
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
