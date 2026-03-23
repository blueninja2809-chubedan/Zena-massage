import AsyncStorage from '@react-native-async-storage/async-storage';
import bcrypt from 'bcryptjs';
import { supabase } from './supabase';
import type {
    Booking,
    Notification,
    Promotion,
    Review,
    SavedAddress,
    Service,
    Therapist,
} from './types';

export type PartnerApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface PartnerApplicationPayload {
  applicationType: 'individual' | 'business';
  phoneNumber: string;
  displayName?: string;
  gender?: 'male' | 'female' | 'other';
  workingCity?: string;
  services?: string[];
  imageUris: string[];
  businessName?: string;
  businessAddress?: string;
  weekdayHours?: {
    start: string;
    end: string;
  };
  weekendHours?: {
    start: string;
    end: string;
  };
}

export interface PartnerApplicationRecord extends PartnerApplicationPayload {
  id: string;
  status: PartnerApplicationStatus;
  imageModerationStatus: 'pending' | 'approved' | 'rejected';
  reviewedByAdmin: boolean;
  createdAt: string;
  approvedAt?: string;
}

type JsonObject = Record<string, unknown>;

function withTimeout<T>(promiseLike: PromiseLike<T>, ms = 10000): Promise<T> {
  return Promise.race([
    Promise.resolve(promiseLike),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Supabase timeout')), ms)),
  ]);
}

/** Longer timeout for auth RPCs (bcrypt is CPU-intensive on free tier) */
function withAuthTimeout<T>(promiseLike: PromiseLike<T>): Promise<T> {
  return withTimeout(promiseLike, 30000);
}

async function getStoredUid(): Promise<string> {
  return (await AsyncStorage.getItem('custom_auth_uid')) ?? '';
}

const FALLBACK_SERVICES: Service[] = [
  {
    id: 'fallback-service-massage',
    name: 'Massage Thu Gian',
    nameEn: 'Relaxation Massage',
    description: 'Xoa diu cang thang, tai tao nang luong',
    descriptionEn: 'Relax and restore your energy',
    category: 'massage',
    icon: '💆',
    basePrice: 300000,
    duration: 60,
    image: '',
    rating: 4.8,
    reviewCount: 120,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-service-spa',
    name: 'Spa Thu Gian',
    nameEn: 'Relaxation Spa',
    description: 'Tri lieu toan than voi tinh dau tu nhien',
    descriptionEn: 'Full body treatment with natural essential oils',
    category: 'spa',
    icon: '🧴',
    basePrice: 450000,
    duration: 90,
    image: '',
    rating: 4.9,
    reviewCount: 85,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];

const FALLBACK_THERAPISTS: Therapist[] = [
  {
    id: 'fallback-therapist-huong',
    name: 'Nguyen Thi Huong',
    phoneNumber: '0912345678',
    email: 'huong@gmail.com',
    gender: 'female',
    avatar: '',
    photos: [],
    bio: 'Ky thuat vien co kinh nghiem massage thu gian va spa.',
    bioEn: 'Experienced therapist in relaxation massage and spa.',
    specialties: ['massage', 'spa'],
    experience: 5,
    rating: 4.8,
    reviewCount: 150,
    hourlyRate: 250000,
    distanceFromCenter: 2.1,
    workingCity: 'TP Ho Chi Minh',
    isAvailable: true,
    availability: {},
    languages: ['Vietnamese', 'English'],
    certifications: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fallback-therapist-an',
    name: 'Tran Van An',
    phoneNumber: '0987654321',
    email: 'an@gmail.com',
    gender: 'male',
    avatar: '',
    photos: [],
    bio: 'Chuyen massage tri lieu va phuc hoi.',
    bioEn: 'Specialized in therapeutic and recovery massage.',
    specialties: ['massage', 'yoga'],
    experience: 3,
    rating: 4.6,
    reviewCount: 90,
    hourlyRate: 200000,
    distanceFromCenter: 4.3,
    workingCity: 'TP Ho Chi Minh',
    isAvailable: true,
    availability: {},
    languages: ['Vietnamese'],
    certifications: [],
    createdAt: new Date().toISOString(),
  },
];

const FALLBACK_PROMOTIONS: Promotion[] = [
  {
    id: 'fallback-promo-welcome50',
    code: 'WELCOME50',
    description: 'Discount cho khach hang moi',
    discountPercent: 50,
    maxDiscountAmount: 150000,
    minOrderAmount: 0,
    expiryDate: '2027-12-31T23:59:59.000Z',
    maxUses: 100,
    currentUses: 0,
    conditions: [],
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];

let hasWarnedCatalogPermission = false;

function isCatalogPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybe = error as { code?: string; message?: string };
  const code = maybe.code ?? '';
  const message = (maybe.message ?? '').toLowerCase();
  return code === '42501' || message.includes('permission denied');
}

function warnCatalogPermissionOnce(error: unknown): void {
  if (hasWarnedCatalogPermission || !isCatalogPermissionDenied(error)) {
    return;
  }
  hasWarnedCatalogPermission = true;
  console.warn(
    'Supabase catalog read is blocked by RLS policies (role anon). Using local fallback data. Run SQL migration/policies in Supabase to enable live catalog data.',
  );
}

function normalizePhone(phoneNumber: string): string {
  return phoneNumber.replace(/\s/g, '');
}

function toE164(rawPhone: string): string {
  const digits = rawPhone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    return digits;
  }
  if (digits.startsWith('0')) {
    return `+84${digits.slice(1)}`;
  }
  return `+${digits}`;
}

function toIso(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value === 'string' && value) {
    return value;
  }
  return fallback;
}

function mapService(row: JsonObject): Service {
  const createdAt = toIso(row.created_at);
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? 'Dich vu massage'),
    nameEn: String(row.name_en ?? row.name ?? 'Massage service'),
    description: String(row.description ?? 'Dich vu massage thu gian'),
    descriptionEn: String(row.description_en ?? row.description ?? 'Relaxing massage service'),
    category: (String(row.category ?? 'massage') as Service['category']),
    icon: String(row.icon ?? '💆'),
    basePrice: Number(row.base_price ?? 0),
    duration: Number(row.duration ?? 60),
    image: String(row.image ?? ''),
    rating: Number(row.rating ?? 5),
    reviewCount: Number(row.review_count ?? 0),
    isActive: Boolean(row.is_active ?? true),
    createdAt,
  };
}

function mapTherapist(row: JsonObject): Therapist {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? 'Ky thuat vien'),
    phoneNumber: String(row.phone_number ?? ''),
    email: String(row.email ?? ''),
    gender: (String(row.gender ?? 'female') as Therapist['gender']),
    avatar: String(row.avatar ?? ''),
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : undefined,
    bio: String(row.bio ?? ''),
    bioEn: String(row.bio_en ?? row.bio ?? ''),
    specialties: Array.isArray(row.specialties) ? (row.specialties as string[]) : [],
    experience: Number(row.experience ?? 0),
    rating: Number(row.rating ?? 5),
    reviewCount: Number(row.review_count ?? 0),
    hourlyRate: Number(row.hourly_rate ?? 0),
    distanceFromCenter: Number(row.distance_from_center ?? 0),
    workingCity: typeof row.working_city === 'string' ? row.working_city : '',
    isAvailable: Boolean(row.is_available ?? true),
    availability:
      typeof row.availability === 'object' && row.availability !== null
        ? (row.availability as Record<string, string[]>)
        : {},
    languages: Array.isArray(row.languages) ? (row.languages as string[]) : [],
    certifications: Array.isArray(row.certifications) ? (row.certifications as string[]) : [],
    createdAt: toIso(row.created_at),
  };
}

function mapPromotion(row: JsonObject): Promotion {
  return {
    id: String(row.id ?? ''),
    code: String(row.code ?? ''),
    description: String(row.description ?? ''),
    discountPercent: Number(row.discount_percent ?? 0),
    maxDiscountAmount: Number(row.max_discount_amount ?? 0),
    minOrderAmount: Number(row.min_order_amount ?? 0),
    expiryDate: toIso(row.expiry_date, ''),
    maxUses: Number(row.max_uses ?? 0),
    currentUses: Number(row.current_uses ?? 0),
    conditions: Array.isArray(row.conditions) ? (row.conditions as string[]) : [],
    isActive: Boolean(row.is_active ?? true),
    createdAt: toIso(row.created_at),
  };
}

function payloadToRecord(row: JsonObject): JsonObject & { id: string } {
  const payload =
    typeof row.payload === 'object' && row.payload !== null ? (row.payload as JsonObject) : {};
  return {
    ...payload,
    id: String(row.id ?? ''),
    status: row.status ?? payload.status,
    createdAt: row.created_at ?? payload.createdAt,
    updatedAt: row.updated_at ?? payload.updatedAt,
  };
}

/**
 * CUSTOM AUTH (phone + password, no Supabase Auth)
 * Password is hashed with bcrypt server-side via pgcrypto.
 */
export async function signUpWithPhone(phoneNumber: string, password: string): Promise<string> {
  const phone = normalizePhone(phoneNumber);
  console.log('[signUpWithPhone] calling RPC with phone:', phone);
  const { data, error } = await withAuthTimeout(
    supabase.rpc('signup_with_phone', {
      p_phone: phone,
      p_password: password,
    }),
  );
  if (error) {
    console.warn('[signUpWithPhone] RPC error:', error.message, error.code, error.details, error.hint);
    const msg = (error.message ?? '').toLowerCase();
    if (msg.includes('phone_already_registered') || msg.includes('unique')) {
      // Phone exists in app_users — try to sign in with same password
      const existingUid = await signInWithPhonePassword(phone, password);
      if (existingUid) {
        return existingUid; // Same phone + same password → return existing UID
      }
      throw new Error('phone_already_registered');
    }
    throw new Error(error.message || `Supabase error ${error.code}`);
  }
  return data as string; // returns UUID
}

export async function signInWithPhonePassword(phoneNumber: string, password: string): Promise<string | null> {
  const phone = normalizePhone(phoneNumber);

  // Step 1: Fetch user row by phone (fast REST query, no bcrypt on server)
  const { data: user, error } = await withTimeout(
    supabase
      .from('app_users')
      .select('id, password_hash')
      .eq('phone_number', phone)
      .maybeSingle(),
  );

  if (error) {
    console.warn('[signInWithPhonePassword] query error:', error.message);
    throw error;
  }
  if (!user) {
    return null; // phone not found
  }

  // Step 2: Verify password client-side with bcryptjs (pure JS, fast)
  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return null; // wrong password
  }

  return user.id as string;
}

export async function signInUserAccountWithPhone(
  phoneNumber: string,
  password: string,
): Promise<Record<string, unknown> | null> {
  const uid = await signInWithPhonePassword(phoneNumber, password);
  if (!uid) return null;

  // Try to find profile by UID first
  let profile = await getUserProfileByUid(uid);
  if (profile) return profile;

  // Fallback: search profile by phone number (handles cases where profile
  // exists with a different id than the app_users uid)
  const phone = normalizePhone(phoneNumber);
  profile = await getUserProfileByPhone(phone);
  if (profile) {
    // Update profile id to match app_users uid for consistency
    const corrected = { ...profile, authUid: uid };
    await upsertUserProfile(corrected);
    return corrected;
  }

  // No profile at all — create one
  const createdAt = new Date().toISOString();
  const fallback = {
    authUid: uid,
    phoneNumber: phone,
    role: 'customer',
    partnerApplicationStatus: 'none',
    createdAt,
  };
  await upsertUserProfile(fallback);
  return fallback;
}

export async function signOutUserAccount(): Promise<void> {
  // Custom auth: nothing to do server-side, AsyncStorage is cleared by UserContext
}

/**
 * SERVICES
 */
export async function getServices(): Promise<Service[]> {
  const { data, error } = await withTimeout(
    supabase.from('services').select('*').eq('is_active', true),
  );
  if (error || !data) {
    warnCatalogPermissionOnce(error);
    return FALLBACK_SERVICES;
  }
  return (data as JsonObject[]).map((row: JsonObject) => mapService(row));
}

export async function getServiceById(serviceId: string): Promise<Service | null> {
  const { data, error } = await withTimeout(
    supabase.from('services').select('*').eq('id', serviceId).maybeSingle(),
  );
  if (error || !data) {
    warnCatalogPermissionOnce(error);
    return FALLBACK_SERVICES.find((item) => item.id === serviceId) ?? null;
  }
  return mapService(data as JsonObject);
}

/**
 * THERAPISTS
 */
export async function getTherapists(): Promise<Therapist[]> {
  // First try RPC that filters by minimum wallet balance (500,000đ)
  try {
    const { data: rpcData, error: rpcError } = await withTimeout(
      supabase.rpc('get_available_therapists_with_min_balance', { p_min_balance: 500000 }),
    );
    if (!rpcError && rpcData) {
      return (rpcData as JsonObject[]).map((row: JsonObject) => mapTherapist(row));
    }
  } catch {
    // Fallback to basic query
  }

  // Fallback: basic query (is_available = true only)
  const { data, error } = await withTimeout(
    supabase.from('therapists').select('*').eq('is_available', true),
  );
  if (error || !data) {
    warnCatalogPermissionOnce(error);
    return FALLBACK_THERAPISTS;
  }
  return (data as JsonObject[]).map((row: JsonObject) => mapTherapist(row));
}

export async function getTherapistById(therapistId: string): Promise<Therapist | null> {
  const { data, error } = await withTimeout(
    supabase.from('therapists').select('*').eq('id', therapistId).maybeSingle(),
  );
  if (error || !data) {
    warnCatalogPermissionOnce(error);
    return FALLBACK_THERAPISTS.find((item) => item.id === therapistId) ?? null;
  }
  return mapTherapist(data as JsonObject);
}

export async function getTherapistsBySpecialty(specialty: string): Promise<Therapist[]> {
  const therapists = await getTherapists();
  return therapists.filter((therapist) =>
    therapist.specialties.some((item) => item.toLowerCase().includes(specialty.toLowerCase())),
  );
}

/**
 * BOOKINGS
 */
export async function createBooking(bookingData: Omit<Booking, 'id'>): Promise<string> {
  const now = new Date().toISOString();
  const payload = { ...bookingData, createdAt: bookingData.createdAt ?? now };
  const { data, error } = await withTimeout(
    supabase
      .from('bookings')
      .insert({
        user_id: bookingData.userId,
        therapist_id: bookingData.therapistId,
        status: bookingData.status,
        payload,
      })
      .select('id')
      .single(),
  );
  if (error || !data) {
    throw error ?? new Error('create-booking-failed');
  }
  return String(data.id);
}

export async function getBookingsByUserId(userId: string): Promise<Booking[]> {
  const { data, error } = await withTimeout(
    supabase.from('bookings').select('*').eq('user_id', userId),
  );
  if (error || !data) {
    return [];
  }
  return (data as JsonObject[]).map((row: JsonObject) => payloadToRecord(row) as unknown as Booking);
}

export async function getBookingById(bookingId: string): Promise<Booking | null> {
  const { data, error } = await withTimeout(
    supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle(),
  );
  if (error || !data) {
    return null;
  }
  return payloadToRecord(data as JsonObject) as unknown as Booking;
}

export async function updateBookingStatus(bookingId: string, status: Booking['status']): Promise<void> {
  const { error } = await withTimeout(
    supabase.from('bookings').update({ status }).eq('id', bookingId),
  );
  if (error) {
    throw error;
  }
}

export async function createSharedBookingRecord(data: Record<string, unknown>): Promise<string> {
  const now = new Date().toISOString();
  const uid = await getStoredUid();
  const userId = uid || String(data.userId ?? data.customerPhone ?? '');
  const { data: row, error } = await withTimeout(
    supabase
      .from('bookings')
      .insert({
        user_id: userId,
        therapist_id: String(data.therapistId ?? ''),
        status: String(data.status ?? 'pending'),
        payload: { ...data, createdAt: data.createdAt ?? now },
      })
      .select('id')
      .single(),
  );
  if (error || !row) {
    throw error ?? new Error('create-shared-booking-failed');
  }
  return String(row.id);
}

export async function getSharedBookingRecords(): Promise<(Record<string, unknown> & { id: string })[]> {
  const { data, error } = await withTimeout(
    supabase.from('bookings').select('*').order('created_at', { ascending: false }),
  );
  if (error || !data) {
    return [];
  }
  return (data as JsonObject[]).map((row: JsonObject) => payloadToRecord(row)) as (Record<string, unknown> & {
    id: string;
  })[];
}

export async function updateSharedBookingStatus(bookingId: string, status: string): Promise<void> {
  const { error } = await withTimeout(
    supabase.from('bookings').update({ status }).eq('id', bookingId),
  );
  if (error) {
    throw error;
  }
}

export async function cancelBooking(bookingId: string, reason: string): Promise<void> {
  const { error } = await withTimeout(
    supabase
      .from('bookings')
      .update({ status: 'cancelled', payload: { cancellationReason: reason } })
      .eq('id', bookingId),
  );
  if (error) {
    throw error;
  }
}

/**
 * REVIEWS
 */
export async function createReview(reviewData: Omit<Review, 'id'>): Promise<void> {
  const payload = { ...reviewData, createdAt: reviewData.createdAt ?? new Date().toISOString() };
  const { error } = await withTimeout(
    supabase.from('reviews').insert({
      user_id: reviewData.userId,
      therapist_id: reviewData.therapistId,
      service_id: reviewData.serviceId,
      payload,
    }),
  );
  if (error) {
    throw error;
  }
}

export async function getReviewsByTherapist(therapistId: string): Promise<Review[]> {
  const { data, error } = await withTimeout(
    supabase.from('reviews').select('*').eq('therapist_id', therapistId),
  );
  if (error || !data) {
    return [];
  }
  return (data as JsonObject[]).map((row: JsonObject) => payloadToRecord(row) as unknown as Review);
}

export async function createSharedReviewRecord(data: Record<string, unknown>): Promise<string> {
  const uid = await getStoredUid();
  const userId = uid || String(data.customerPhone ?? data.userId ?? '');
  const { data: row, error } = await withTimeout(
    supabase
      .from('reviews')
      .insert({
        user_id: userId,
        therapist_id: String(data.therapistId ?? ''),
        service_id: String(data.service ?? ''),
        payload: { ...data, createdAt: data.createdAt ?? new Date().toISOString() },
      })
      .select('id')
      .single(),
  );
  if (error || !row) {
    throw error ?? new Error('create-shared-review-failed');
  }
  return String(row.id);
}

export async function getSharedReviewRecords(): Promise<(Record<string, unknown> & { id: string })[]> {
  const { data, error } = await withTimeout(
    supabase.from('reviews').select('*').order('created_at', { ascending: false }),
  );
  if (error || !data) {
    return [];
  }
  return (data as JsonObject[]).map((row: JsonObject) => payloadToRecord(row)) as (Record<string, unknown> & {
    id: string;
  })[];
}

/**
 * SAVED ADDRESSES
 */
export async function getSavedAddresses(userId: string): Promise<SavedAddress[]> {
  const { data, error } = await withTimeout(
    supabase.from('addresses').select('*').eq('user_id', userId),
  );
  if (error || !data) {
    return [];
  }
  return (data as JsonObject[]).map((row: JsonObject) => payloadToRecord(row) as unknown as SavedAddress);
}

export async function addSavedAddress(addressData: Omit<SavedAddress, 'id'>): Promise<string> {
  const { data, error } = await withTimeout(
    supabase
      .from('addresses')
      .insert({
        user_id: addressData.userId,
        payload: { ...addressData, createdAt: addressData.createdAt ?? new Date().toISOString() },
      })
      .select('id')
      .single(),
  );
  if (error || !data) {
    throw error ?? new Error('add-address-failed');
  }
  return String(data.id);
}

export async function deleteSavedAddress(addressId: string): Promise<void> {
  const { error } = await withTimeout(supabase.from('addresses').delete().eq('id', addressId));
  if (error) {
    throw error;
  }
}

/**
 * PROMOTIONS
 */
export async function getActivePromotions(): Promise<Promotion[]> {
  const { data, error } = await withTimeout(
    supabase.from('promotions').select('*').eq('is_active', true),
  );
  if (error || !data) {
    warnCatalogPermissionOnce(error);
    return FALLBACK_PROMOTIONS;
  }
  const now = new Date().toISOString();
  return (data as JsonObject[])
    .map((row: JsonObject) => mapPromotion(row))
    .filter((promotion: Promotion) => !promotion.expiryDate || promotion.expiryDate >= now);
}

export async function verifyPromoCode(code: string): Promise<Promotion | null> {
  const { data, error } = await withTimeout(
    supabase.from('promotions').select('*').eq('code', code.toUpperCase()).maybeSingle(),
  );
  if (error || !data) {
    warnCatalogPermissionOnce(error);
    return FALLBACK_PROMOTIONS.find((item) => item.code === code.toUpperCase()) ?? null;
  }
  const promotion = mapPromotion(data as JsonObject);
  return promotion.isActive ? promotion : null;
}

/**
 * PARTNER APPLICATIONS
 */
export async function createPartnerApplication(payload: PartnerApplicationPayload): Promise<string> {
  const uid = await getStoredUid();
  const { data, error } = await withTimeout(
    supabase
      .from('partner_applications')
      .insert({
        user_id: uid,
        phone_number: normalizePhone(payload.phoneNumber),
        status: 'pending',
        image_moderation_status: 'pending',
        reviewed_by_admin: false,
        payload,
      })
      .select('id')
      .single(),
  );
  if (error || !data) {
    throw error ?? new Error('create-partner-application-failed');
  }
  return String(data.id);
}

export async function getLatestPartnerApplicationByPhone(
  phoneNumber: string,
): Promise<PartnerApplicationRecord | null> {
  const { data, error } = await withTimeout(
    supabase
      .from('partner_applications')
      .select('*')
      .eq('phone_number', normalizePhone(phoneNumber))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (error || !data) {
    return null;
  }
  const payload =
    typeof data.payload === 'object' && data.payload !== null ? (data.payload as JsonObject) : {};
  return {
    ...(payload as unknown as PartnerApplicationPayload),
    id: String(data.id),
    status: String(data.status) as PartnerApplicationStatus,
    imageModerationStatus: String(data.image_moderation_status ?? 'pending') as
      | 'pending'
      | 'approved'
      | 'rejected',
    reviewedByAdmin: Boolean(data.reviewed_by_admin),
    createdAt: toIso(data.created_at),
    approvedAt: typeof data.approved_at === 'string' ? data.approved_at : undefined,
  };
}

export async function getLatestPartnerApplicationByUserId(
  userId: string,
): Promise<PartnerApplicationRecord | null> {
  const { data, error } = await withTimeout(
    supabase
      .from('partner_applications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (error || !data) {
    return null;
  }
  const payload =
    typeof data.payload === 'object' && data.payload !== null ? (data.payload as JsonObject) : {};
  return {
    ...(payload as unknown as PartnerApplicationPayload),
    id: String(data.id),
    status: String(data.status) as PartnerApplicationStatus,
    imageModerationStatus: String(data.image_moderation_status ?? 'pending') as
      | 'pending'
      | 'approved'
      | 'rejected',
    reviewedByAdmin: Boolean(data.reviewed_by_admin),
    createdAt: toIso(data.created_at),
    approvedAt: typeof data.approved_at === 'string' ? data.approved_at : undefined,
  };
}

/**
 * NOTIFICATIONS
 */
export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await withTimeout(
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  );
  if (error || !data) {
    return [];
  }
  return (data as JsonObject[]).map((row: JsonObject) => {
    const payload =
      typeof row.payload === 'object' && row.payload !== null ? (row.payload as JsonObject) : {};
    return {
      id: String(row.id),
      userId: String(row.user_id ?? ''),
      title: String(payload.title ?? ''),
      titleEn: String(payload.titleEn ?? ''),
      message: String(payload.message ?? ''),
      messageEn: String(payload.messageEn ?? ''),
      type: String(payload.type ?? 'booking') as Notification['type'],
      relatedId: typeof payload.relatedId === 'string' ? payload.relatedId : undefined,
      isRead: Boolean(row.is_read),
      createdAt: toIso(row.created_at),
    };
  });
}

export async function createNotification(notificationData: Omit<Notification, 'id'>): Promise<void> {
  const { error } = await withTimeout(
    supabase.from('notifications').insert({
      user_id: notificationData.userId,
      is_read: notificationData.isRead ?? false,
      payload: notificationData,
      created_at: notificationData.createdAt ?? new Date().toISOString(),
    }),
  );
  if (error) {
    throw error;
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const { error } = await withTimeout(
    supabase.from('notifications').update({ is_read: true }).eq('id', notificationId),
  );
  if (error) {
    throw error;
  }
}

/**
 * NOTIFICATION HELPERS
 */

/** Get all therapist profile IDs in a given city */
export async function getTherapistIdsByCity(city: string): Promise<string[]> {
  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .select('id')
      .eq('role', 'therapist')
      .eq('working_city', city),
  );
  if (error || !data) return [];
  return (data as { id: string }[]).map((r) => r.id);
}

/** Send booking confirmation notification to customer */
export async function notifyBookingConfirmed(
  userId: string,
  bookingId: string,
  therapistName: string,
  service: string,
  date: string,
  time: string,
): Promise<void> {
  await createNotification({
    userId,
    title: `Đặt lịch thành công`,
    titleEn: `Booking Confirmed`,
    message: `Bạn đã đặt dịch vụ ${service} với ${therapistName} vào ${date} lúc ${time}.`,
    messageEn: `You booked ${service} with ${therapistName} on ${date} at ${time}.`,
    type: 'booking',
    relatedId: bookingId,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

/** Send booking completed notification to customer */
export async function notifyBookingCompleted(
  userId: string,
  bookingId: string,
  therapistName: string,
  service: string,
): Promise<void> {
  await createNotification({
    userId,
    title: `Đơn hoàn thành`,
    titleEn: `Booking Completed`,
    message: `Dịch vụ ${service} với ${therapistName} đã hoàn thành. Cảm ơn bạn đã sử dụng dịch vụ!`,
    messageEn: `${service} with ${therapistName} is completed. Thank you for using our service!`,
    type: 'booking',
    relatedId: bookingId,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

/** Send review reminder notification to customer */
export async function notifyReviewReminder(
  userId: string,
  bookingId: string,
  therapistName: string,
): Promise<void> {
  await createNotification({
    userId,
    title: `Đánh giá kỹ thuật viên`,
    titleEn: `Rate Your Therapist`,
    message: `Hãy đánh giá ${therapistName} để giúp cải thiện chất lượng dịch vụ nhé!`,
    messageEn: `Please rate ${therapistName} to help improve service quality!`,
    type: 'review',
    relatedId: bookingId,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

/** Send new job notification to all therapists in the same city */
export async function notifyNewJobForCity(
  city: string,
  bookingId: string,
  customerName: string,
  service: string,
  date: string,
  time: string,
  address: string,
  excludeTherapistId?: string,
): Promise<void> {
  const therapistIds = await getTherapistIdsByCity(city);
  const targets = excludeTherapistId
    ? therapistIds.filter((id) => id !== excludeTherapistId)
    : therapistIds;

  await Promise.all(
    targets.map((therapistUserId) =>
      createNotification({
        userId: therapistUserId,
        title: `Việc mới tại ${city}`,
        titleEn: `New Job in ${city}`,
        message: `Khách ${customerName} cần ${service} vào ${date} lúc ${time} tại ${address}. Ứng tuyển ngay!`,
        messageEn: `Client ${customerName} needs ${service} on ${date} at ${time} at ${address}. Apply now!`,
        type: 'job',
        relatedId: bookingId,
        isRead: false,
        createdAt: new Date().toISOString(),
      }).catch(() => {}),
    ),
  );
}

/** Send promotion notification to a user */
export async function notifyPromotion(
  userId: string,
  promoTitle: string,
  promoTitleEn: string,
  promoMessage: string,
  promoMessageEn: string,
  promoId?: string,
): Promise<void> {
  await createNotification({
    userId,
    title: promoTitle,
    titleEn: promoTitleEn,
    message: promoMessage,
    messageEn: promoMessageEn,
    type: 'promotion',
    relatedId: promoId,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

/**
 * USER PROFILE
 */
export async function getUserProfileByPhone(phoneNumber: string): Promise<Record<string, unknown> | null> {
  const normalized = normalizePhone(phoneNumber);
  const { data, error } = await withTimeout(
    supabase.from('profiles').select('*').eq('phone_number', normalized).maybeSingle(),
  );
  if (error || !data) {
    return null;
  }
  return {
    authUid: data.id,
    email: data.email ?? undefined,
    phoneNumber: data.phone_number ?? '',
    displayName: data.display_name,
    gender: data.gender,
    nationality: data.nationality,
    avatarUri: data.avatar_uri,
    role: data.role,
    workingCity: data.working_city,
    serviceImages: Array.isArray(data.service_images) ? data.service_images : [],
    services: Array.isArray(data.services) ? data.services : [],
    isVipMember: Boolean(data.is_vip_member),
    vipPlanId: data.vip_plan_id,
    vipExpiresAt: data.vip_expires_at,
    partnerApplicationId: data.partner_application_id,
    partnerApplicationStatus: data.partner_application_status,
    partnerRoleApprovedAt: data.partner_role_approved_at,
    partnerRoleNoticeSeenAt: data.partner_role_notice_seen_at,
    selectedCity: data.selected_city,
    createdAt: toIso(data.created_at),
    updatedAt: toIso(data.updated_at),
  };
}

export async function getUserProfileByUid(uid: string): Promise<Record<string, unknown> | null> {
  // Try RPC first (SECURITY DEFINER, bypasses RLS)
  const { data: rpcData, error: rpcError } = await withTimeout(
    supabase.rpc('get_profile_by_uid', { p_uid: uid }),
  ).catch((err) => ({ data: null, error: err }));

  if (!rpcError && rpcData) {
    return mapProfileRow(rpcData as Record<string, unknown>);
  }

  // Fallback to direct query if RPC not available or failed
  if (rpcError) {
    console.warn('[getUserProfileByUid] RPC failed, trying direct query:', rpcError.message ?? rpcError);
    const { data, error } = await withTimeout(
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    ).catch((err) => ({ data: null, error: err }));
    if (error || !data) {
      return null;
    }
    return mapProfileRow(data as Record<string, unknown>);
  }

  return null;
}

function mapProfileRow(data: Record<string, unknown>): Record<string, unknown> {
  return {
    authUid: data.id,
    email: data.email ?? undefined,
    phoneNumber: data.phone_number ?? '',
    displayName: data.display_name,
    gender: data.gender,
    nationality: data.nationality,
    avatarUri: data.avatar_uri,
    role: data.role,
    workingCity: data.working_city,
    serviceImages: Array.isArray(data.service_images) ? data.service_images : [],
    services: Array.isArray(data.services) ? data.services : [],
    isVipMember: Boolean(data.is_vip_member),
    vipPlanId: data.vip_plan_id,
    vipExpiresAt: data.vip_expires_at,
    partnerApplicationId: data.partner_application_id,
    partnerApplicationStatus: data.partner_application_status,
    partnerRoleApprovedAt: data.partner_role_approved_at,
    partnerRoleNoticeSeenAt: data.partner_role_notice_seen_at,
    selectedCity: data.selected_city,
    createdAt: toIso(data.created_at),
    updatedAt: toIso(data.updated_at),
  };
}

export async function upsertUserProfile(profile: Record<string, unknown>): Promise<void> {
  const uid = String(profile.authUid ?? '');
  const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : null;
  const phone = profile.phoneNumber != null && String(profile.phoneNumber).trim()
    ? normalizePhone(String(profile.phoneNumber))
    : null;
  if (!uid) {
    return;
  }

  const payload: Record<string, unknown> = {
    id: uid,
    phone_number: phone || null,
    display_name: String(profile.displayName ?? ''),
    gender: profile.gender ?? null,
    nationality: profile.nationality ?? null,
    avatar_uri: profile.avatarUri ?? null,
    role: String(profile.role ?? 'customer'),
    working_city: profile.workingCity ?? null,
    service_images: Array.isArray(profile.serviceImages) ? profile.serviceImages : [],
    services: Array.isArray(profile.services) ? profile.services : [],
    is_vip_member: Boolean(profile.isVipMember ?? false),
    vip_plan_id: profile.vipPlanId ?? null,
    vip_expires_at: profile.vipExpiresAt ?? null,
    partner_application_id: profile.partnerApplicationId ?? null,
    partner_application_status: String(profile.partnerApplicationStatus ?? 'none'),
    partner_role_approved_at: profile.partnerRoleApprovedAt ?? null,
    partner_role_notice_seen_at: profile.partnerRoleNoticeSeenAt ?? null,
    selected_city: profile.selectedCity ?? null,
    created_at: toIso(profile.createdAt),
    updated_at: new Date().toISOString(),
  };
  // Only include email if it has a value
  if (email) {
    payload.email = email;
  }

  // Try RPC first (SECURITY DEFINER, bypasses RLS)
  const { error: rpcError } = await withTimeout(
    supabase.rpc('upsert_profile', { p_data: payload }),
  );

  if (!rpcError) {
    return;
  }

  // Fallback to direct upsert if RPC not available
  console.warn('[upsertUserProfile] RPC failed, trying direct upsert:', rpcError.message);
  const { error } = await withTimeout(
    supabase.from('profiles').upsert(payload, {
      onConflict: 'id',
    }),
  );
  if (error) {
    throw error;
  }
}

/**
 * WALLET
 */
export type WalletData = {
  id: string;
  userId: string;
  balance: number;
};

export type WalletTransaction = {
  id: string;
  walletId: string;
  userId: string;
  type: 'topup' | 'payment' | 'earning' | 'fee' | 'refund' | 'withdrawal';
  amount: number;
  balanceAfter: number;
  description: string | null;
  referenceId: string | null;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
};

/**
 * USER ROLE MANAGEMENT
 */
export async function updateUserRole(userId: string, role: 'customer' | 'therapist'): Promise<void> {
  const { error } = await withTimeout(
    supabase.rpc('update_user_role', { p_user_id: userId, p_role: role }),
  );
  if (error) {
    throw error;
  }
}

export async function getUserRole(userId: string): Promise<string | null> {
  const { data, error } = await withTimeout(
    supabase.rpc('get_user_role', { p_user_id: userId }),
  );
  if (error) {
    return null;
  }
  return data as string;
}

export async function getOrCreateWallet(userId: string): Promise<WalletData> {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_or_create_wallet', { p_user_id: userId }),
    );
    if (error) {
      console.warn('[getOrCreateWallet] RPC error, trying direct query:', error.message);
      // Fallback: direct upsert
      const { data: row, error: e2 } = await withTimeout(
        supabase.from('wallets').upsert({ user_id: userId, balance: 0 }, { onConflict: 'user_id' }).select().single(),
      );
      if (e2 || !row) {
        console.warn('[getOrCreateWallet] Fallback also failed, returning default wallet');
        return { id: '', userId, balance: 0 };
      }
      return { id: String(row.id), userId: String(row.user_id), balance: Number(row.balance) };
    }
    const w = data as Record<string, unknown>;
    return { id: String(w.id), userId: String(w.user_id), balance: Number(w.balance) };
  } catch (err) {
    console.warn('[getOrCreateWallet] Unexpected error, returning default wallet:', err);
    return { id: '', userId, balance: 0 };
  }
}

export async function walletTopUp(userId: string, amount: number, method: string = 'bank'): Promise<{ transactionId: string; balance: number }> {
  const { data, error } = await withTimeout(
    supabase.rpc('wallet_topup', { p_user_id: userId, p_amount: amount, p_method: method }),
  );
  if (error) throw error;
  const result = data as Record<string, unknown>;
  return {
    transactionId: String(result.transaction_id),
    balance: Number(result.balance),
  };
}

export async function walletDeduct(
  userId: string,
  amount: number,
  type: string,
  description: string = '',
  referenceId: string | null = null,
): Promise<{ transactionId: string; balance: number }> {
  const { data, error } = await withTimeout(
    supabase.rpc('wallet_deduct', {
      p_user_id: userId,
      p_amount: amount,
      p_type: type,
      p_description: description,
      p_reference_id: referenceId,
    }),
  );
  if (error) throw error;
  const result = data as Record<string, unknown>;
  return {
    transactionId: String(result.transaction_id),
    balance: Number(result.balance),
  };
}

export async function getWalletTransactions(userId: string, limit = 50, offset = 0): Promise<WalletTransaction[]> {
  const { data, error } = await withTimeout(
    supabase.rpc('get_wallet_transactions', { p_user_id: userId, p_limit: limit, p_offset: offset }),
  );
  if (error) throw error;
  const rows = (data as Record<string, unknown>[]) || [];
  return rows.map((r) => ({
    id: String(r.id),
    walletId: String(r.wallet_id),
    userId: String(r.user_id),
    type: r.type as WalletTransaction['type'],
    amount: Number(r.amount),
    balanceAfter: Number(r.balance_after),
    description: r.description ? String(r.description) : null,
    referenceId: r.reference_id ? String(r.reference_id) : null,
    status: r.status as WalletTransaction['status'],
    createdAt: String(r.created_at),
  }));
}

/**
 * WITHDRAWAL REQUESTS
 */
export type WithdrawalRequest = {
  id: string;
  userId: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  status: 'pending' | 'completed' | 'rejected';
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function createWithdrawalRequest(
  userId: string,
  amount: number,
  bankName: string,
  accountNumber: string,
  accountHolder: string,
): Promise<{ requestId: string; transactionId: string; balance: number }> {
  const { data, error } = await withTimeout(
    supabase.rpc('create_withdrawal_request', {
      p_user_id: userId,
      p_amount: amount,
      p_bank_name: bankName,
      p_account_number: accountNumber,
      p_account_holder: accountHolder,
    }),
  );
  if (error) throw error;
  const result = data as Record<string, unknown>;
  return {
    requestId: String(result.request_id),
    transactionId: String(result.transaction_id),
    balance: Number(result.balance),
  };
}

export async function getWithdrawalRequests(userId: string): Promise<WithdrawalRequest[]> {
  const { data, error } = await withTimeout(
    supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  );
  if (error) throw error;
  return ((data as Record<string, unknown>[]) || []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    amount: Number(r.amount),
    bankName: String(r.bank_name),
    accountNumber: String(r.account_number),
    accountHolder: String(r.account_holder),
    status: r.status as WithdrawalRequest['status'],
    adminNote: r.admin_note ? String(r.admin_note) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

/**
 * THERAPIST EARNINGS (credit 70% of booking value)
 */
export async function creditTherapistEarning(
  therapistUserId: string,
  bookingId: string,
  totalAmount: number,
  commissionRate: number = 0.7,
): Promise<{ transactionId: string; earningAmount: number; balance: number }> {
  const { data, error } = await withTimeout(
    supabase.rpc('credit_therapist_earning', {
      p_therapist_user_id: therapistUserId,
      p_booking_id: bookingId,
      p_total_amount: totalAmount,
      p_commission_rate: commissionRate,
    }),
  );
  if (error) throw error;
  const result = data as Record<string, unknown>;
  return {
    transactionId: String(result.transaction_id),
    earningAmount: Number(result.earning_amount),
    balance: Number(result.balance),
  };
}

/**
 * CHECK THERAPIST MINIMUM BALANCE
 */
export async function checkTherapistMinBalance(userId: string, minBalance: number = 500000): Promise<boolean> {
  const { data, error } = await withTimeout(
    supabase.rpc('check_therapist_min_balance', { p_user_id: userId, p_min_balance: minBalance }),
  );
  if (error) return false;
  return Boolean(data);
}

/**
 * THERAPIST SHIFTS
 */

export interface TherapistShiftData {
  shiftDate: string; // 'YYYY-MM-DD'
  slots: string[];
}

export async function saveTherapistShifts(
  userId: string,
  shiftDate: string,
  slots: string[],
  userName: string = '',
): Promise<void> {
  const { error } = await withTimeout(
    supabase.rpc('upsert_therapist_shifts', {
      p_user_id: userId,
      p_shift_date: shiftDate,
      p_slots: slots,
      p_display_name: userName,
    }),
  );
  if (error) {
    console.warn('[saveTherapistShifts] RPC error, trying direct upsert:', error.message);
    const { error: e2 } = await withTimeout(
      supabase
        .from('therapist_shifts')
        .upsert(
          { user_id: userId, display_name: userName, shift_date: shiftDate, slots, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,shift_date' },
        ),
    );
    if (e2) throw e2;
  }
}

export async function getTherapistShifts(
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<TherapistShiftData[]> {
  const { data, error } = await withTimeout(
    supabase.rpc('get_therapist_shifts', {
      p_user_id: userId,
      p_from_date: fromDate,
      p_to_date: toDate,
    }),
  );
  if (error) {
    console.warn('[getTherapistShifts] RPC error, trying direct query:', error.message);
    const { data: rows, error: e2 } = await withTimeout(
      supabase
        .from('therapist_shifts')
        .select('shift_date, slots')
        .eq('user_id', userId)
        .gte('shift_date', fromDate)
        .lte('shift_date', toDate)
        .order('shift_date'),
    );
    if (e2) throw e2;
    return (rows || []).map((r: Record<string, unknown>) => ({
      shiftDate: String(r.shift_date),
      slots: (r.slots as string[]) || [],
    }));
  }
  const rows = (data as Record<string, unknown>[]) || [];
  return rows.map((r) => ({
    shiftDate: String(r.shift_date),
    slots: (r.slots as string[]) || [],
  }));
}

export async function getTherapistShiftsForDate(
  date: string,
): Promise<{ userId: string; slots: string[] }[]> {
  const { data, error } = await withTimeout(
    supabase
      .from('therapist_shifts')
      .select('user_id, slots')
      .eq('shift_date', date),
  );
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    userId: String(r.user_id),
    slots: (r.slots as string[]) || [],
  }));
}

export async function updateTherapistAvailability(
  userId: string,
  isAvailable: boolean,
): Promise<void> {
  const { error } = await withTimeout(
    supabase
      .from('therapists')
      .update({ is_available: isAvailable })
      .eq('id', userId),
  );
  if (error) throw error;
}

export async function getTherapistAvailability(
  userId: string,
): Promise<boolean> {
  const { data, error } = await withTimeout(
    supabase
      .from('therapists')
      .select('is_available')
      .eq('id', userId)
      .single(),
  );
  if (error || !data) return true;
  return Boolean((data as Record<string, unknown>).is_available ?? true);
}

// ──────────────────────────────────────────────────
// Chat – Realtime messaging between customer & therapist
// ──────────────────────────────────────────────────

export interface ChatRoom {
  id: string;
  bookingId: string;
  customerId: string;
  therapistId: string;
  customerName: string;
  therapistName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderRole: 'customer' | 'therapist' | 'system';
  content: string;
  messageType: 'text' | 'image' | 'location' | 'system';
  isRead: boolean;
  createdAt: string;
}

export interface AdminChatRoom extends ChatRoom {
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  totalMessages: number;
}

function mapChatRoom(row: Record<string, unknown>): ChatRoom {
  return {
    id: String(row.id ?? ''),
    bookingId: String(row.booking_id ?? ''),
    customerId: String(row.customer_id ?? ''),
    therapistId: String(row.therapist_id ?? ''),
    customerName: String(row.customer_name ?? ''),
    therapistName: String(row.therapist_name ?? ''),
    isActive: Boolean(row.is_active ?? true),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapChatMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id ?? ''),
    roomId: String(row.room_id ?? ''),
    senderId: String(row.sender_id ?? ''),
    senderRole: (row.sender_role as ChatMessage['senderRole']) ?? 'customer',
    content: String(row.content ?? ''),
    messageType: (row.message_type as ChatMessage['messageType']) ?? 'text',
    isRead: Boolean(row.is_read ?? false),
    createdAt: String(row.created_at ?? ''),
  };
}

/** Get or create a chat room for a specific booking */
export async function getOrCreateChatRoom(
  bookingId: string,
  customerId: string,
  therapistId: string,
  customerName: string = '',
  therapistName: string = '',
): Promise<string> {
  const { data, error } = await withTimeout(
    supabase.rpc('get_or_create_chat_room', {
      p_booking_id: bookingId,
      p_customer_id: customerId,
      p_therapist_id: therapistId,
      p_customer_name: customerName,
      p_therapist_name: therapistName,
    }),
  );
  if (error) throw error;
  return String(data);
}

/** Get an existing chat room by booking ID */
export async function getChatRoomByBooking(bookingId: string): Promise<ChatRoom | null> {
  const { data, error } = await withTimeout(
    supabase
      .from('chat_rooms')
      .select('*')
      .eq('booking_id', bookingId)
      .single(),
  );
  if (error || !data) return null;
  return mapChatRoom(data as Record<string, unknown>);
}

/** Get all chat rooms for a user (customer or therapist) */
export async function getChatRoomsForUser(userId: string): Promise<ChatRoom[]> {
  const { data, error } = await withTimeout(
    supabase
      .from('chat_rooms')
      .select('*')
      .or(`customer_id.eq.${userId},therapist_id.eq.${userId}`)
      .order('updated_at', { ascending: false }),
  );
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapChatRoom);
}

/** Send a message in a chat room */
export async function sendChatMessage(
  roomId: string,
  senderId: string,
  senderRole: 'customer' | 'therapist' | 'system',
  content: string,
  messageType: 'text' | 'image' | 'location' | 'system' = 'text',
): Promise<string> {
  const { data, error } = await withTimeout(
    supabase.rpc('send_chat_message', {
      p_room_id: roomId,
      p_sender_id: senderId,
      p_sender_role: senderRole,
      p_content: content,
      p_message_type: messageType,
    }),
  );
  if (error) throw error;
  return String(data);
}

/** Get all messages in a chat room, ordered by time */
export async function getChatMessages(
  roomId: string,
  limit: number = 100,
  offset: number = 0,
): Promise<ChatMessage[]> {
  const { data, error } = await withTimeout(
    supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1),
  );
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapChatMessage);
}

/** Mark all unread messages in a room as read for a user */
export async function markChatMessagesRead(roomId: string, readerId: string): Promise<void> {
  const { error } = await withTimeout(
    supabase.rpc('mark_messages_read', {
      p_room_id: roomId,
      p_reader_id: readerId,
    }),
  );
  if (error) throw error;
}

/** Subscribe to new messages in a room (Supabase Realtime) */
export function subscribeToChatMessages(
  roomId: string,
  onNewMessage: (msg: ChatMessage) => void,
) {
  const channel = supabase
    .channel(`chat:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        onNewMessage(mapChatMessage(payload.new as Record<string, unknown>));
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ── Admin Chat Management ──────────────────────────────────

/** Admin: get all chat rooms with summary info */
export async function adminGetChatRooms(
  limit: number = 50,
  offset: number = 0,
): Promise<AdminChatRoom[]> {
  const { data, error } = await withTimeout(
    supabase.rpc('admin_get_chat_rooms', {
      p_limit: limit,
      p_offset: offset,
    }),
  );
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => ({
    id: String(row.room_id ?? ''),
    bookingId: String(row.booking_id ?? ''),
    customerId: String(row.customer_id ?? ''),
    therapistId: String(row.therapist_id ?? ''),
    customerName: String(row.customer_name ?? ''),
    therapistName: String(row.therapist_name ?? ''),
    isActive: Boolean(row.is_active ?? true),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    lastMessage: row.last_message ? String(row.last_message) : null,
    lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
    unreadCount: Number(row.unread_count ?? 0),
    totalMessages: Number(row.total_messages ?? 0),
  }));
}

/** Admin: toggle a chat room active/inactive */
export async function adminToggleChatRoom(roomId: string, isActive: boolean): Promise<void> {
  const { error } = await withTimeout(
    supabase.rpc('admin_toggle_chat_room', {
      p_room_id: roomId,
      p_is_active: isActive,
    }),
  );
  if (error) throw error;
}

