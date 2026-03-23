/**
 * SMS OTP Service
 * This service handles SMS OTP sending and verification through a backend API
 *
 * Required backend endpoints:
 * - POST /api/send-otp   body: { phoneNumber }
 * - POST /api/verify-otp body: { phoneNumber, otp }
 */

const SMS_API_BASE_URL = (process.env.EXPO_PUBLIC_SMS_API_BASE_URL ?? '').replace(/\/+$/, '');
const SMS_API_KEY = process.env.EXPO_PUBLIC_SMS_API_KEY ?? '';
const SMS_API_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_SMS_API_TIMEOUT_MS ?? 12000);

interface SendOtpResponse {
  success: boolean;
  message: string;
  error?: string;
}

interface VerifyOtpResponse {
  success: boolean;
  message: string;
  error?: string;
}

async function postSmsApi<T extends SendOtpResponse | VerifyOtpResponse>(
  path: '/api/send-otp' | '/api/verify-otp',
  payload: Record<string, string>,
): Promise<T> {
  if (!SMS_API_BASE_URL) {
    return {
      success: false,
      message: 'SMS API chưa cấu hình. Thiếu EXPO_PUBLIC_SMS_API_BASE_URL trong .env',
      error: 'sms-api-not-configured',
    } as T;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), SMS_API_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (SMS_API_KEY) {
      headers['x-api-key'] = SMS_API_KEY;
    }

    const response = await fetch(`${SMS_API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      // Keep empty; we'll build fallback response below.
    }

    if (!response.ok) {
      return {
        success: false,
        message: String(data.message ?? 'SMS API request failed'),
        error: String(data.error ?? `HTTP ${response.status}`),
      } as T;
    }

    return {
      success: Boolean(data.success ?? true),
      message: String(data.message ?? 'OK'),
      error: data.error ? String(data.error) : undefined,
    } as T;
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error && error.name === 'AbortError'
          ? 'SMS API timeout. Vui lòng thử lại.'
          : 'Không thể kết nối đến SMS API backend.',
      error: error instanceof Error ? error.message : 'Unknown error',
    } as T;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Send OTP to phone number
 * @param phoneNumber - Phone number to send OTP to
 * @returns Promise with success status and message
 */
export async function sendOtp(phoneNumber: string): Promise<SendOtpResponse> {
  return postSmsApi('/api/send-otp', { phoneNumber });
}

/**
 * Verify OTP code
 * @param phoneNumber - Phone number to verify
 * @param otp - OTP code entered by user
 * @returns Promise with success status and message
 */
export async function verifyOtp(
  phoneNumber: string,
  otp: string
): Promise<VerifyOtpResponse> {
  return postSmsApi('/api/verify-otp', { phoneNumber, otp });
}
