import { INCLUDE_VIRTUAL_THERAPISTS } from '@/constants/reviewFlags';
import type { Therapist } from '@/lib/types';

/** Prefix for client-only demo therapists (no Supabase rows). */
const PREFIX = 'virtual-zena-';

function week(times: string[]): Record<string, string[]> {
  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ] as const;
  const out: Record<string, string[]> = {};
  for (const d of days) {
    out[d] = [...times];
  }
  return out;
}

function avatarUrl(name: string, bg: string, color: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bg}&color=${color}&size=256`;
}

function makeTherapist(p: {
  n: string;
  idSuffix: string;
  gender: Therapist['gender'];
  city: string;
  specs: string[];
  exp: number;
  rating: number;
  reviews: number;
  rate: number;
  dist: number;
  bio: string;
  bioEn: string;
  bg: string;
  fg: string;
}): Therapist {
  const id = `${PREFIX}${p.idSuffix}`;
  const name = p.n;
  return {
    id,
    name,
    phoneNumber: `090${p.idSuffix.padStart(7, '0').slice(0, 7)}`,
    email: `demo.${p.idSuffix}@zena.local`,
    gender: p.gender,
    avatar: avatarUrl(name.replace(/\s+/g, '+'), p.bg, p.fg),
    photos: [avatarUrl(name.replace(/\s+/g, '+'), p.bg, p.fg)],
    bio: p.bio,
    bioEn: p.bioEn,
    specialties: p.specs,
    experience: p.exp,
    rating: p.rating,
    reviewCount: p.reviews,
    hourlyRate: p.rate,
    distanceFromCenter: p.dist,
    workingCity: p.city,
    isAvailable: true,
    availability: week(['09:00', '14:00', '18:00']),
    languages: ['Tiếng Việt', 'English'],
    certifications: ['Chứng chỉ Massage trị liệu'],
    createdAt: '2024-06-01T00:00:00.000Z',
  };
}

/**
 * Demo-only therapists for App Store review / preview. Strip by turning off
 * EXPO_PUBLIC_APP_REVIEW_MODE and EXPO_PUBLIC_VIRTUAL_THERAPISTS.
 */
export const VIRTUAL_THERAPISTS: Therapist[] = [
  makeTherapist({
    n: 'Nguyễn Thị Minh Anh',
    idSuffix: '001',
    gender: 'female',
    city: 'Ho Chi Minh',
    specs: ['Massage Thư Giãn', 'Massage Cổ Vai Gáy'],
    exp: 6,
    rating: 4.95,
    reviews: 214,
    rate: 340000,
    dist: 1.8,
    bio: 'Chuyên massage thư giãn tại nhà, tận tâm và đúng giờ.',
    bioEn: 'Home relaxation massage, punctual and caring.',
    bg: 'F2E8FF',
    fg: '6B21A8',
  }),
  makeTherapist({
    n: 'Trần Văn Khôi',
    idSuffix: '002',
    gender: 'male',
    city: 'Ho Chi Minh',
    specs: ['Massage Thái', 'Foot Massage'],
    exp: 8,
    rating: 4.88,
    reviews: 176,
    rate: 380000,
    dist: 2.4,
    bio: 'Kinh nghiệm spa lớn, kỹ thuật massage Thái chuẩn.',
    bioEn: 'Spa background with authentic Thai techniques.',
    bg: 'E0F2FE',
    fg: '0369A1',
  }),
  makeTherapist({
    n: 'Lê Phương Mai',
    idSuffix: '003',
    gender: 'female',
    city: 'Ha Noi',
    specs: ['Massage Aroma', 'Chăm Sóc Da'],
    exp: 5,
    rating: 4.92,
    reviews: 198,
    rate: 360000,
    dist: 3.1,
    bio: 'Tinh dầu thư giãn, không gian yên tĩnh tại nhà khách.',
    bioEn: 'Aromatherapy-focused sessions for stress relief.',
    bg: 'FCE7F3',
    fg: '9D174D',
  }),
  makeTherapist({
    n: 'Phạm Quốc Huy',
    idSuffix: '004',
    gender: 'male',
    city: 'Ha Noi',
    specs: ['Massage Thể Thao', 'Giãn Cơ'],
    exp: 7,
    rating: 4.85,
    reviews: 142,
    rate: 400000,
    dist: 4.2,
    bio: 'Phù hợp khách chạy bộ, tập gym cần giãn cơ.',
    bioEn: 'Sports massage and deep tissue for active clients.',
    bg: 'DCFCE7',
    fg: '166534',
  }),
  makeTherapist({
    n: 'Hoàng Thu Giang',
    idSuffix: '005',
    gender: 'female',
    city: 'Da Nang',
    specs: ['Massage Đá Nóng', 'Massage Thư Giãn'],
    exp: 4,
    rating: 4.9,
    reviews: 165,
    rate: 330000,
    dist: 2.0,
    bio: 'Đá nóng giúp lưu thông, rất được khách du lịch yêu thích.',
    bioEn: 'Hot stone sessions popular with travelers.',
    bg: 'FFEDD5',
    fg: 'C2410C',
  }),
  makeTherapist({
    n: 'Đỗ Minh Tuấn',
    idSuffix: '006',
    gender: 'male',
    city: 'Da Nang',
    specs: ['Shiatsu', 'Massage Cổ Vai Gáy'],
    exp: 9,
    rating: 4.87,
    reviews: 128,
    rate: 390000,
    dist: 5.5,
    bio: 'Áp lực vừa phải, tập trung vùng cổ vai gáy văn phòng.',
    bioEn: 'Shiatsu-style pressure for desk workers.',
    bg: 'E0E7FF',
    fg: '3730A3',
  }),
  makeTherapist({
    n: 'Võ Thị Kim Ngân',
    idSuffix: '007',
    gender: 'female',
    city: 'Can Tho',
    specs: ['Foot Massage', 'Reflexology'],
    exp: 5,
    rating: 4.83,
    reviews: 201,
    rate: 280000,
    dist: 1.2,
    bio: 'Bấm huyệt bàn chân, giảm mỏi sau ngày dài.',
    bioEn: 'Reflexology to unwind after long days.',
    bg: 'FEF3C7',
    fg: '92400E',
  }),
  makeTherapist({
    n: 'Bùi Hải Nam',
    idSuffix: '008',
    gender: 'male',
    city: 'Ho Chi Minh',
    specs: ['Massage Trị Liệu', 'Vai Gáy'],
    exp: 10,
    rating: 4.96,
    reviews: 289,
    rate: 420000,
    dist: 3.8,
    bio: 'Chuyên sâu đau mỏi văn phòng, tư vấn tư thế ngồi.',
    bioEn: 'Therapeutic focus on neck and shoulder pain.',
    bg: 'F3E8FF',
    fg: '6B21A8',
  }),
  makeTherapist({
    n: 'Ngô Lan Chi',
    idSuffix: '009',
    gender: 'female',
    city: 'Ha Noi',
    specs: ['Prenatal Massage', 'Massage Nhẹ'],
    exp: 6,
    rating: 4.91,
    reviews: 94,
    rate: 370000,
    dist: 6.0,
    bio: 'Kỹ thuật nhẹ nhàng, an toàn cho mẹ bầu (theo chỉ định bác sĩ).',
    bioEn: 'Gentle prenatal care when medically cleared.',
    bg: 'FCE7F3',
    fg: '831843',
  }),
  makeTherapist({
    n: 'Dương Gia Bảo',
    idSuffix: '010',
    gender: 'male',
    city: 'Ho Chi Minh',
    specs: ['Massage Thái', 'Stretching'],
    exp: 5,
    rating: 4.84,
    reviews: 156,
    rate: 350000,
    dist: 2.9,
    bio: 'Kết hợp kéo giãn, giúp cơ thể nhẹ hơn sau 60 phút.',
    bioEn: 'Thai massage with assisted stretching.',
    bg: 'CCFBF1',
    fg: '115E59',
  }),
  makeTherapist({
    n: 'Trịnh Mỹ Hạnh',
    idSuffix: '011',
    gender: 'female',
    city: 'Da Nang',
    specs: ['Lymphatic Drainage', 'Massage Nhẹ'],
    exp: 4,
    rating: 4.86,
    reviews: 118,
    rate: 340000,
    dist: 3.3,
    bio: 'Thao tác nhẹ, phù hợp khách cần thư giãn sâu.',
    bioEn: 'Light-touch relaxation sessions.',
    bg: 'FEF9C3',
    fg: '854D0E',
  }),
  makeTherapist({
    n: 'Lý Hoàng Phúc',
    idSuffix: '012',
    gender: 'male',
    city: 'Ha Noi',
    specs: ['Deep Tissue', 'Massage Thể Thao'],
    exp: 7,
    rating: 4.82,
    reviews: 134,
    rate: 410000,
    dist: 4.7,
    bio: 'Lực sâu, phù hợp khách quen massage mạnh.',
    bioEn: 'Deep tissue for clients who prefer firm pressure.',
    bg: 'E0E7FF',
    fg: '312E81',
  }),
  makeTherapist({
    n: 'Mai Khánh Ly',
    idSuffix: '013',
    gender: 'female',
    city: 'Ho Chi Minh',
    specs: ['Massage Aroma', 'Head & Scalp'],
    exp: 5,
    rating: 4.93,
    reviews: 223,
    rate: 320000,
    dist: 1.5,
    bio: 'Xoa đầu và vai cổ, giảm căng sau làm việc máy tính.',
    bioEn: 'Head and scalp care for screen-time fatigue.',
    bg: 'FBCFE8',
    fg: '9F1239',
  }),
  makeTherapist({
    n: 'Huỳnh Đức Thịnh',
    idSuffix: '014',
    gender: 'male',
    city: 'Can Tho',
    specs: ['Foot Massage', 'Massage Thư Giãn'],
    exp: 6,
    rating: 4.8,
    reviews: 167,
    rate: 300000,
    dist: 2.2,
    bio: 'Giá hợp lý, phục vụ chu đáo tại khu trung tâm.',
    bioEn: 'Affordable home massage with attentive service.',
    bg: 'D1FAE5',
    fg: '065F46',
  }),
  makeTherapist({
    n: 'Phan Thu Trang',
    idSuffix: '015',
    gender: 'female',
    city: 'Da Nang',
    specs: ['Massage Đá Nóng', 'Aroma'],
    exp: 5,
    rating: 4.89,
    reviews: 145,
    rate: 360000,
    dist: 4.1,
    bio: 'Kết hợp đá nóng và tinh dầu, khách feedback rất tốt.',
    bioEn: 'Hot stones plus essential oils — strong feedback.',
    bg: 'FEE2E2',
    fg: '991B1B',
  }),
  makeTherapist({
    n: 'Vũ Tiến Đạt',
    idSuffix: '016',
    gender: 'male',
    city: 'Ha Noi',
    specs: ['Shiatsu', 'Massage Trị Liệu'],
    exp: 8,
    rating: 4.9,
    reviews: 189,
    rate: 390000,
    dist: 5.1,
    bio: 'Lịch ổn định, hay phục vụ khách làm việc ca đêm.',
    bioEn: 'Reliable scheduling for night-shift workers.',
    bg: 'CFFAFE',
    fg: '155E75',
  }),
  makeTherapist({
    n: 'Đặng Bảo Ngọc',
    idSuffix: '017',
    gender: 'female',
    city: 'Ho Chi Minh',
    specs: ['Massage Thư Giãn', 'Foot Massage'],
    exp: 3,
    rating: 4.78,
    reviews: 98,
    rate: 290000,
    dist: 7.2,
    bio: 'Nhiệt tình, phù hợp khách mới dùng dịch vụ lần đầu.',
    bioEn: 'Warm service for first-time bookings.',
    bg: 'EDE9FE',
    fg: '5B21B6',
  }),
  makeTherapist({
    n: 'Tôn Nhật Minh',
    idSuffix: '018',
    gender: 'male',
    city: 'Ho Chi Minh',
    specs: ['Massage Thái', 'Sports'],
    exp: 6,
    rating: 4.86,
    reviews: 152,
    rate: 370000,
    dist: 3.0,
    bio: 'Tập trung giãn cơ đùi và lưng dưới cho runner.',
    bioEn: 'Lower back and legs for runners.',
    bg: 'DBEAFE',
    fg: '1E40AF',
  }),
  makeTherapist({
    n: 'Châu Bích Phượng',
    idSuffix: '019',
    gender: 'female',
    city: 'Ha Noi',
    specs: ['Massage Aroma', 'Chăm Sóc Da'],
    exp: 7,
    rating: 4.91,
    reviews: 174,
    rate: 380000,
    dist: 2.6,
    bio: 'Không gian nhẹ nhàng, nhạc thư giãn theo sở thích.',
    bioEn: 'Calm sessions with music preferences.',
    bg: 'FCE7F3',
    fg: '831843',
  }),
  makeTherapist({
    n: 'Lâm Quốc Việt',
    idSuffix: '020',
    gender: 'male',
    city: 'Da Nang',
    specs: ['Deep Tissue', 'Vai Gáy'],
    exp: 9,
    rating: 4.84,
    reviews: 131,
    rate: 400000,
    dist: 5.8,
    bio: 'Xử lý cứng cổ vai cho dân văn phòng.',
    bioEn: 'Office-neck focused deep work.',
    bg: 'DCFCE7',
    fg: '14532D',
  }),
];

export function isVirtualTherapistId(id: string): boolean {
  return id.startsWith(PREFIX);
}

export function findVirtualTherapistById(id: string): Therapist | null {
  if (!INCLUDE_VIRTUAL_THERAPISTS) {
    return null;
  }
  return VIRTUAL_THERAPISTS.find((t) => t.id === id) ?? null;
}

export function mergeVirtualTherapists(server: Therapist[]): Therapist[] {
  if (!INCLUDE_VIRTUAL_THERAPISTS) {
    return server;
  }
  const seen = new Set(server.map((t) => t.id));
  const extra = VIRTUAL_THERAPISTS.filter((t) => !seen.has(t.id));
  return [...server, ...extra];
}

function iterateDateRangeLocal(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return out;
  }
  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Demo shifts for booking UI — không gọi Supabase. */
export function getVirtualTherapistShifts(
  therapistId: string,
  fromDate: string,
  toDate: string,
): { shiftDate: string; slots: string[] }[] | null {
  if (!INCLUDE_VIRTUAL_THERAPISTS || !isVirtualTherapistId(therapistId)) {
    return null;
  }
  const t = findVirtualTherapistById(therapistId);
  if (!t) {
    return null;
  }
  const dates = iterateDateRangeLocal(fromDate, toDate);
  const defaultSlots = ['08h - 10h', '10h - 12h', '14h - 16h', '18h - 20h'];
  return dates.map((shiftDate) => ({ shiftDate, slots: defaultSlots }));
}

/** Số review giả lập hiển thị trên màn chi tiết (kèm review thật từ BookingsContext nếu có). */
export function getGeneratedReviewItemCount(therapist: Therapist): number {
  if (!INCLUDE_VIRTUAL_THERAPISTS) {
    return Math.min(therapist.reviewCount, 5);
  }
  if (isVirtualTherapistId(therapist.id)) {
    return Math.min(Math.max(therapist.reviewCount, 14), 20);
  }
  return Math.min(therapist.reviewCount, 5);
}

export const VIRTUAL_REVIEW_TEMPLATES: { comment: string; hasTranslate: boolean }[] = [
  { comment: 'Dịch vụ rất tốt, đúng giờ, kỹ thuật ổn định.', hasTranslate: true },
  { comment: 'Massage nhẹ nhàng, tinh dầu thơm, sẽ đặt lại.', hasTranslate: true },
  { comment: 'KTV lịch sự, hỏi kỹ vùng đau trước khi làm.', hasTranslate: true },
  { comment: 'Không gian tại nhà gọn gàng, mình cảm thấy thư giãn.', hasTranslate: true },
  { comment: 'Áp lực vừa ý, không bị đau sau buổi massage.', hasTranslate: true },
  { comment: 'Professional and punctual. Highly recommended.', hasTranslate: true },
  { comment: 'Great for neck pain after long desk work.', hasTranslate: true },
  { comment: 'Foot massage rất đã, đi bộ cả ngày hồi phục nhanh.', hasTranslate: true },
  { comment: 'Giá hợp lý so với chất lượng phục vụ.', hasTranslate: true },
  { comment: 'Book lịch nhanh, KTV đến đúng khung giờ.', hasTranslate: true },
  { comment: 'Thích phong cách trò chuyện vừa phải, không ồn.', hasTranslate: true },
  { comment: 'Hot stone session was relaxing, will book again.', hasTranslate: true },
  { comment: 'Rất phù hợp sau khi tập gym, cơ đỡ căng hẳn.', hasTranslate: true },
  { comment: 'Mẹ bầu được massage nhẹ, cảm giác an toàn.', hasTranslate: true },
  { comment: 'Deep tissue đúng chỗ đau, khá hiệu quả.', hasTranslate: true },
  { comment: 'Shiatsu pressure was consistent throughout.', hasTranslate: true },
  { comment: 'Tư vấn tư thế ngồi thêm — rất hữu ích.', hasTranslate: true },
  { comment: 'Không bị khó chịu với tinh dầu, mùi dễ chịu.', hasTranslate: true },
  { comment: 'Excellent Massage.', hasTranslate: true },
  { comment: 'Lành mạnh, làm tốt đủ giờ', hasTranslate: true },
];
