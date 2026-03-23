/**
 * PayOS Payment Service
 * Creates QR code payments and checks payment status via the backend API.
 *
 * Backend endpoints used:
 * - POST /api/payos/create-payment   body: { userId, amount, description? }
 * - GET  /api/payos/payment-status/:orderCode
 */

const API_BASE_URL = (process.env.EXPO_PUBLIC_SMS_API_BASE_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.EXPO_PUBLIC_SMS_API_KEY ?? '';
const API_TIMEOUT_MS = 15000;

export interface PayOSPaymentResult {
  orderCode: number;
  checkoutUrl: string;
  qrCode: string;
  amount: number;
}

export interface PayOSPaymentStatus {
  orderCode: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED';
  amount: number;
  amountPaid: number;
}

async function payosApi<T>(
  path: string,
  options: { method?: string; body?: Record<string, unknown> } = {},
): Promise<{ success: boolean; data?: T; message?: string }> {
  if (!API_BASE_URL) {
    return { success: false, message: 'API chưa cấu hình. Thiếu EXPO_PUBLIC_SMS_API_BASE_URL' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['x-api-key'] = API_KEY;

    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method || 'POST',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const json = await res.json();
    return json;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort')) {
      return { success: false, message: 'Hết thời gian kết nối. Vui lòng thử lại.' };
    }
    return { success: false, message: msg };
  } finally {
    clearTimeout(timeout);
  }
}

/** Create PayOS payment link and get QR code */
export async function createPayOSPayment(
  userId: string,
  amount: number,
  description?: string,
): Promise<{ success: boolean; data?: PayOSPaymentResult; message?: string }> {
  return payosApi<PayOSPaymentResult>('/api/payos/create-payment', {
    body: { userId, amount, description },
  });
}

/** Check payment status by orderCode */
export async function checkPayOSPaymentStatus(
  orderCode: number,
): Promise<{ success: boolean; data?: PayOSPaymentStatus; message?: string }> {
  return payosApi<PayOSPaymentStatus>(`/api/payos/payment-status/${orderCode}`, {
    method: 'GET',
  });
}
