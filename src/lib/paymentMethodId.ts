/**
 * Legacy wallet payment method id from older builds ("glow" → "zena").
 */
export function mapGlowPaymentMethodIdToZena(value: string): string {
  return value.trim().toLowerCase() === 'glow' ? 'zena' : value;
}

export function mapGlowPaymentMethodIdToZenaUnknown(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return mapGlowPaymentMethodIdToZena(value);
}
