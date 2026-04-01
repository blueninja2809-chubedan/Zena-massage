/** Chuẩn hoá SĐT gửi backend (app_users) — VN: 0xxxxxxxxx; quốc tế: +cc... */
export function nationalDigitsToAppPhone(callingCode: string, national: string): string {
  const d = national.replace(/\D/g, '');
  if (!d) return '';
  if (callingCode === '84') {
    if (d.startsWith('0')) return d;
    return `0${d}`;
  }
  return `+${callingCode}${d}`;
}

export function isLikelyValidAppPhone(callingCode: string, national: string): boolean {
  const full = nationalDigitsToAppPhone(callingCode, national);
  if (!full) return false;
  if (callingCode === '84') {
    return /^0[0-9]{9,10}$/.test(full);
  }
  const e164ish = full.replace(/\s/g, '');
  return /^\+[1-9]\d{7,14}$/.test(e164ish);
}
