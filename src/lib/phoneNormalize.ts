/**
 * Chuẩn hoá số điện thoại Việt Nam về dạng quốc gia không dấu + (ví dụ 84912345678).
 * Dùng thống nhất cho đăng ký / đăng nhập (profiles.phone_number).
 */
export function normalizeVietnamPhone(phoneNumber: string): string {
  const trimmed = phoneNumber.trim();
  if (!trimmed) return '';

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) {
    return trimmed.replace(/\s/g, '');
  }

  let d = digitsOnly;

  if (d.startsWith('84')) {
    // Đã có mã 84
  } else if (d.startsWith('0') && d.length >= 10) {
    d = `84${d.slice(1)}`;
  } else if (d.length === 9 && /^[35789]/.test(d)) {
    d = `84${d}`;
  }

  if (d.startsWith('84') && d.length >= 11 && d.length <= 12) {
    return d;
  }

  return digitsOnly;
}
