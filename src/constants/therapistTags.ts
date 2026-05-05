import type { Therapist } from '@/lib/types';

export const THERAPIST_TAG_QUALITY = 'Chất lượng';
export const THERAPIST_TAG_UPDATED = 'Mới cập nhật';

/** Tag trong bộ lọc (đã bỏ « Mới đến »). */
export const FILTER_THERAPIST_TAGS = [THERAPIST_TAG_UPDATED, THERAPIST_TAG_QUALITY] as const;

/** KTV đăng ký trong khoảng này → tag « Mới cập nhật ». */
export const NEW_THERAPIST_MAX_DAYS = 45;

/** « Chất lượng »: đủ số đánh giá + điểm trung bình tốt. */
export const QUALITY_MIN_RATING = 4.5;
export const QUALITY_MIN_REVIEW_COUNT = 5;

export function isQualityTherapist(t: Therapist): boolean {
  return (
    Number(t.rating) >= QUALITY_MIN_RATING &&
    Number(t.reviewCount) >= QUALITY_MIN_REVIEW_COUNT
  );
}

export function isRecentlyJoinedTherapist(t: Therapist): boolean {
  const created = Date.parse(String(t.createdAt ?? ''));
  if (!Number.isFinite(created)) return false;
  const ageMs = Date.now() - created;
  return ageMs >= 0 && ageMs <= NEW_THERAPIST_MAX_DAYS * 86400000;
}

/**
 * Một badge trên card: ưu tiên Chất lượng; không thì Mới cập nhật (mới đăng ký).
 */
export function getTherapistDisplayTag(t: Therapist): string | null {
  if (isQualityTherapist(t)) return THERAPIST_TAG_QUALITY;
  if (isRecentlyJoinedTherapist(t)) return THERAPIST_TAG_UPDATED;
  return null;
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
  [THERAPIST_TAG_QUALITY]: {
    bg: '#C2410C',
    text: '#FFF7ED',
    border: 'rgba(255,255,255,0.55)',
    chipBg: '#C2410C',
    chipBorder: '#FDBA74',
  },
  [THERAPIST_TAG_UPDATED]: {
    bg: '#0D9488',
    text: '#F0FDFA',
    border: 'rgba(255,255,255,0.5)',
    chipBg: '#0F766E',
    chipBorder: '#5EEAD4',
  },
};
