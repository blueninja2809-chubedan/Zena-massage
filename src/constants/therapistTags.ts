import type { Therapist } from '@/lib/types';

export const THERAPIST_TAG_NEW_ARRIVAL = 'Mới đến';
export const THERAPIST_TAG_UPDATED = 'Mới cập nhật';
export const THERAPIST_TAG_QUALITY = 'Chất lượng';

/** Hiển thị song ngữ. Key là VI tag canonical (stable, dùng làm "id"). */
export const THERAPIST_TAG_LABEL_EN: Record<string, string> = {
  [THERAPIST_TAG_NEW_ARRIVAL]: 'New',
  [THERAPIST_TAG_UPDATED]: 'Just updated',
  [THERAPIST_TAG_QUALITY]: 'Top quality',
};

/** Lấy label hiển thị theo ngôn ngữ — dùng cho banner card lẫn chip filter. */
export function getTherapistTagLabel(tag: string, isEn: boolean): string {
  if (!isEn) return tag;
  return THERAPIST_TAG_LABEL_EN[tag] ?? tag;
}

/**
 * Thứ tự chip trong bộ lọc tag. Cũng phản ánh thứ tự ưu tiên hiển thị:
 * « Chất lượng » vẫn dựa trên rating thực, hai tag còn lại random 24h.
 */
export const FILTER_THERAPIST_TAGS = [
  THERAPIST_TAG_NEW_ARRIVAL,
  THERAPIST_TAG_UPDATED,
  THERAPIST_TAG_QUALITY,
] as const;

/** « Chất lượng »: đủ số đánh giá + điểm trung bình tốt. */
export const QUALITY_MIN_RATING = 4.5;
export const QUALITY_MIN_REVIEW_COUNT = 5;

export function isQualityTherapist(t: Therapist): boolean {
  return (
    Number(t.rating) >= QUALITY_MIN_RATING &&
    Number(t.reviewCount) >= QUALITY_MIN_REVIEW_COUNT
  );
}

/**
 * Logic random tag rotation 24h.
 * — Mỗi KTV không thuộc « Chất lượng » sẽ random nhận 1 trong 3 nhãn:
 *   { Mới đến, Mới cập nhật, không tag } theo `hash(therapistId, dayBucket)`.
 * — `dayBucket = floor(now / 24h)` đổi mỗi 24h ⇒ tag được random lại cho toàn
 *   bộ danh sách (cùng 1 KTV sẽ có thể đổi sang tag khác hoặc mất tag).
 * — Trong vòng 24h: cùng KTV + cùng ngày ⇒ cùng tag (UI ổn định, không nhấp nháy).
 * — Phân bố: ~40% Mới đến + ~40% Mới cập nhật + ~20% không tag
 *   ⇒ tổng ~80% KTV (chưa tính nhóm « Chất lượng » đã chắc chắn có tag) có badge.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

function dayBucket(): number {
  return Math.floor(Date.now() / DAY_MS);
}

function fnv1aHash(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function getRandomDailyTag(t: Therapist): string | null {
  if (!t.id) return null;
  // 10 slot: 0-3 → Mới đến (40%), 4-7 → Mới cập nhật (40%), 8-9 → không tag (20%).
  const slot = fnv1aHash(`${t.id}::${dayBucket()}`) % 10;
  if (slot < 4) return THERAPIST_TAG_NEW_ARRIVAL;
  if (slot < 8) return THERAPIST_TAG_UPDATED;
  return null;
}

/**
 * Tag hiển thị trên 1 KTV:
 * — Nếu đạt « Chất lượng » (rating thực) → luôn ưu tiên hiển thị Chất lượng.
 * — Còn lại → random theo 24h (xem getRandomDailyTag).
 */
export function getTherapistDisplayTag(t: Therapist): string | null {
  if (isQualityTherapist(t)) return THERAPIST_TAG_QUALITY;
  return getRandomDailyTag(t);
}

/**
 * Helper cho filter chip: chip = tag mà KTV đang thật sự hiển thị trên card.
 * Đảm bảo lọc "Mới đến" / "Mới cập nhật" / "Chất lượng" khớp 1-1 với badge.
 */
export function matchesTherapistTag(t: Therapist, tag: string): boolean {
  return getTherapistDisplayTag(t) === tag;
}

/** Màu / chip filter đồng bộ badge trên card + chi tiết KTV */
export const THERAPIST_TAG_VISUAL: Record<
  string,
  {
    bg: string;
    text: string;
    border: string;
    chipBg: string;
    chipBorder: string;
  }
> = {
  [THERAPIST_TAG_NEW_ARRIVAL]: {
    bg: '#7C3AED',
    text: '#F5F3FF',
    border: 'rgba(255,255,255,0.55)',
    chipBg: '#6D28D9',
    chipBorder: '#C4B5FD',
  },
  [THERAPIST_TAG_UPDATED]: {
    bg: '#0D9488',
    text: '#F0FDFA',
    border: 'rgba(255,255,255,0.5)',
    chipBg: '#0F766E',
    chipBorder: '#5EEAD4',
  },
  [THERAPIST_TAG_QUALITY]: {
    bg: '#C2410C',
    text: '#FFF7ED',
    border: 'rgba(255,255,255,0.55)',
    chipBg: '#C2410C',
    chipBorder: '#FDBA74',
  },
};
