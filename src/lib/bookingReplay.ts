import type { SharedBooking } from '@/contexts/BookingsContext';
import type { Therapist } from '@/lib/types';

/** Dòng trong cart khi tái đặt lịch (khớp `SelectedService`). */
export interface ReplaySelectedService {
  name: string;
  duration: number;
  price: number;
}

function normalizeService(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Giá cố định theo dịch vụ + therapist (aligned với `TherapistDetailScreen.generateServicesForTherapist`). */
function defaultPriceAndDuration(serviceName: string, therapist: Therapist): { duration: number; price: number } {
  const base = therapist.hourlyRate > 0 ? therapist.hourlyRate : 300000;
  const isEar = normalizeService(serviceName).includes('lay ray') || normalizeService(serviceName).includes('tai');
  const duration = isEar ? 40 : 60;
  const price = therapist.hourlyRate > 0 ? therapist.hourlyRate * 2 : 600000;
  return { duration, price: Math.round(price) };
}

/** Lấy lại cart từ đơn đã lưu — ưu tiên snapshot trong payload DB, fallback split `service`. */
export function replayServicesFromBooking(
  booking: SharedBooking,
  therapist: Therapist,
): ReplaySelectedService[] {
  const snap = booking.customerCartSnapshot;
  if (snap && snap.length > 0) {
    return snap.map((row) => ({
      name: String(row.name ?? '').trim(),
      duration: Number.isFinite(Number(row.duration)) ? Number(row.duration) : 60,
      price: Math.max(0, Number(row.price ?? 0)),
    })).filter((s) => s.name.length > 0 && s.duration > 0 && Number.isFinite(s.price) && s.price >= 0);
  }

  const names = booking.service.split(',').map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) {
    const { duration, price } = defaultPriceAndDuration('Massage', therapist);
    return [{ name: 'Massage', duration, price }];
  }

  const specsSet = new Set((therapist.specialties ?? []).map((x) => normalizeService(x)));

  return names.map((rawName) => {
    let name = rawName;
    const fromSpec = therapist.specialties?.find((sp) => normalizeService(sp) === normalizeService(rawName));
    if (fromSpec) {
      name = fromSpec;
    } else if (specsSet.size === 1) {
      const only = therapist.specialties![0];
      name = normalizeService(rawName).includes('massage') ? only : rawName;
    }
    const { duration, price } = defaultPriceAndDuration(name, therapist);
    return { name, duration, price };
  });
}
