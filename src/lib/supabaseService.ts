import AsyncStorage from '@react-native-async-storage/async-storage';
import { debugLog } from '@/lib/debugLog';
import * as FileSystem from 'expo-file-system/legacy';
import { mapGlowPaymentMethodIdToZenaUnknown } from '@/lib/paymentMethodId';
import { sendPushToUser, sendPushToUsers } from '@/lib/pushNotifications';
import {
  findVirtualTherapistById,
  getVirtualTherapistShifts,
  isVirtualTherapistId,
  mergeVirtualTherapists,
} from './virtualTherapistsMock';
import { getExpoAdminDisplayName, getExpoAdminUserId } from '@/constants/adminSupport';
import { normalizeVietnamPhone } from '@/lib/phoneNormalize';
import { isSupabaseConfigured, supabase } from './supabase';
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
  userId?: string;
  applicationType: 'individual' | 'business';
  phoneNumber: string;
  displayName?: string;
  shortDescription?: string;
  gender?: 'male' | 'female' | 'other';
  workingCity?: string;
  services?: string[];
  /** In-app: local `file://` URIs; after submit, DB stores public HTTPS URLs here for admin. */
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

function normalizeVietnameseText(value: string, maxChars: number): string {
  const normalized = value.normalize('NFC');
  const chars = Array.from(normalized);
  if (chars.length <= maxChars) {
    return normalized;
  }
  return chars.slice(0, maxChars).join('');
}

function withTimeout<T>(promiseLike: PromiseLike<T>, ms = 10000): Promise<T> {
  return Promise.race([
    Promise.resolve(promiseLike),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Supabase timeout')), ms)),
  ]);
}

/** Longer timeout for auth RPCs on free-tier database */
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
  return normalizeVietnamPhone(phoneNumber);
}

/**
 * Bóc tên cột khi PostgREST / Postgres báo thiếu cột (schema chưa migrate hết).
 * Dùng cả `message` và `details` vì supabase-js đôi khi để lỗi dài ở `details`.
 */
function extractMissingColumnFromSupabaseError(error: unknown): string | null {
  if (error == null) {
    return null;
  }
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  const blob = [e.message, e.details, e.hint].filter(Boolean).join('\n');
  if (!blob.trim()) {
    return null;
  }
  const patterns: RegExp[] = [
    /column\s+["']([a-zA-Z0-9_]+)["']\s+of\s+relation/i,
    /Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i,
    /\bCould not find the '([a-zA-Z0-9_]+)' column\b/i,
    /Could not find the '([a-zA-Z0-9_]+)' column of '[^']+' in the schema cache/i,
  ];
  for (const re of patterns) {
    const m = blob.match(re);
    if (m?.[1]) {
      return m[1];
    }
  }
  const simple = blob.match(/["']([a-zA-Z0-9_]+)["']\s+does not exist/i);
  return simple?.[1] ?? null;
}

function formatSupabaseError(err: unknown): string {
  if (err == null) return 'unknown error';
  if (typeof err !== 'object') return String(err);
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  return [e.code, e.message, e.details, e.hint].filter((x) => x != null && String(x).trim()).join(' | ');
}

/** RPC upsert_profile ép uuid/timestamptz — chuỗi '' là invalid so với IS NOT NULL trong SQL. */
function sanitizeProfilePayloadForRpc(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v === '' ? null : v;
  }
  return out;
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

function firstNonEmptyString(values: unknown[]): string {
  const found = values.find((value) => typeof value === 'string' && value.trim().length > 0);
  return typeof found === 'string' ? found : '';
}

/**
 * Postgres text[] literal when exposed as a single string (some drivers / logs / RPC),
 * e.g. `{https://example.com/a.png,"https://b/c,d.png"}` — not valid JSON.
 */
function parsePostgresTextArrayLiteral(input: string): string[] {
  const s = input.trim();
  if (!s.startsWith('{') || !s.endsWith('}')) return [];
  const inner = s.slice(1, -1).trim();
  if (!inner) return [];

  const out: string[] = [];
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch === '"') {
      i++;
      let buf = '';
      while (i < inner.length) {
        if (inner[i] === '\\' && i + 1 < inner.length) {
          buf += inner[i + 1];
          i += 2;
          continue;
        }
        if (inner[i] === '"') {
          i++;
          break;
        }
        buf += inner[i];
        i++;
      }
      if (buf) out.push(buf.trim());
      while (i < inner.length && inner[i] === ',') i++;
      continue;
    }

    let start = i;
    while (i < inner.length && inner[i] !== ',') i++;
    const chunk = inner.slice(start, i).trim();
    if (chunk && chunk.toUpperCase() !== 'NULL') out.push(chunk);
    if (inner[i] === ',') i++;
  }
  return out;
}

/** Parse photo arrays from DB (text[], jsonb, or JSON string). */
function coerceImageUrlList(value: unknown): string[] {
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) {
        out.push(item.trim());
      } else if (item && typeof item === 'object' && 'url' in item && typeof (item as { url?: unknown }).url === 'string') {
        const u = (item as { url: string }).url.trim();
        if (u) out.push(u);
      }
    }
    return out;
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return [];
    if (t.startsWith('{') && t.endsWith('}')) {
      return parsePostgresTextArrayLiteral(t);
    }
    if (t.startsWith('[')) {
      try {
        return coerceImageUrlList(JSON.parse(t));
      } catch {
        return [t];
      }
    }
    return [t];
  }
  return [];
}

function partnerPayloadImageUris(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const chunks: string[][] = [
    coerceImageUrlList(p.imageUris ?? p.image_uris),
    coerceImageUrlList(p.images),
    coerceImageUrlList(p.gallery),
    coerceImageUrlList(p.photos),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of chunks) {
    for (const raw of list) {
      const t = typeof raw === 'string' ? raw.trim() : '';
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

const SUPABASE_PUBLIC_ORIGIN = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');

/** Public buckets whose objects may be stored as paths like `bucket/key` in DB. */
const STORAGE_PUBLIC_BUCKET_PREFIXES = ['partner-applications/'];

/**
 * Chuẩn hoá URL ảnh (một số API chỉ trả path `/storage/...` hoặc bucket-relative).
 */
export function normalizeTherapistMediaUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (!SUPABASE_PUBLIC_ORIGIN) return s;
  if (s.startsWith('/storage/') || s.startsWith('/storage/v1/')) {
    return `${SUPABASE_PUBLIC_ORIGIN}${s}`;
  }
  const noLeading = s.replace(/^\//, '');
  for (const prefix of STORAGE_PUBLIC_BUCKET_PREFIXES) {
    if (noLeading.startsWith(prefix)) {
      return `${SUPABASE_PUBLIC_ORIGIN}/storage/v1/object/public/${noLeading}`;
    }
  }
  return s;
}

/** True if RN Image can load this string as a remote/local resource (not emoji / junk). */
export function isRenderableTherapistImageUri(url: string): boolean {
  const n = normalizeTherapistMediaUrl(url);
  if (!n) return false;
  const lower = n.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return true;
  if (lower.startsWith('file://')) return true;
  if (lower.startsWith('content://')) return true;
  if (lower.startsWith('ph://') || lower.startsWith('assets-library://')) return true;
  if (lower.includes('/storage/v1/object/public/')) return true;
  if (lower.startsWith('blob:')) return true;
  return false;
}

/**
 * Các URI hiển thị được (đã normalize, dedupe): avatar trước, sau đó album partner (`photos`).
 * Dùng cho list/card: khi URI đầu lỗi tải có thể thử phần tử tiếp theo.
 */
export function therapistDisplayImageCandidates(t: Pick<Therapist, 'avatar' | 'photos'>): string[] {
  const tryOne = (raw: string) => {
    const n = normalizeTherapistMediaUrl(raw);
    return n && isRenderableTherapistImageUri(n) ? n : '';
  };
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const u = tryOne(raw);
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  if (typeof t.avatar === 'string') push(t.avatar);
  for (const p of t.photos ?? []) {
    if (typeof p === 'string') push(p);
  }
  return out;
}

/**
 * URI hiển thị trên UI — luôn normalize + fallback ảnh đầu trong album.
 */
export function resolveTherapistImageUriForUi(t: Pick<Therapist, 'avatar' | 'photos'>): string {
  const c = therapistDisplayImageCandidates(t);
  return c[0] ?? '';
}

/**
 * KTV chưa set avatar hợp lệ → dùng ảnh đầu trong album (photos / ảnh dịch vụ).
 */
export function coalesceTherapistAvatarFromAlbum(t: Therapist): Therapist {
  const normPhotos = (t.photos ?? [])
    .map((u) => (typeof u === 'string' ? normalizeTherapistMediaUrl(u.trim()) : ''))
    .filter(Boolean);
  const avatarTrim = typeof t.avatar === 'string' ? normalizeTherapistMediaUrl(t.avatar.trim()) : '';
  if (avatarTrim && isRenderableTherapistImageUri(avatarTrim)) {
    return {
      ...t,
      avatar: avatarTrim,
      photos: normPhotos.length > 0 ? normPhotos : t.photos,
    };
  }
  const fromAlbum = normPhotos.find((u) => isRenderableTherapistImageUri(u));
  if (fromAlbum) {
    return { ...t, avatar: fromAlbum, photos: normPhotos.length > 0 ? normPhotos : t.photos };
  }
  return { ...t, avatar: avatarTrim, photos: normPhotos.length > 0 ? normPhotos : t.photos };
}

function serviceImagesListFromRow(row: JsonObject): string[] {
  return coerceImageUrlList(row.service_images ?? row.serviceImages);
}

function mapTherapist(row: JsonObject): Therapist {
  const photoList = coerceImageUrlList(row.photos);
  const galleryUrls = coerceImageUrlList(row.service_images ?? row.serviceImages);
  const profileGalleryAvatar = galleryUrls[0] ?? '';
  const resolvedAvatar = firstNonEmptyString([
    row.avatar_url,
    row.avatar,
    row.avatar_uri,
    row.photo_url,
    photoList[0],
    profileGalleryAvatar,
  ]);
  const latitudeRaw = Number(
    row.current_latitude ?? (row as { currentLatitude?: unknown }).currentLatitude,
  );
  const longitudeRaw = Number(
    row.current_longitude ?? (row as { currentLongitude?: unknown }).currentLongitude,
  );
  const hasLiveCoords =
    Number.isFinite(latitudeRaw) &&
    Number.isFinite(longitudeRaw) &&
    latitudeRaw >= -90 &&
    latitudeRaw <= 90 &&
    longitudeRaw >= -180 &&
    longitudeRaw <= 180;
  const locationUpdatedAt =
    typeof row.location_updated_at === 'string' ? row.location_updated_at : undefined;

  const base: Therapist = {
    id: String(row.id ?? ''),
    name: String(row.name ?? 'Ky thuat vien'),
    phoneNumber: String(row.phone_number ?? ''),
    email: String(row.email ?? ''),
    gender: (String(row.gender ?? 'female') as Therapist['gender']),
    avatar: String(resolvedAvatar ?? ''),
    photos: photoList.length > 0 ? photoList : undefined,
    bio: String(row.bio ?? ''),
    bioEn: String(row.bio_en ?? row.bio ?? ''),
    specialties: Array.isArray(row.specialties) ? (row.specialties as string[]) : [],
    experience: Number(row.experience ?? 0),
    rating: Number(row.rating ?? 5),
    reviewCount: Number(row.review_count ?? 0),
    hourlyRate: Number(row.hourly_rate ?? 0),
    distanceFromCenter: Number(row.distance_from_center ?? 0),
    currentLatitude: hasLiveCoords ? latitudeRaw : undefined,
    currentLongitude: hasLiveCoords ? longitudeRaw : undefined,
    locationUpdatedAt,
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
  return coalesceTherapistAvatarFromAlbum(base);
}

/** YYYY-MM-DD theo lịch máy (không dùng UTC như toISOString) — khớp ngày lưu trong `therapist_shifts`. */
export function getLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeTherapistId(id: string): string {
  return String(id ?? '').trim().toLowerCase();
}

function parseHourToken(value: string): number | null {
  const raw = value.replace(/\s/g, '').toLowerCase();
  if (!raw) return null;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (colon) {
    const h = Number(colon[1]);
    if (!Number.isFinite(h) || h < 0 || h > 23) return null;
    return h;
  }
  const cleaned = raw.replace(/h/g, '');
  const hour = Number(cleaned);
  if (!Number.isFinite(hour)) return null;
  if (hour === 24) return 0;
  if (hour < 0 || hour > 23) return null;
  return hour;
}

function isCurrentHourInsideSlot(slot: string, nowHour: number): boolean {
  const [rawStart, rawEnd] = slot.split('-').map((item) => item.trim());
  if (!rawStart || !rawEnd) return false;
  const start = parseHourToken(rawStart);
  const end = parseHourToken(rawEnd);
  if (start === null || end === null) return false;
  if (start === end) return true;
  if (start < end) return nowHour >= start && nowHour < end;
  return nowHour >= start || nowHour < end;
}

function isTherapistWorkingNow(slots: string[], nowHour: number): boolean {
  return slots.some((slot) => isCurrentHourInsideSlot(slot, nowHour));
}

/** Ca đã đăng ký trong `therapist_shifts` hôm nay, hoặc ca ảo (demo) — `null` nếu không có dữ liệu ca. */
function slotsForTherapistOnDate(
  therapistId: string,
  shiftMap: Map<string, string[]>,
  today: string,
): string[] | null {
  const key = normalizeTherapistId(therapistId);
  if (shiftMap.has(key)) {
    return shiftMap.get(key) ?? [];
  }
  const virtualShifts = getVirtualTherapistShifts(therapistId, today, today);
  if (!virtualShifts?.length) return null;
  const row = virtualShifts.find((r) => r.shiftDate === today);
  return row ? row.slots : null;
}

/**
 * Chỉ KTV: bật is_available + đã đăng ký ca hôm nay (có slot) + đang trong khung giờ ca.
 * Dùng cho danh sách thay thế khi chờ xác nhận và cho getTherapists().
 */
export async function filterTherapistsEligibleForBookingNow(therapists: Therapist[]): Promise<Therapist[]> {
  const today = getLocalDateString();
  const shifts = await getTherapistShiftsForDate(today).catch(() => []);
  const shiftMap = new Map<string, string[]>();
  for (const s of shifts) {
    shiftMap.set(normalizeTherapistId(s.userId), s.slots);
  }
  const nowHour = new Date().getHours();
  return therapists.filter((t) => {
    if (!t.isAvailable) return false;
    const slots = slotsForTherapistOnDate(t.id, shiftMap, today);
    if (!slots || slots.length === 0) return false;
    return isTherapistWorkingNow(slots, nowHour);
  });
}

/**
 * Kiểm tra KTV có thể bấm “Đặt ngay” lúc này.
 * - Không có dòng ca nào trong `therapist_shifts` cho hôm nay (cả hệ thống) → cho qua (chưa dùng lịch ca).
 * - Đã có ít nhất một KTV đăng ký ca hôm nay: KTV này phải có dòng ca + slot + trong giờ (KTV ảo: lịch demo).
 */
export async function therapistEligibleForInstantBookNow(therapistId: string): Promise<boolean> {
  if (isVirtualTherapistId(therapistId)) {
    const therapist = await getTherapistById(therapistId);
    if (!therapist) return false;
    const [ok] = await filterTherapistsEligibleForBookingNow([therapist]);
    return Boolean(ok);
  }

  // Check raw DB is_available (not the shift-computed cache value) via SECURITY DEFINER RPC
  let rawIsAvailable = false;
  try {
    const { data: rawList } = await withTimeout(supabase.rpc('get_all_therapists_public'));
    if (Array.isArray(rawList)) {
      // RPC only returns therapists with is_available=true, so presence = available
      rawIsAvailable = (rawList as JsonObject[]).some(
        (r) => normalizeTherapistId(String(r.id ?? '')) === normalizeTherapistId(therapistId),
      );
    }
  } catch {
    // RPC not available — fallback to cached therapist
    const therapist = await getTherapistById(therapistId);
    rawIsAvailable = Boolean(therapist?.isAvailable);
  }
  if (!rawIsAvailable) return false;

  const today = getLocalDateString();
  const rows = await getTherapistShiftsForDate(today).catch(() => []);
  if (rows.length === 0) return true;

  const mine = rows.find((r) => normalizeTherapistId(r.userId) === normalizeTherapistId(therapistId));
  if (!mine) {
    // KTV bật isAvailable nhưng chưa đăng ký ca → cho đặt (24/7)
    return true;
  }

  const slots = mine.slots ?? [];
  if (slots.length === 0) return false;

  const nowHour = new Date().getHours();
  return isTherapistWorkingNow(slots, nowHour);
}

function resolveAvatarFromProfileRow(row: JsonObject): string {
  const urls = coerceImageUrlList(row.service_images ?? row.serviceImages);
  const profileGalleryAvatar = urls[0] ?? '';
  return firstNonEmptyString([row.avatar_url, row.avatar, row.avatar_uri, profileGalleryAvatar]);
}

async function hydrateTherapistAvatarsFromProfiles(therapists: Therapist[]): Promise<Therapist[]> {
  if (therapists.length === 0) {
    return therapists;
  }

  const therapistIds = therapists.map((item) => item.id).filter(Boolean);
  if (therapistIds.length === 0) {
    return therapists;
  }

  const { data, error } = await withTimeout(
    supabase.from('profiles').select('*').in('id', therapistIds),
  );
  const fallbackCoalesce = () => therapists.map((item) => coalesceTherapistAvatarFromAlbum(item));

  if (error || !Array.isArray(data)) {
    return fallbackCoalesce();
  }
  if (data.length === 0) {
    return fallbackCoalesce();
  }

  const profileById = new Map<string, JsonObject>();
  for (const row of data as JsonObject[]) {
    const id = String(row.id ?? '');
    if (id) profileById.set(id, row);
  }

  let merged = therapists.map((item) => {
    const profileRow = profileById.get(item.id);
    const photos = [...(item.photos ?? [])];
    if (profileRow) {
      const fromProfile = serviceImagesListFromRow(profileRow);
      for (const u of fromProfile) {
        if (!photos.includes(u)) photos.push(u);
      }
    }

    let avatar = item.avatar;
    if (profileRow) {
      const resolved = resolveAvatarFromProfileRow(profileRow);
      if (resolved) {
        avatar = resolved;
      }
    }

    return coalesceTherapistAvatarFromAlbum({
      ...item,
      photos: photos.length > 0 ? photos : undefined,
      avatar,
    });
  });

  const missingIds = merged
    .filter((item) => !resolveTherapistImageUriForUi(item))
    .map((item) => item.id)
    .filter(Boolean);

  if (missingIds.length === 0) {
    return merged;
  }

  const { data: appRows, error: appErr } = await withTimeout(
    supabase
      .from('partner_applications')
      .select('user_id, payload, created_at')
      .in('user_id', missingIds)
      .order('created_at', { ascending: false }),
  );

  if (appErr || !Array.isArray(appRows) || appRows.length === 0) {
    return merged;
  }

  const payloadByUserId = new Map<string, unknown>();
  for (const row of appRows as { user_id?: unknown; payload?: unknown }[]) {
    const uid = String(row.user_id ?? '');
    if (!uid || payloadByUserId.has(uid)) continue;
    payloadByUserId.set(uid, row.payload);
  }

  merged = merged.map((item) => {
    if (resolveTherapistImageUriForUi(item)) return item;
    const payload = payloadByUserId.get(item.id);
    const extra = partnerPayloadImageUris(payload);
    if (extra.length === 0) return item;
    const photos = [...(item.photos ?? [])];
    for (const u of extra) {
      if (!photos.includes(u)) photos.push(u);
    }
    return coalesceTherapistAvatarFromAlbum({
      ...item,
      photos: photos.length > 0 ? photos : undefined,
    });
  });

  return merged;
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

/** Mã chỉ dùng được khi còn hạn, đang bật, có quota (max_uses > 0) và chưa hết lượt. */
export function isPromotionRedeemable(p: Promotion, nowIso: string): boolean {
  if (!p.isActive) return false;
  if (p.expiryDate && p.expiryDate < nowIso) return false;
  if (p.maxUses <= 0) return false;
  return p.currentUses < p.maxUses;
}

export function computePromoDiscount(subtotal: number, p: Promotion): number {
  if (subtotal <= 0) return 0;
  const minOrder = Number(p.minOrderAmount) || 0;
  if (subtotal < minOrder) return 0;
  let off = Math.round(subtotal * (p.discountPercent / 100));
  const cap = Number(p.maxDiscountAmount) || 0;
  if (cap > 0) off = Math.min(off, cap);
  return Math.min(off, subtotal);
}

function payloadToRecord(row: JsonObject): JsonObject & { id: string } {
  const payload =
    typeof row.payload === 'object' && row.payload !== null ? (row.payload as JsonObject) : {};
  const merged =
    payload.paymentMethod !== undefined
      ? { ...payload, paymentMethod: mapGlowPaymentMethodIdToZenaUnknown(payload.paymentMethod) }
      : { ...payload };
  return {
    ...merged,
    id: String(row.id ?? ''),
    status: row.status ?? merged.status,
    createdAt: row.created_at ?? merged.createdAt,
    updatedAt: row.updated_at ?? merged.updatedAt,
  };
}

/**
 * CUSTOM AUTH (phone + password, no Supabase Auth)
 * Password is hashed server-side via pgcrypto.
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
    debugLog('signUpWithPhone', 'rpc error', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    const msg = (error.message ?? '').toLowerCase();
    const code = String((error as { code?: string }).code ?? '').toLowerCase();
    if (
      msg.includes('phone_already_registered') ||
      msg.includes('unique') ||
      (code === 'p0001' && msg.includes('phone_already'))
    ) {
      // SĐT đã có trong profiles — thử đăng nhập cùng mật khẩu
      const existingUid = await signInWithPhonePassword(phone, password);
      if (existingUid) {
        return existingUid; // Same phone + same password → return existing UID
      }
      throw new Error('phone_already_registered');
    }

    throw new Error(error.message || `Supabase error ${error.code}`);
  }
  const uid =
    typeof data === 'string' && data.trim().length > 0
      ? data.trim()
      : data != null && String(data).trim().length > 0
        ? String(data).trim()
        : '';
  if (!uid || uid === 'null') {
    throw new Error('signup_no_uid_response');
  }
  return uid;
}

export async function signInWithPhonePassword(phoneNumber: string, password: string): Promise<string | null> {
  const phone = normalizePhone(phoneNumber);
  const { data, error } = await withAuthTimeout(
    supabase.rpc('signin_with_phone', {
      p_phone: phone,
      p_password: password,
    }),
  );

  if (error) {
    console.warn('[signInWithPhonePassword] RPC error:', error.message, error.code, error.details, error.hint);
    debugLog('signInWithPhonePassword', 'rpc error', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message || `Supabase error ${error.code}`);
  }
  return (data as string | null) ?? null;
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

  // Fallback: tìm profile theo SĐT (dữ liệu cũ lệch id)
  const phone = normalizePhone(phoneNumber);
  profile = await getUserProfileByPhone(phone);
  if (profile) {
    // Gộp authUid về uid vừa đăng nhập
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
  await supabase.auth.signOut().catch(() => {});
}

/**
 * SERVICES
 */
export async function getServices(): Promise<Service[]> {
  // Try SECURITY DEFINER RPC first to bypass RLS (custom auth has no auth.uid())
  try {
    const { data: rpcData, error: rpcError } = await withTimeout(
      supabase.rpc('get_all_services_public'),
    );
    if (!rpcError && Array.isArray(rpcData)) {
      return (rpcData as JsonObject[]).map((row: JsonObject) => mapService(row));
    }
  } catch {
    // ignore, fall through
  }

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
const THERAPISTS_CACHE_TTL_MS = 45_000;
let therapistsCache: { list: Therapist[]; fetchedAt: number } | null = null;
let therapistsFetchInFlight: Promise<Therapist[]> | null = null;

export function invalidateTherapistsListCache(): void {
  therapistsCache = null;
  therapistsFetchInFlight = null;
}

/**
 * Ghép `is_available` (DB) với ca hôm nay.
 * KTV thật: phải có dòng `therapist_shifts` + slot không rỗng + đang trong khung giờ mới “sẵn sàng”.
 * KTV ảo (demo): dùng lịch ảo từ `getVirtualTherapistShifts`.
 */
async function applyTherapistShiftAvailabilityForToday(hydrated: Therapist[]): Promise<Therapist[]> {
  const today = getLocalDateString();
  const shifts = await getTherapistShiftsForDate(today).catch(() => []);
  const shiftMap = new Map<string, string[]>();
  for (const shift of shifts) {
    shiftMap.set(normalizeTherapistId(shift.userId), shift.slots);
  }
  const nowHour = new Date().getHours();
  return hydrated.map((item) => {
    const slots = slotsForTherapistOnDate(item.id, shiftMap, today);
    const shiftAllows =
      slots != null && slots.length > 0 && isTherapistWorkingNow(slots, nowHour);
    return {
      ...item,
      isAvailable: Boolean(item.isAvailable) && shiftAllows,
    };
  });
}

async function fetchTherapistsUncached(): Promise<Therapist[]> {
  // Primary: fetch ALL is_available=true therapists regardless of wallet balance.
  // Wallet balance check is for job dispatch only, not for display.
  try {
    const { data: rpcData, error: rpcError } = await withTimeout(
      supabase.rpc('get_all_therapists_public'),
    );
    if (!rpcError && Array.isArray(rpcData)) {
      const mapped = (rpcData as JsonObject[]).map((row: JsonObject) => mapTherapist(row));
      const hydrated = await hydrateTherapistAvatarsFromProfiles(mapped);
      return applyTherapistShiftAvailabilityForToday(hydrated);
    }
  } catch {
    // Fallback to direct query
  }

  // Last resort: direct table query (may fail with RLS on some environments).
  const { data, error } = await withTimeout(
    supabase.from('therapists').select('*').eq('is_available', true),
  );
  if (error || !data) {
    warnCatalogPermissionOnce(error);
    return [];
  }
  const mapped = (data as JsonObject[]).map((row: JsonObject) => mapTherapist(row));
  const hydrated = await hydrateTherapistAvatarsFromProfiles(mapped);
  return applyTherapistShiftAvailabilityForToday(hydrated);
}

export async function getTherapists(opts?: { bypassCache?: boolean }): Promise<Therapist[]> {
  if (opts?.bypassCache) {
    therapistsCache = null;
  }
  const now = Date.now();
  if (therapistsCache && now - therapistsCache.fetchedAt < THERAPISTS_CACHE_TTL_MS) {
    return therapistsCache.list;
  }
  if (therapistsFetchInFlight) {
    return therapistsFetchInFlight;
  }
  therapistsFetchInFlight = (async () => {
    try {
      const list = mergeVirtualTherapists(await fetchTherapistsUncached());
      therapistsCache = { list, fetchedAt: Date.now() };
      return list;
    } finally {
      therapistsFetchInFlight = null;
    }
  })();
  return therapistsFetchInFlight;
}

export async function getTherapistById(therapistId: string): Promise<Therapist | null> {
  const virtual = findVirtualTherapistById(therapistId);
  if (virtual) {
    return virtual;
  }

  // Try cache first (already fetched via SECURITY DEFINER RPC, bypasses RLS)
  if (therapistsCache) {
    const cached = therapistsCache.list.find((t) => t.id === therapistId);
    if (cached) return cached;
  }

  // Try fetching full list (uses RPC fallback) then find by ID
  try {
    const all = await getTherapists();
    const found = all.find((t) => t.id === therapistId);
    if (found) return found;
  } catch {
    // ignore
  }

  // Last resort: direct query (may fail with RLS)
  const { data, error } = await withTimeout(
    supabase.from('therapists').select('*').eq('id', therapistId).maybeSingle(),
  );
  if (error || !data) {
    warnCatalogPermissionOnce(error);
    return null;
  }
  const therapist = mapTherapist(data as JsonObject);
  const [hydrated] = await hydrateTherapistAvatarsFromProfiles([therapist]);
  return hydrated ?? therapist;
}

export async function getTherapistsBySpecialty(specialty: string): Promise<Therapist[]> {
  const therapists = await getTherapists();
  return therapists.filter((therapist) =>
    (therapist.specialties ?? []).some((item) => item.toLowerCase().includes(specialty.toLowerCase())),
  );
}

export async function updateTherapistLiveLocation(
  userId: string,
  coords: { latitude: number; longitude: number },
): Promise<void> {
  const latitude = Number(coords.latitude);
  const longitude = Number(coords.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error('invalid-location-coordinates');
  }

  const { error } = await withTimeout(
    supabase.rpc('update_therapist_live_location', {
      p_user_id: userId,
      p_latitude: latitude,
      p_longitude: longitude,
      p_location_updated_at: new Date().toISOString(),
    }),
  );
  if (error) {
    throw error;
  }
  therapistsCache = null;
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
    supabase.rpc('get_booking_by_id_rpc', { p_booking_id: bookingId }),
  );
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return payloadToRecord(row as JsonObject) as unknown as Booking;
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
  const basePayload = { ...data, createdAt: data.createdAt ?? now };
  const payload =
    basePayload.paymentMethod !== undefined
      ? { ...basePayload, paymentMethod: mapGlowPaymentMethodIdToZenaUnknown(basePayload.paymentMethod) }
      : basePayload;
  const { data: bookingId, error } = await withTimeout(
    supabase.rpc('create_booking_rpc', {
      p_user_id: userId,
      p_therapist_id: String(data.therapistId ?? ''),
      p_status: String(data.status ?? 'pending'),
      p_payload: payload,
    }),
  );
  if (error || !bookingId) {
    console.warn('[createSharedBookingRecord] error:', error?.message, error?.code);
    throw error ?? new Error('create-shared-booking-failed');
  }
  console.log('[createSharedBookingRecord] success, id=', bookingId);
  return String(bookingId);
}

export async function deleteBookingRecord(bookingId: string): Promise<void> {
  console.warn('[deleteBookingRecord] CALLED for id=', bookingId, new Error().stack?.split('\n')[2]);
  const { error } = await withTimeout(
    supabase.rpc('delete_booking_rpc', { p_booking_id: bookingId }),
  );
  if (error) throw error;
}

/** Merge payload and optionally set top-level status (e.g. confirm after Zena wallet payment). */
export async function mergeBookingPayload(
  bookingId: string,
  patch: Record<string, unknown>,
  status?: string,
): Promise<void> {
  const patchNorm = { ...patch };
  if ('paymentMethod' in patchNorm) {
    patchNorm.paymentMethod = mapGlowPaymentMethodIdToZenaUnknown(patchNorm.paymentMethod);
  }
  const { error } = await withTimeout(
    supabase.rpc('merge_booking_payload_rpc', {
      p_booking_id: bookingId,
      p_patch: patchNorm,
      p_status: status ?? null,
    }),
  );
  if (error) throw error;
}

/** Client confirms PayOS after polling PAID (webhook may have already completed the row). */
export async function confirmPayosForBookingUser(
  orderCode: number,
  userId: string,
): Promise<{ ok: boolean; reason?: string; bookingId?: string }> {
  const { data, error } = await withTimeout(
    supabase.rpc('confirm_payos_for_booking_user', {
      p_order_code: orderCode,
      p_user_id: userId,
    }),
  );
  if (error) throw error;
  const r = data as { ok?: boolean; reason?: string; booking_id?: string };
  return {
    ok: !!r?.ok,
    reason: typeof r?.reason === 'string' ? r.reason : undefined,
    bookingId: r?.booking_id ? String(r.booking_id) : undefined,
  };
}

export async function getBookingStatus(bookingId: string): Promise<string | null> {
  const row = await getSharedBookingRecordById(bookingId);
  if (!row) return null;
  return row.status != null ? String(row.status) : null;
}

export async function getSharedBookingRecords(): Promise<(Record<string, unknown> & { id: string })[]> {
  // Try SECURITY DEFINER RPC first (bypasses RLS for custom-auth anon clients)
  try {
    const { data: rpcData, error: rpcError } = await withTimeout(
      supabase.rpc('get_all_bookings_for_app'),
    );
    if (!rpcError && Array.isArray(rpcData)) {
      return (rpcData as JsonObject[]).map((row) => payloadToRecord(row));
    }
    if (rpcError) {
      console.warn('[getSharedBookingRecords] RPC error:', rpcError.message);
    }
  } catch {
    // fall through to direct query
  }

  const { data, error } = await withTimeout(
    supabase.from('bookings').select('*').order('created_at', { ascending: false }),
  );
  if (error || !data) {
    console.warn('[getSharedBookingRecords] error:', error?.message, error?.code);
    return [];
  }
  return (data as JsonObject[]).map((row: JsonObject) => payloadToRecord(row)) as (Record<string, unknown> & {
    id: string;
  })[];
}

export async function getSharedBookingRecordById(
  bookingId: string,
): Promise<(Record<string, unknown> & { id: string }) | null> {
  const { data, error } = await withTimeout(
    supabase.rpc('get_booking_by_id_rpc', { p_booking_id: bookingId }),
  );
  if (error || !data) {
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return payloadToRecord(row as JsonObject) as Record<string, unknown> & { id: string };
}

export async function updateSharedBookingStatus(bookingId: string, status: string): Promise<void> {
  const { error } = await withTimeout(
    supabase.rpc('update_booking_status_rpc', { p_booking_id: bookingId, p_status: status }),
  );
  if (!error) return;
  // Fallback: update via merge_booking_payload_rpc (guaranteed to exist)
  await mergeBookingPayload(bookingId, {}, status);
}

/**
 * Huỷ đơn từ app khách theo RPC backend (idempotent, lưu metadata huỷ vào payload).
 * Trả về `true` khi backend xác nhận update thành công.
 */
export async function cancelSharedBookingAsCustomer(
  bookingId: string,
  customerUserId?: string,
  reason?: string,
): Promise<boolean> {
  const { data, error } = await withTimeout(
    supabase.rpc('customer_cancel_booking', {
      p_booking_id: bookingId,
      p_customer_user_id: customerUserId ?? null,
      p_reason: reason ?? null,
    }),
  );
  if (error) {
    // Fallback cho môi trường chưa chạy migration 045.
    await updateSharedBookingStatus(bookingId, 'cancelled');
    return true;
  }
  return data === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bảng riêng `cancelled_bookings` (migration 046) — nguồn dữ liệu cho tab
// "Đã huỷ" ở Activity. Lưu snapshot toàn bộ hoá đơn + thời điểm huỷ.
// ─────────────────────────────────────────────────────────────────────────────

export interface CancelledBookingSnapshotInput {
  bookingId?: string | null;
  customerUserId?: string | null;
  customerPhone?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  therapistId?: string | null;
  therapistName?: string | null;
  therapistAvatar?: string | null;
  service?: string | null;
  date?: string | null;
  time?: string | null;
  address?: string | null;
  price?: number | null;
  paymentMethod?: string | null;
  cancelReason?: string | null;
  cancelledBy?: 'customer' | 'system' | 'therapist' | string | null;
  cancelledAt?: string | null;
  customerCartSnapshot?: Array<{ name: string; duration: number; price: number }> | null;
  customerLat?: number | null;
  customerLng?: number | null;
  /** Bất kỳ field bổ sung nào để rebuild "Đặt lại". */
  extras?: Record<string, unknown> | null;
}

function buildCancelledBookingPayload(
  input: CancelledBookingSnapshotInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    cancelledBy: input.cancelledBy ?? 'customer',
    cancelReason: input.cancelReason ?? 'customer_cancelled',
    cancelledAt: input.cancelledAt ?? new Date().toISOString(),
  };
  const assignString = (key: string, value: string | null | undefined) => {
    if (typeof value === 'string' && value.trim() !== '') {
      payload[key] = value.trim();
    }
  };
  const assignNumber = (key: string, value: number | null | undefined) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      payload[key] = value;
    }
  };
  assignString('bookingId', input.bookingId ?? undefined);
  assignString('customerUserId', input.customerUserId ?? undefined);
  assignString('customerPhone', input.customerPhone ?? undefined);
  assignString('customerName', input.customerName ?? undefined);
  assignString('customerEmail', input.customerEmail ?? undefined);
  assignString('therapistId', input.therapistId ?? undefined);
  assignString('therapistName', input.therapistName ?? undefined);
  assignString('therapistAvatar', input.therapistAvatar ?? undefined);
  assignString('service', input.service ?? undefined);
  assignString('date', input.date ?? undefined);
  assignString('time', input.time ?? undefined);
  assignString('address', input.address ?? undefined);
  assignNumber('price', input.price ?? undefined);
  assignString('paymentMethod', input.paymentMethod ?? undefined);
  assignNumber('customerLat', input.customerLat ?? undefined);
  assignNumber('customerLng', input.customerLng ?? undefined);
  if (Array.isArray(input.customerCartSnapshot) && input.customerCartSnapshot.length > 0) {
    payload.customerCartSnapshot = input.customerCartSnapshot;
  }
  if (input.extras && typeof input.extras === 'object') {
    Object.assign(payload, input.extras);
  }
  return payload;
}

/**
 * Ghi 1 đơn huỷ vào bảng `cancelled_bookings` (idempotent theo bookingId).
 * Trả về id của bản ghi vừa tạo (hoặc null nếu RPC không khả dụng).
 */
export async function recordCancelledBooking(
  input: CancelledBookingSnapshotInput,
): Promise<string | null> {
  const payload = buildCancelledBookingPayload(input);
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('record_cancelled_booking', { p_payload: payload }),
    );
    if (error) {
      console.warn('[recordCancelledBooking] RPC error:', error.message);
      return null;
    }
    return typeof data === 'string' ? data : null;
  } catch (err) {
    console.warn('[recordCancelledBooking] Failed:', err);
    return null;
  }
}

export interface CancelledBookingRecord {
  id: string;
  bookingId?: string;
  customerUserId?: string;
  customerPhone?: string;
  customerName?: string;
  customerEmail?: string;
  therapistId?: string;
  therapistName?: string;
  therapistAvatar?: string;
  service?: string;
  date?: string;
  time?: string;
  address?: string;
  price: number;
  paymentMethod?: string;
  cancelReason?: string;
  cancelledBy?: string;
  cancelledAt: string;
  payload: Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  return undefined;
}

function rowToCancelledRecord(row: Record<string, unknown>): CancelledBookingRecord | null {
  const id = asString(row.id);
  if (!id) return null;
  const cancelledAt = asString(row.cancelled_at) ?? new Date().toISOString();
  const priceRaw = row.price;
  const price = typeof priceRaw === 'number'
    ? priceRaw
    : typeof priceRaw === 'string'
      ? Number(priceRaw) || 0
      : 0;
  const payload =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
  return {
    id,
    bookingId: asString(row.booking_id),
    customerUserId: asString(row.customer_user_id),
    customerPhone: asString(row.customer_phone),
    customerName: asString(row.customer_name),
    customerEmail: asString(row.customer_email),
    therapistId: asString(row.therapist_id),
    therapistName: asString(row.therapist_name),
    therapistAvatar: asString(row.therapist_avatar),
    service: asString(row.service),
    date: asString(row.date),
    time: asString(row.time),
    address: asString(row.address),
    price,
    paymentMethod: asString(row.payment_method),
    cancelReason: asString(row.cancel_reason),
    cancelledBy: asString(row.cancelled_by),
    cancelledAt,
    payload,
  };
}

export async function getCustomerCancelledBookings(opts: {
  customerUserId?: string | null;
  customerPhone?: string | null;
  limit?: number;
}): Promise<CancelledBookingRecord[]> {
  const userId = opts.customerUserId?.trim() || null;
  const phone = opts.customerPhone?.trim() || null;
  if (!userId && !phone) return [];
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('list_customer_cancelled_bookings', {
        p_customer_user_id: userId,
        p_customer_phone: phone,
        p_limit: opts.limit ?? 50,
      }),
    );
    if (error) {
      console.warn('[getCustomerCancelledBookings] RPC error:', error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];
    const out: CancelledBookingRecord[] = [];
    for (const row of data) {
      if (row && typeof row === 'object') {
        const rec = rowToCancelledRecord(row as Record<string, unknown>);
        if (rec) out.push(rec);
      }
    }
    return out;
  } catch (err) {
    console.warn('[getCustomerCancelledBookings] Failed:', err);
    return [];
  }
}

export async function reassignSharedBookingTherapist(
  bookingId: string,
  patch: {
    therapistId: string;
    therapistName: string;
    therapistAvatar?: string;
    price?: number;
    distanceKm?: number;
  },
): Promise<void> {
  const { data: row, error: readError } = await withTimeout(
    supabase.from('bookings').select('payload').eq('id', bookingId).maybeSingle(),
  );
  if (readError) {
    throw readError;
  }
  const prev =
    row && typeof row.payload === 'object' && row.payload !== null
      ? (row.payload as Record<string, unknown>)
      : {};
  const nextPayload: Record<string, unknown> = {
    ...prev,
    therapistId: patch.therapistId,
    therapistName: patch.therapistName,
    therapistAvatar: patch.therapistAvatar ?? '',
  };
  if (typeof patch.price === 'number' && Number.isFinite(patch.price)) {
    nextPayload.price = patch.price;
  }
  if (typeof patch.distanceKm === 'number' && Number.isFinite(patch.distanceKm)) {
    nextPayload.distanceKm = patch.distanceKm;
  }
  const { error } = await withTimeout(
    supabase
      .from('bookings')
      .update({
        therapist_id: patch.therapistId,
        payload: nextPayload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId),
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
    supabase.rpc('get_saved_addresses', { p_user_id: userId }),
  );
  if (error || !data) {
    return [];
  }
  return (data as JsonObject[]).map((row: JsonObject) => payloadToRecord(row) as unknown as SavedAddress);
}

export async function addSavedAddress(addressData: Omit<SavedAddress, 'id'>): Promise<string> {
  const payload = { ...addressData, createdAt: addressData.createdAt ?? new Date().toISOString() };
  const { data, error } = await withTimeout(
    supabase.rpc('add_saved_address', {
      p_user_id: addressData.userId,
      p_payload: payload,
    }),
  );
  if (error || !data) {
    throw error ?? new Error('add-address-failed');
  }
  return String(data);
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
    return [];
  }
  const now = new Date().toISOString();
  return (data as JsonObject[])
    .map((row: JsonObject) => mapPromotion(row))
    .filter((promotion: Promotion) => isPromotionRedeemable(promotion, now));
}

export async function verifyPromoCode(code: string): Promise<Promotion | null> {
  const { data, error } = await withTimeout(
    supabase.from('promotions').select('*').eq('code', code.toUpperCase().trim()).maybeSingle(),
  );
  if (error || !data) {
    warnCatalogPermissionOnce(error);
    return null;
  }
  const promotion = mapPromotion(data as JsonObject);
  const now = new Date().toISOString();
  if (!isPromotionRedeemable(promotion, now)) return null;
  return promotion;
}

/** Tăng current_uses khi đơn hàng đã tạo; trả false nếu mã vừa hết lượt (race) hoặc lỗi. */
export async function consumePromotionUse(promotionId: string): Promise<boolean> {
  const { data, error } = await withTimeout(
    supabase.rpc('consume_promotion_if_available', { p_id: promotionId }),
  );
  if (error) {
    debugLog('consume_promotion_if_available', error);
    return false;
  }
  return data === true;
}

const PARTNER_IMAGES_BUCKET = 'partner-applications';

function isRemoteHttpUri(uri: string): boolean {
  const u = uri.trim().toLowerCase();
  return u.startsWith('https://') || u.startsWith('http://');
}

function guessImageContentType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const normalized = base64.replace(/\s/g, '');
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  const AnyBuffer = (globalThis as unknown as { Buffer?: { from: (s: string, enc: string) => Uint8Array } })
    .Buffer;
  if (AnyBuffer?.from) {
    const buf = AnyBuffer.from(normalized, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  throw new Error('partner-image-read-failed');
}

async function readLocalImageAsArrayBuffer(uri: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  // Fast path: fetch(file://...) works in some runtimes.
  try {
    const res = await fetch(uri);
    if (res.ok) {
      const arr = await res.arrayBuffer();
      if (arr.byteLength > 0) {
        const fromHeader = res.headers.get('content-type') ?? '';
        const contentType = fromHeader.startsWith('image/') ? fromHeader : guessImageContentType(uri);
        return { data: arr, contentType };
      }
    }
  } catch {
    // Fall back to FileSystem path below.
  }

  // Reliable path on iOS/Android: read base64 from local cache and decode.
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  if (!base64) {
    throw new Error('partner-image-read-failed');
  }
  const data = base64ToArrayBuffer(base64);
  if (data.byteLength <= 0) {
    throw new Error('partner-image-read-failed');
  }
  return { data, contentType: guessImageContentType(uri) };
}

/** Upload local gallery URIs to Storage; keep existing public URLs as-is. */
async function uploadPartnerImagesToStorage(userId: string, uris: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i]?.trim();
    if (!uri) continue;
    if (isRemoteHttpUri(uri)) {
      out.push(uri);
      continue;
    }
    const objectPath = `${userId}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 10)}.jpg`;
    const { data: fileData, contentType } = await readLocalImageAsArrayBuffer(uri);
    const { error: upErr } = await supabase.storage
      .from(PARTNER_IMAGES_BUCKET)
      .upload(objectPath, fileData, { contentType, upsert: false });
    if (upErr) {
      throw upErr;
    }
    const { data: pub } = supabase.storage.from(PARTNER_IMAGES_BUCKET).getPublicUrl(objectPath);
    out.push(pub.publicUrl);
  }
  return out;
}

/**
 * Ensure therapist/profile gallery images are public HTTP URLs.
 * Local `file://` URIs are uploaded to Storage and replaced with public URLs.
 */
export async function ensurePublicPartnerImageUris(userId: string, uris: string[]): Promise<string[]> {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!normalizedUserId) {
    throw new Error('missing-user-id');
  }
  const needsUpload =
    Array.isArray(uris) &&
    uris.some((u) => typeof u === 'string' && u.trim() && !isRemoteHttpUri(u));
  if (needsUpload && !isSupabaseConfigured) {
    throw new Error('missing-supabase-config');
  }
  if (!needsUpload) {
    return uris.filter((u): u is string => typeof u === 'string' && !!u.trim()).map((u) => u.trim());
  }
  return uploadPartnerImagesToStorage(normalizedUserId, uris);
}

/**
 * PARTNER APPLICATIONS
 */
export async function createPartnerApplication(payload: PartnerApplicationPayload): Promise<string> {
  const rawPayloadUid = typeof payload.userId === 'string' ? payload.userId.trim() : '';
  let uid = rawPayloadUid;

  if (!uid) {
    uid = await getStoredUid();
  }
  if (!uid) {
    const { data } = await supabase.auth.getUser();
    uid = data.user?.id ?? '';
  }
  if (!uid) {
    throw new Error('missing-user-id');
  }

  let payloadToSave: PartnerApplicationPayload = payload;
  const imageUris = await ensurePublicPartnerImageUris(uid, payload.imageUris);
  payloadToSave = { ...payload, imageUris };

  const { data, error } = await withTimeout(
    supabase
      .from('partner_applications')
      .insert({
        user_id: uid,
        phone_number: normalizePhone(payload.phoneNumber),
        status: 'pending',
        image_moderation_status: 'pending',
        reviewed_by_admin: false,
        payload: payloadToSave,
      })
      .select('id')
      .single(),
  );
  if (error || !data) {
    throw error ?? new Error('create-partner-application-failed');
  }
  return String(data.id);
}

export async function completeTherapistBookingPayouts(
  therapistUserId: string,
  bookingId: string,
  totalAmount: number,
  /** Giữ tham số tương thích cũ; luồng mới luôn 100% thu nhập + 20% phí Ví Chi phí (RPC). */
  _commissionRateUnused: number = 0.7,
): Promise<{ transactionId: string; earningAmount: number; balance: number }> {
  const amt = Math.round(Number(totalAmount));
  if (!therapistUserId || !bookingId || amt <= 0) {
    return { transactionId: '', earningAmount: 0, balance: 0 };
  }
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('complete_therapist_booking_financials', {
        p_therapist_user_id: therapistUserId,
        p_booking_id: bookingId,
        p_total_amount: amt,
      }),
    );
    if (error) throw error;
    const result = data as Record<string, unknown>;
    if (result.skipped) {
      return {
        transactionId: String(result.transaction_id ?? ''),
        earningAmount: 0,
        balance: Number(result.balance ?? 0),
      };
    }
    return {
      transactionId: String(result.transaction_id ?? ''),
      earningAmount: Number(result.earning_amount ?? 0),
      balance: Number(result.balance ?? 0),
    };
  } catch {
    // RPC not yet migrated — no-op; do not credit earnings to wallet.
    return { transactionId: '', earningAmount: 0, balance: 0 };
  }
}

/** Số dư Ví Chi phí (KTV) — có thể âm sau phí kết nối. */
export async function getTherapistCostWalletBalance(userId: string): Promise<number> {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_therapist_cost_wallet_balance', { p_user_id: userId }),
    );
    if (error) return 0;
    return Number(data ?? 0);
  } catch {
    return 0;
  }
}

/** Nạp tiền vào Ví Chi phí (đưa số dư về ≥ 0 để nhận đơn tiếp). */
export async function therapistCostWalletTopUp(
  userId: string,
  amount: number,
  method: string = 'payos',
): Promise<{ transactionId: string; balance: number }> {
  const { data, error } = await withTimeout(
    supabase.rpc('therapist_cost_wallet_topup', {
      p_user_id: userId,
      p_amount: Math.round(Number(amount)),
      p_method: method,
    }),
  );
  if (error) throw error;
  const result = data as Record<string, unknown>;
  return {
    transactionId: String(result.transaction_id ?? ''),
    balance: Number(result.balance ?? 0),
  };
}

/**
 * Một lần nạp cho KTV: ưu tiên bù hết số dư âm ở ví phí, phần còn lại vào ví thu nhập.
 * (Giao diện một ví; backend vẫn dùng 2 sổ tương thích migration hiện tại.)
 */
export async function therapistUnifiedWalletTopUp(
  userId: string,
  amount: number,
  method: string = 'payos',
): Promise<void> {
  const amt = Math.round(Number(amount));
  if (!userId || !Number.isFinite(amt) || amt <= 0) {
    return;
  }
  const costBal = await getTherapistCostWalletBalance(userId);
  const toCost = costBal < 0 ? Math.min(amt, -costBal) : 0;
  const toMain = amt - toCost;
  if (toCost > 0) {
    await therapistCostWalletTopUp(userId, toCost, method);
  }
  if (toMain > 0) {
    await walletTopUp(userId, toMain, method);
  }
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
  // GỬI PUSH TRƯỚC (best-effort) — đảm bảo KTV/khách thấy banner + nghe tiếng kể cả khi
  // insert vào DB bị RLS chặn / timeout. Insert DB chỉ để badge số "đã đọc" và lịch sử.
  try {
    await sendPushToUser(
      notificationData.userId,
      notificationData.title,
      notificationData.message,
      { type: notificationData.type, relatedId: notificationData.relatedId },
    );
  } catch (pushError) {
    if (__DEV__) console.warn('[notifications] push failed:', pushError);
  }

  const { error } = await withTimeout(
    supabase.rpc('insert_notification', {
      p_user_id: notificationData.userId,
      p_payload: notificationData as unknown as Record<string, unknown>,
      p_is_read: notificationData.isRead ?? false,
      p_created_at: notificationData.createdAt ?? new Date().toISOString(),
    }),
  );
  if (error) {
    if (__DEV__) console.warn('[notifications] insert failed:', error.message);
    // Không throw — đẩy push đã thành công, không nên fail luồng booking phía client.
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

/** Get all therapist profile IDs in a given city (flexible matching — handles Vietnamese diacritics).
 *  Uses SECURITY DEFINER RPC to avoid direct table permission issues. */
export async function getTherapistIdsByCity(city: string): Promise<string[]> {
  // Try SECURITY DEFINER RPC first (bypasses table-level permission issues)
  const { data: rpcData, error: rpcError } = await withTimeout(
    supabase.rpc('get_therapists_with_push_tokens'),
  );

  let rows: { id: string; working_city: string | null }[] = [];

  if (!rpcError && Array.isArray(rpcData)) {
    rows = rpcData as { id: string; working_city: string | null }[];
  } else {
    // Fallback: direct table query (works when GRANT SELECT on profiles is in place)
    if (__DEV__) console.warn('[getTherapistIdsByCity] RPC failed, trying direct query:', rpcError?.message);
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('id, working_city')
        .eq('role', 'therapist')
        .not('push_token', 'is', null),
    );
    if (error || !data) {
      if (__DEV__) console.warn('[getTherapistIdsByCity] direct query also failed:', error?.message);
      return [];
    }
    rows = data as { id: string; working_city: string | null }[];
  }

  const cityLower = city.trim().toLowerCase();
  const matched = rows
    .filter((r) => {
      const wc = (r.working_city ?? '').trim().toLowerCase();
      if (!wc || !cityLower) return false;
      return wc.includes(cityLower) || cityLower.includes(wc);
    })
    .map((r) => r.id);
  if (__DEV__) console.log('[getTherapistIdsByCity] city:', city, '→ found', matched.length, 'of', rows.length, 'therapists with push tokens');
  return matched;
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

/** Send new job notification to all therapists in the same city (gửi push hàng loạt + insert DB). */
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

  if (targets.length === 0) return;

  const title = `Việc mới tại ${city}`;
  const message = `Khách ${customerName} cần ${service} vào ${date} lúc ${time} tại ${address}. Ứng tuyển ngay!`;

  // 1) Bulk push (1 request đến Expo cho mọi KTV).
  try {
    await sendPushToUsers(targets, title, message, { type: 'job', relatedId: bookingId });
  } catch (e) {
    if (__DEV__) console.warn('[notifyNewJobForCity] bulk push failed:', e);
  }

  // 2) Insert notifications DB cho lịch sử & realtime modal.
  const now = new Date().toISOString();
  await Promise.all(
    targets.map((therapistUserId) =>
      withTimeout(
        supabase.rpc('insert_notification', {
          p_user_id: therapistUserId,
          p_payload: {
            userId: therapistUserId,
            title,
            titleEn: `New Job in ${city}`,
            message,
            messageEn: `Client ${customerName} needs ${service} on ${date} at ${time} at ${address}. Apply now!`,
            type: 'job',
            relatedId: bookingId,
            isRead: false,
            createdAt: now,
          },
          p_is_read: false,
          p_created_at: now,
        }),
      ).catch(() => {}),
    ),
  );
}

export async function notifyAssignedTherapistJob(
  therapistUserId: string,
  bookingId: string,
  customerName: string,
  service: string,
  date: string,
  time: string,
  address: string,
): Promise<void> {
  await createNotification({
    userId: therapistUserId,
    title: 'Khách đặt riêng bạn — cần phản hồi trong 15 phút',
    titleEn: 'Personal booking — please respond within 15 minutes',
    message: `Khách ${customerName} chọn bạn cho ${service} vào ${date} lúc ${time} tại ${address}. Chấp nhận hoặc Hủy trên màn Nhận việc.`,
    messageEn: `${customerName} chose you for ${service} on ${date} at ${time} at ${address}. Accept or decline in Jobs.`,
    type: 'job',
    relatedId: bookingId,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

type JsonBookingPayload = Record<string, unknown>;

async function readBookingPayload(bookingId: string): Promise<JsonBookingPayload | null> {
  const { data, error } = await withTimeout(
    supabase.rpc('get_booking_by_id_rpc', { p_booking_id: bookingId }),
  );
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row || typeof row.payload !== 'object' || row.payload === null) {
    return null;
  }
  return row.payload as JsonBookingPayload;
}

export async function therapistPrimaryAcceptBooking(
  bookingId: string,
  therapistUid: string,
): Promise<{ ok: boolean; reason?: string }> {
  const prev = await readBookingPayload(bookingId);
  if (!prev) {
    return { ok: false, reason: 'not_found' };
  }
  const requested = String(prev.requestedTherapistId ?? prev.therapistId ?? '');
  if (requested !== therapistUid) {
    return { ok: false, reason: 'not_target' };
  }
  const pa = String(prev.primaryAction ?? 'pending');
  if (pa !== 'pending') {
    return { ok: false, reason: 'already_responded' };
  }
  await mergeBookingPayload(
    bookingId,
    { primaryAction: 'accepted', broadcastClosed: true },
    'confirmed',
  );
  const customerUserId = typeof prev.customerUserId === 'string' ? prev.customerUserId : '';
  if (customerUserId) {
    await createNotification({
      userId: customerUserId,
      title: 'Đã kết nối với kỹ thuật viên',
      titleEn: 'Connected to your therapist',
      message: `${String(prev.therapistName ?? 'KTV')} đã chấp nhận đơn của bạn. Vào chat để trao đổi.`,
      messageEn: `${String(prev.therapistName ?? 'Therapist')} accepted your booking. Open chat to coordinate.`,
      type: 'booking',
      relatedId: bookingId,
      isRead: false,
      createdAt: new Date().toISOString(),
    }).catch(() => {});
  }
  return { ok: true };
}

export async function therapistPrimaryDeclineBooking(
  bookingId: string,
  therapistUid: string,
): Promise<{ ok: boolean; reason?: string }> {
  const prev = await readBookingPayload(bookingId);
  if (!prev) {
    return { ok: false, reason: 'not_found' };
  }
  const requested = String(prev.requestedTherapistId ?? prev.therapistId ?? '');
  if (requested !== therapistUid) {
    return { ok: false, reason: 'not_target' };
  }
  if (String(prev.primaryAction ?? 'pending') !== 'pending') {
    return { ok: false, reason: 'already_responded' };
  }
  await mergeBookingPayload(bookingId, { primaryAction: 'declined' });
  const customerUserId = typeof prev.customerUserId === 'string' ? prev.customerUserId : '';
  if (customerUserId) {
    await createNotification({
      userId: customerUserId,
      title: 'KTV từ chối đơn',
      titleEn: 'Therapist declined',
      message: `${String(prev.therapistName ?? 'KTV')} đã hủy nhận đơn. Bạn có thể chọn KTV khác trong danh sách ứng tuyển hoặc gợi ý.`,
      messageEn: `${String(prev.therapistName ?? 'Therapist')} declined. You can pick another therapist from applicants or suggestions.`,
      type: 'booking',
      relatedId: bookingId,
      isRead: false,
      createdAt: new Date().toISOString(),
    }).catch(() => {});
  }
  return { ok: true };
}

export async function therapistApplyToBroadcastBooking(
  bookingId: string,
  therapistUid: string,
  therapistName: string,
  therapistAvatar?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const prev = await readBookingPayload(bookingId);
  if (!prev) {
    return { ok: false, reason: 'not_found' };
  }
  if (String(prev.assignmentFlow ?? '') !== 'nominated_city_broadcast') {
    return { ok: false, reason: 'not_broadcast' };
  }
  const requested = String(prev.requestedTherapistId ?? '');
  const primaryAction = String(prev.primaryAction ?? '');
  // Block only while nomination is still active — KTV must use Accept/Decline buttons.
  // If nomination expired (timeout) or was declined, allow re-applying via broadcast.
  if (requested === therapistUid && (!primaryAction || primaryAction === 'pending')) {
    return { ok: false, reason: 'use_accept_decline' };
  }
  const rawApps = prev.applications;
  const apps: JsonBookingPayload[] = Array.isArray(rawApps)
    ? (rawApps as JsonBookingPayload[]).filter((x) => x && typeof x === 'object')
    : [];
  if (apps.some((a) => String(a.therapistId) === therapistUid)) {
    return { ok: true };
  }
  apps.push({
    therapistId: therapistUid,
    therapistName,
    therapistAvatar: therapistAvatar ?? '',
    appliedAt: new Date().toISOString(),
  });
  await mergeBookingPayload(bookingId, { applications: apps });
  const customerUserId = typeof prev.customerUserId === 'string' ? prev.customerUserId : '';
  if (customerUserId) {
    await createNotification({
      userId: customerUserId,
      title: 'Có KTV ứng tuyển',
      titleEn: 'A therapist applied',
      message: `${therapistName} muốn nhận đơn của bạn. Mở màn đặt lịch để chọn.`,
      messageEn: `${therapistName} applied for your booking. Open your booking screen to choose.`,
      type: 'job',
      relatedId: bookingId,
      isRead: false,
      createdAt: new Date().toISOString(),
    }).catch(() => {});
  }
  return { ok: true };
}

export async function therapistSkipBroadcastBooking(
  bookingId: string,
  therapistUid: string,
): Promise<void> {
  const prev = await readBookingPayload(bookingId);
  if (!prev) {
    return;
  }
  const raw = prev.skippedTherapistIds;
  const skipped: string[] = Array.isArray(raw)
    ? (raw as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  if (!skipped.includes(therapistUid)) {
    skipped.push(therapistUid);
  }
  await mergeBookingPayload(bookingId, { skippedTherapistIds: skipped });
}

export async function notifyCustomerPrimaryWindowElapsed(
  customerUserId: string,
  bookingId: string,
  applicantCount: number,
): Promise<void> {
  await createNotification({
    userId: customerUserId,
    title: 'Hết thời gian chờ KTV bạn chọn',
    titleEn: 'Waiting window ended',
    message:
      applicantCount > 0
        ? `Có ${applicantCount} KTV đã ứng tuyển. Mở đơn để chọn KTV phù hợp.`
        : 'Chưa có KTV ứng tuyển. Xem gợi ý KTV gần bạn trên màn hình đặt lịch.',
    messageEn:
      applicantCount > 0
        ? `${applicantCount} therapist(s) applied. Open your booking to choose.`
        : 'No applications yet. See nearby suggestions on your booking screen.',
    type: 'job',
    relatedId: bookingId,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

export async function notifyCustomerNoApplicantsYet(
  customerUserId: string,
  bookingId: string,
): Promise<void> {
  await createNotification({
    userId: customerUserId,
    title: 'Gợi ý KTV gần bạn',
    titleEn: 'Nearby therapist suggestions',
    message: 'Sau 5 phút chưa có KTV ứng tuyển. Ứng dụng đang gợi ý KTV đang rảnh gần vị trí của bạn.',
    messageEn: 'After 5 minutes with no applications, we are showing nearby available therapists.',
    type: 'job',
    relatedId: bookingId,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
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
    bio: data.bio ?? '',
    age: typeof data.age === 'number' ? data.age : Number(data.age ?? 0) || undefined,
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
    bio: data.bio ?? '',
    age: typeof data.age === 'number' ? data.age : Number(data.age ?? 0) || undefined,
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

/**
 * Enum user_role trên một số DB chỉ có customer|therapist (thiếu migration ADD admin).
 * Không gửi role admin vào profiles.role — UI admin cho ADMIN_PHONE vẫn nhờ toAuthUserData sau khi đọc profile.
 */
function persistableProfilesRole(role: string): string {
  const r = String(role || 'customer').toLowerCase();
  if (r === 'therapist') return 'therapist';
  return 'customer';
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
    bio: normalizeVietnameseText(String(profile.bio ?? ''), 240),
    age: Number.isFinite(Number(profile.age)) ? Number(profile.age) : null,
    gender: profile.gender ?? null,
    nationality: profile.nationality ?? null,
    avatar_uri: profile.avatarUri ?? null,
    role: persistableProfilesRole(String(profile.role ?? 'customer')),
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

  // JSON sạch (bỏ undefined) — PostgREST/JSONB ổn định hơn với object thuần JSON
  let pData = sanitizeProfilePayloadForRpc(
    JSON.parse(JSON.stringify(payload)) as Record<string, unknown>,
  );

  // Try RPC first (SECURITY DEFINER, bypasses RLS)
  const { error: rpcError } = await withTimeout(
    supabase.rpc('upsert_profile', { p_data: pData }),
  );

  if (!rpcError) {
    return;
  }

  console.warn('[upsertUserProfile] RPC upsert_profile failed:', formatSupabaseError(rpcError));

  const rpcMissing = extractMissingColumnFromSupabaseError(rpcError);
  if (rpcMissing && Object.prototype.hasOwnProperty.call(pData, rpcMissing)) {
    const { [rpcMissing]: _, ...rest } = pData;
    pData = sanitizeProfilePayloadForRpc(
      JSON.parse(JSON.stringify(rest)) as Record<string, unknown>,
    );
    debugLog('upsertUserProfile', `RPC failed (missing column ${rpcMissing}); retrying without it + REST`, {
      message: (rpcError as { message?: string }).message,
    });
  } else {
    debugLog('upsertUserProfile', 'RPC upsert_profile failed, using REST fallback', {
      message: (rpcError as { message?: string }).message,
      details: (rpcError as { details?: string }).details,
    });
  }

  // Fallback: REST upsert — body không gồm cột thiếu (PostgREST không cần cột DB nếu không gửi).
  // Lặp và bỏ dần cột khi schema cũ thiếu nhiều field.
  let tableRow: Record<string, unknown> = { ...pData };
  let lastRestErr: unknown = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { error: restErr } = await withTimeout(
      supabase.from('profiles').upsert(tableRow, {
        onConflict: 'id',
      }),
    );
    if (!restErr) {
      return;
    }
    lastRestErr = restErr;
    console.warn('[upsertUserProfile] REST profiles upsert failed:', formatSupabaseError(restErr));
    const missing = extractMissingColumnFromSupabaseError(restErr);
    if (missing && Object.prototype.hasOwnProperty.call(tableRow, missing)) {
      const { [missing]: _, ...rest } = tableRow;
      tableRow = rest;
      continue;
    }
    throw new Error(`upsertUserProfile: ${formatSupabaseError(restErr)}`);
  }
  throw new Error(
    `upsertUserProfile: exceeded retries — ${formatSupabaseError(lastRestErr)}`,
  );
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
export async function updateUserRole(userId: string, role: 'customer' | 'therapist' | 'admin'): Promise<void> {
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

/** Hoàn tiền vào ví (type refund). `referenceId` trùng với lần hoàn trước sẽ không cộng thêm tiền. */
export async function walletRefund(
  userId: string,
  amount: number,
  description: string = '',
  referenceId: string | null = null,
): Promise<{ transactionId: string; balance: number }> {
  const amt = Math.round(Number(amount));
  const { data, error } = await withTimeout(
    supabase.rpc('wallet_refund', {
      p_user_id: userId,
      p_amount: amt,
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
  if (error) throw error;
  return Boolean(data);
}

/** Server-side guard: KTV đang có đơn confirmed/in-progress chưa hoàn thành? */
export async function checkTherapistHasActiveBooking(userId: string): Promise<boolean> {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('check_therapist_has_active_booking', { p_user_id: userId }),
    );
    if (error) return false; // RPC chưa migrate → không chặn
    return Boolean(data);
  } catch {
    return false;
  }
}

/**
 * THERAPIST SHIFTS
 */

function iterateDateRange(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  for (let d = new Date(start); d.getTime() <= end.getTime(); d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

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
  const virtualShifts = getVirtualTherapistShifts(userId, fromDate, toDate);
  if (virtualShifts) {
    return virtualShifts;
  }
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
  const mapRows = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({
      userId: String(r.user_id ?? ''),
      slots: Array.isArray(r.slots) ? (r.slots as string[]) : [],
    }));

  try {
    const { data, error } = await withTimeout(
      supabase.rpc('list_therapist_shifts_for_date', { p_shift_date: date }),
    );
    if (!error && Array.isArray(data)) {
      return mapRows(data as Record<string, unknown>[]);
    }
  } catch {
    /* RPC chưa deploy — đọc bảng trực tiếp */
  }

  const { data, error } = await withTimeout(
    supabase.from('therapist_shifts').select('user_id, slots').eq('shift_date', date),
  );
  if (error || !data) return [];
  return mapRows(data as Record<string, unknown>[]);
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
  senderRole: 'customer' | 'therapist' | 'system' | 'admin';
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

/**
 * Cùng phòng với admin web (admin_get_or_create_therapist_chat_room): KTV ↔ admin.
 * Cần EXPO_PUBLIC_ADMIN_USER_ID trùng NEXT_PUBLIC_ADMIN_USER_ID trên admin panel.
 */
export async function getOrCreateTherapistAdminChatRoom(
  therapistId: string,
  therapistName: string,
): Promise<string> {
  const adminId = getExpoAdminUserId();
  const adminName = getExpoAdminDisplayName();
  if (!adminId) {
    throw new Error('missing_admin_env');
  }
  const { data, error } = await withTimeout(
    supabase.rpc('admin_get_or_create_therapist_chat_room', {
      p_admin_id: adminId,
      p_admin_name: adminName,
      p_therapist_id: therapistId,
      p_therapist_name: therapistName || 'KTV',
    }),
  );
  if (error) {
    throw error;
  }
  if (data == null) {
    throw new Error('no_room_id');
  }
  return String(data);
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
    supabase.rpc('get_chat_room_by_booking', { p_booking_id: bookingId }),
  );
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return mapChatRoom(row as Record<string, unknown>);
}

/** Get all chat rooms for a user (customer or therapist) */
export async function getChatRoomsForUser(userId: string): Promise<ChatRoom[]> {
  const { data, error } = await withTimeout(
    supabase.rpc('get_chat_rooms_for_user', { p_user_id: userId }),
  );
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapChatRoom);
}

/** Send a message in a chat room */
export async function sendChatMessage(
  roomId: string,
  senderId: string,
  senderRole: 'customer' | 'therapist' | 'system' | 'admin',
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
    supabase.rpc('get_chat_messages_rpc', { p_room_id: roomId, p_limit: limit, p_offset: offset }),
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

/** Subscribe to new messages via Supabase Broadcast (no RLS issues). */
export function subscribeToChatMessages(
  roomId: string,
  onNewMessage: (msg: ChatMessage) => void,
) {
  const channel = supabase
    .channel(`chat-bc:${roomId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'msg' }, ({ payload }) => {
      if (payload?.msg) onNewMessage(payload.msg as ChatMessage);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Broadcast a new message to the room channel so the other party sees it instantly. */
export async function broadcastChatMessage(roomId: string, msg: ChatMessage): Promise<void> {
  const channel = supabase.channel(`chat-bc:${roomId}`);
  await channel.send({ type: 'broadcast', event: 'msg', payload: { msg } });
}

/**
 * Xóa chat_room (và chat_messages qua ON DELETE CASCADE) theo booking_id.
 * Ưu tiên RPC SECURITY DEFINER (migration 063) để không phụ thuộc RLS;
 * nếu RPC không tồn tại (chưa apply migration) thì fallback xóa trực tiếp.
 * Lỗi cleanup ở mức best-effort — caller có thể `.catch(() => {})`.
 */
export async function deleteChatRoomByBooking(bookingId: string): Promise<void> {
  const { error: rpcError } = await withTimeout(
    supabase.rpc('delete_chat_room_by_booking', { p_booking_id: bookingId }),
  );
  if (!rpcError) return;

  // Fallback: project chưa apply migration 063 → dùng cách cũ.
  const code = (rpcError as { code?: string } | null)?.code ?? '';
  const message = (rpcError as { message?: string } | null)?.message ?? '';
  const isMissing =
    code === 'PGRST202' ||
    /could not find the function|does not exist|schema cache/i.test(message);
  if (!isMissing) throw rpcError;

  const { error } = await withTimeout(
    supabase.from('chat_rooms').delete().eq('booking_id', bookingId),
  );
  if (error) throw error;
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

// ── Account deletion (see supabase/migrations/012_account_deletion.sql) ──

/** True when current Supabase Auth session is Google/Apple OAuth (delete via delete_my_oauth_account). */
export async function accountDeletionUsesOAuthSession(authUid: string): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id || data.user.id !== authUid) {
    return false;
  }
  const providers = new Set((data.user.identities ?? []).map((i) => i.provider));
  return providers.has('google') || providers.has('apple');
}

export async function deleteUserAccountOnServer(
  user: { authUid?: string; phoneNumber?: string },
  password?: string,
): Promise<void> {
  const uid = user.authUid?.trim();
  if (!uid) {
    throw new Error('missing_auth');
  }

  const oauth = await accountDeletionUsesOAuthSession(uid);
  if (oauth) {
    const { error } = await withAuthTimeout(supabase.rpc('delete_my_oauth_account'));
    if (error) throw new Error(error.message);
    await supabase.auth.signOut();
    return;
  }

  const phone = user.phoneNumber?.trim();
  if (!phone || !password?.trim()) {
    throw new Error('invalid_credentials');
  }

  const { error } = await withAuthTimeout(
    supabase.rpc('delete_my_phone_account', {
      p_phone: phone,
      p_password: password,
    }),
  );
  if (error) throw new Error(error.message);
  await AsyncStorage.removeItem('custom_auth_uid');
  await AsyncStorage.removeItem('cached_user_profile');
}

