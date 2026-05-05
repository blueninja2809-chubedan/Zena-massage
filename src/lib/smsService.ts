/**
 * SMS OTP (VietGuys CSKH brandname) via sms-backend.
 * Backend multipart POST matches VietGuys SMS docs (`sms-backend/server.js`).
 *
 * Required backend endpoints:
 * - POST /api/send-otp   body: { phoneNumber }
 * - POST /api/verify-otp body: { phoneNumber, otp }
 * - POST /api/reset-password-phone body: { phoneNumber, otp, newPassword }
 */

import { debugLog } from '@/lib/debugLog';
import Constants from 'expo-constants';

const SMS_API_BASE_URL = (process.env.EXPO_PUBLIC_SMS_API_BASE_URL ?? '').replace(/\/+$/, '');
const SMS_API_KEY = process.env.EXPO_PUBLIC_SMS_API_KEY ?? '';
/** Mặc định 30s để chờ VietGuys (refresh token + SMS) + độ trễ mạng. */
const SMS_API_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_SMS_API_TIMEOUT_MS ?? 30000);

function deriveExpoLanSmsBaseUrl(): string {
  const hostUriRaw =
    (Constants.expoConfig as { hostUri?: string } | null | undefined)?.hostUri ??
    ((Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost ?? '');
  const hostUri = String(hostUriRaw).trim();
  if (!hostUri) return '';

  const withoutScheme = hostUri.replace(/^[a-z]+:\/\//i, '');
  const host = withoutScheme.split('/')[0]?.split(':')[0] ?? '';
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return '';
  return `http://${host}:3000`;
}

function getSmsApiBaseUrlCandidates(): string[] {
  const candidates: string[] = [];
  if (SMS_API_BASE_URL) candidates.push(SMS_API_BASE_URL);
  const expoLanBase = deriveExpoLanSmsBaseUrl();
  if (expoLanBase && !candidates.includes(expoLanBase)) {
    candidates.push(expoLanBase);
  }
  return candidates;
}

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

function smsUnreachableHint(): string {
  const urls = getSmsApiBaseUrlCandidates();
  if (urls.length === 0) return '';
  try {
    const formatted = urls.map((rawUrl) => {
      const u = new URL(rawUrl.startsWith('http') ? rawUrl : `http://${rawUrl}`);
      const port = u.port || (u.protocol === 'https:' ? '443' : '80');
      return `${u.hostname}:${port}`;
    });
    return formatted.join(', ');
  } catch {
    return urls.join(', ');
  }
}

function connectionFailedMessage(rawError: unknown): string {
  const hint = smsUnreachableHint();
  const tail =
    'Trên VPS: sms-backend đang chạy, HOST=0.0.0.0 (xem sms-backend/start.sh hoặc pm2:start). Trên firewall cloud + VPS mở TCP đúng cổng (ví dụ 3000). Thử máy khác: curl URL/health — nếu timeout thì ingress chặn.';
  if (hint) {
    return `Không kết nối được OTP backend (${hint}). ${tail}`;
  }
  return `Không kết nối được OTP backend. ${tail}`;
}

async function postSmsApiJson<T extends Record<string, unknown>>(
  path: string,
  payload: Record<string, string>,
): Promise<T & { success: boolean; message: string; error?: string }> {
  const baseUrlCandidates = getSmsApiBaseUrlCandidates();
  if (baseUrlCandidates.length === 0) {
    return {
      success: false,
      message: 'SMS API chưa cấu hình. Thiếu EXPO_PUBLIC_SMS_API_BASE_URL trong .env',
      error: 'sms-api-not-configured',
    } as T & { success: boolean; message: string; error?: string };
  }
  let lastNetworkError: unknown = null;
  for (const baseUrl of baseUrlCandidates) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), SMS_API_TIMEOUT_MS);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (SMS_API_KEY) {
      headers['x-api-key'] = SMS_API_KEY;
    }

    try {
      const response = await fetch(`${baseUrl}${path}`, {
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
        } as T & { success: boolean; message: string; error?: string };
      }

      return {
        success: Boolean(data.success ?? true),
        message: String(data.message ?? 'OK'),
        error: data.error ? String(data.error) : undefined,
      } as T & { success: boolean; message: string; error?: string };
    } catch (error) {
      lastNetworkError = error;
      debugLog('smsService', 'OTP fetch failed', baseUrl, error);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  const error = lastNetworkError;
  return {
    success: false,
    message:
      error instanceof Error && error.name === 'AbortError'
        ? 'OTP API timeout. Vui lòng thử lại.'
        : connectionFailedMessage(error),
    error: error instanceof Error ? error.message : 'Unknown error',
  } as T & { success: boolean; message: string; error?: string };
}

async function postSmsApi<T extends SendOtpResponse | VerifyOtpResponse>(
  path: '/api/send-otp' | '/api/verify-otp',
  payload: Record<string, string>,
): Promise<T> {
  return postSmsApiJson<T>(path, payload);
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

export type ResetPasswordWithOtpResponse = {
  success: boolean;
  message: string;
  error?: string;
};

/**
 * Đặt lại mật khẩu sau khi xác thực OTP (VietGuys qua sms-backend).
 * Một request: verify OTP + cập nhật password_hash qua Supabase (service_role).
 */
export async function resetPasswordWithPhoneOtp(
  phoneNumber: string,
  otp: string,
  newPassword: string,
): Promise<ResetPasswordWithOtpResponse> {
  return postSmsApiJson<ResetPasswordWithOtpResponse>('/api/reset-password-phone', {
    phoneNumber,
    otp,
    newPassword,
  });
}
