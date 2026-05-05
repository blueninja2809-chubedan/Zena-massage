import { normalizeVietnamPhone } from '@/lib/phoneNormalize';

export const ADMIN_PHONE_NUMBERS = ['0347121391'] as const;

export function normalizePhoneForRole(phone?: string | null): string {
  if (!phone) return '';
  return normalizeVietnamPhone(String(phone));
}

export function isAdminPhone(phone?: string | null): boolean {
  const normalized = normalizePhoneForRole(phone);
  if (!normalized) return false;
  return ADMIN_PHONE_NUMBERS.some((p) => normalizeVietnamPhone(p) === normalized);
}
