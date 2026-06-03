const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const https = require('https');
const dns = require('dns');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const { registerPushFcmRoute } = require('./pushFcm');

// Luôn load .env cạnh server.js — tránh PASSCODE trống khi chạy node từ cwd khác (home vs công ty).
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

const PORT = Number(process.env.PORT || 3000);
/** Listen address — must be 0.0.0.0 on VPS so phones reach OTP (not only localhost). */
const HOST = (process.env.HOST ?? '0.0.0.0').trim() || '0.0.0.0';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const SMS_API_KEY = process.env.SMS_API_KEY || '';
const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 5 * 60 * 1000);
const OTP_DEV_FALLBACK_ON_SEND_FAIL = process.env.OTP_DEV_FALLBACK_ON_SEND_FAIL === '1';
/** Set to 1 to log each VietGuys-bound request (pwd / token values are redacted). */
const VIETGUYS_DEBUG_LOG = process.env.VIETGUYS_DEBUG_LOG === '1';
const OTP_LENGTH = 6;
/** Max SMS OTP send requests per phone before cooldown (signup, forgot password, resend — shared). */
const OTP_SEND_MAX_ATTEMPTS = Number(process.env.OTP_SEND_MAX_ATTEMPTS || 3);
/** Cooldown after OTP_SEND_MAX_ATTEMPTS sends (default 10 minutes). */
const OTP_SEND_COOLDOWN_MS = Number(process.env.OTP_SEND_COOLDOWN_MS || 10 * 60 * 1000);
const otpStore = new Map();
/** phone -> { sendCount, blockedUntil } */
const otpSendRateStore = new Map();

const vietGuysHttpsAgent = new https.Agent({
  lookup: (hostname, opts, cb) => dns.lookup(hostname, { ...opts, family: 4 }, cb),
});

// ── VietGuys CSKH OTP configuration ──
// Docs: https://developers.vietguys.biz/vi_1_2/#cskh (multipart POST: from, u, pwd, phone, sms, bid, pid?, type, json)
// pwd = Access Token hoặc Pwd cố định (cùng định nghĩa). Access Token lấy qua Generate Access Token:
// POST https://api-v2.vietguys.biz:4438/token/v1/refresh — header Refresh-Token + body username + type refresh_token
const VIETGUYS_CSKH_URL = process.env.VIETGUYS_CSKH_URL || 'https://cloudsms4.vietguys.biz:4438/api/index.php';
const VIETGUYS_TOKEN_URL = process.env.VIETGUYS_TOKEN_URL || 'https://api-v2.vietguys.biz:4438/token/v1/refresh';
const VIETGUYS_USERNAME = (process.env.VIETGUYS_USERNAME || '').trim();
const VIETGUYS_PASSCODE = (process.env.VIETGUYS_PASSCODE || '').trim();
const VIETGUYS_ACCESS_TOKEN = (process.env.VIETGUYS_ACCESS_TOKEN || '').trim();
const VIETGUYS_REFRESH_TOKEN = (process.env.VIETGUYS_REFRESH_TOKEN || '').trim();
const VIETGUYS_BRANDNAME = process.env.VIETGUYS_BRANDNAME || '';
const VIETGUYS_PID = process.env.VIETGUYS_PID || '';

/** In-memory cache after refresh; response may rotate refresh_token. */
let vietGuysTokenCache = {
  accessToken: '',
  refreshToken: '',
  expiresAtMs: 0,
};

function vietGuysHasSmsCredential() {
  return !!(VIETGUYS_REFRESH_TOKEN || VIETGUYS_PASSCODE || VIETGUYS_ACCESS_TOKEN);
}

async function refreshVietGuysAccessToken() {
  const refreshHeader = vietGuysTokenCache.refreshToken || VIETGUYS_REFRESH_TOKEN;
  if (!refreshHeader || !VIETGUYS_USERNAME) {
    throw new Error('vietguys-refresh-not-configured');
  }
  const body = JSON.stringify({
    username: VIETGUYS_USERNAME,
    type: 'refresh_token',
  });
  const response = await axios.request({
    method: 'post',
    url: VIETGUYS_TOKEN_URL,
    headers: {
      'Content-Type': 'application/json',
      'Refresh-Token': refreshHeader,
    },
    data: body,
    timeout: 12000,
    httpsAgent: vietGuysHttpsAgent,
    validateStatus: () => true,
  });
  let data = response.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  const errRaw = data?.error;
  const errOk = errRaw === 0 || errRaw === '0' || Number(errRaw) === 0;
  const accessTok =
    (data?.data && typeof data.data === 'object' && data.data.access_token) ||
    data?.access_token;
  if (!data || !errOk || typeof accessTok !== 'string' || !accessTok.trim()) {
    const hint =
      data?.message ||
      (data ? JSON.stringify(data) : `HTTP ${response.status}`);
    if (VIETGUYS_DEBUG_LOG) {
      console.warn('[VietGuys refresh] status=', response.status, 'body=', hint.slice(0, 800));
    }
    throw new Error(`vietguys-refresh-failed:${hint}`);
  }
  const expiredRaw = Number(data.data?.expired_at ?? data.expired_at);
  const expiresAtMs = Number.isFinite(expiredRaw)
    ? expiredRaw < 1e12
      ? expiredRaw * 1000
      : expiredRaw
    : Date.now() + 55 * 60 * 1000;
  vietGuysTokenCache = {
    accessToken: String(accessTok),
    refreshToken:
      data.data?.refresh_token != null
        ? String(data.data.refresh_token)
        : data.refresh_token != null
          ? String(data.refresh_token)
          : vietGuysTokenCache.refreshToken || VIETGUYS_REFRESH_TOKEN,
    expiresAtMs,
  };
  return vietGuysTokenCache.accessToken;
}

/** pwd cho SMS CSKH: ưu tiên access token từ refresh API nếu có VIETGUYS_REFRESH_TOKEN; lỗi refresh + có PASSCODE thì fallback tĩnh. */
async function getVietGuysPwdForSms() {
  if (VIETGUYS_REFRESH_TOKEN) {
    const skewMs = 90_000;
    try {
      if (
        vietGuysTokenCache.accessToken &&
        vietGuysTokenCache.expiresAtMs > Date.now() + skewMs
      ) {
        return vietGuysTokenCache.accessToken;
      }
      return await refreshVietGuysAccessToken();
    } catch (e) {
      const staticPwd = VIETGUYS_PASSCODE || VIETGUYS_ACCESS_TOKEN;
      if (staticPwd) {
        console.warn(
          '[VietGuys] Refresh token thất bại, dùng VIETGUYS_PASSCODE:',
          e instanceof Error ? e.message : e,
        );
        return staticPwd;
      }
      throw e;
    }
  }
  const staticPwd = VIETGUYS_PASSCODE || VIETGUYS_ACCESS_TOKEN;
  if (!staticPwd) throw new Error('vietguys-not-configured');
  return staticPwd;
}

function logRedactedVietGuysPayload(fields) {
  if (!VIETGUYS_DEBUG_LOG) return;
  const safe = { ...fields };
  if (Object.prototype.hasOwnProperty.call(safe, 'pwd')) {
    safe.pwd = '[REDACTED]';
  }
  console.log('[VietGuys CSKH] POST', VIETGUYS_CSKH_URL, 'form:', JSON.stringify(safe));
}

if (!VIETGUYS_USERNAME || !vietGuysHasSmsCredential() || !VIETGUYS_BRANDNAME) {
  console.warn('[WARN] Missing VietGuys env vars (VIETGUYS_USERNAME, VIETGUYS_BRANDNAME, and one of: VIETGUYS_REFRESH_TOKEN — hoặc VIETGUYS_PASSCODE / VIETGUYS_ACCESS_TOKEN). OTP endpoints will fail until configured.');
}

// Supabase (OTP reset password + FCM push)
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

async function supabaseRpc(fnName, params) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase not configured on backend');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase RPC ${fnName} failed: ${res.status} ${text}`);
  }
  return res.json();
}

app.use(helmet());
app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

function normalizePhone(rawPhone) {
  const cleaned = String(rawPhone || '').replace(/\s/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('0')) return `+84${cleaned.slice(1)}`;
  return `+${cleaned}`;
}

function toVietGuysPhone(rawPhone) {
  return normalizePhone(rawPhone).replace(/^\+/, '');
}

function generateOtpCode() {
  return String(crypto.randomInt(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH));
}

function makeTrackingId(phone) {
  return `otp-${Date.now()}-${phone.slice(-9)}`;
}

function getStoredOtp(phone) {
  const entry = otpStore.get(phone);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    otpStore.delete(phone);
    return null;
  }
  return entry;
}

function getOtpSendRateEntry(phone) {
  const entry = otpSendRateStore.get(phone);
  if (!entry) return null;
  const now = Date.now();
  if (entry.blockedUntil && entry.blockedUntil <= now) {
    otpSendRateStore.delete(phone);
    return null;
  }
  return entry;
}

function checkOtpSendRateLimit(phone) {
  const entry = getOtpSendRateEntry(phone);
  const now = Date.now();
  if (!entry) {
    return {
      allowed: true,
      remainingAttempts: OTP_SEND_MAX_ATTEMPTS,
    };
  }
  if (entry.blockedUntil && entry.blockedUntil > now) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterMs: entry.blockedUntil - now,
    };
  }
  const used = entry.sendCount || 0;
  if (used >= OTP_SEND_MAX_ATTEMPTS) {
    entry.blockedUntil = now + OTP_SEND_COOLDOWN_MS;
    otpSendRateStore.set(phone, entry);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterMs: OTP_SEND_COOLDOWN_MS,
    };
  }
  return {
    allowed: true,
    remainingAttempts: Math.max(0, OTP_SEND_MAX_ATTEMPTS - used),
  };
}

function recordOtpSendAttempt(phone) {
  const now = Date.now();
  let entry = getOtpSendRateEntry(phone) || { sendCount: 0, blockedUntil: 0 };
  entry.sendCount = (entry.sendCount || 0) + 1;
  if (entry.sendCount >= OTP_SEND_MAX_ATTEMPTS) {
    entry.blockedUntil = now + OTP_SEND_COOLDOWN_MS;
  }
  otpSendRateStore.set(phone, entry);
  return entry;
}

async function sendOtpViaVietGuys(phoneNumber, otp) {
  if (!VIETGUYS_USERNAME || !vietGuysHasSmsCredential() || !VIETGUYS_BRANDNAME) {
    throw new Error('vietguys-not-configured');
  }

  const sendOnce = async (fromValue) => {
    const pwd = await getVietGuysPwdForSms();
    const form = new FormData();
    form.append('from', fromValue);
    form.append('u', VIETGUYS_USERNAME);
    form.append('pwd', pwd);
    form.append('phone', toVietGuysPhone(phoneNumber));
    // ASCII + short text; VietGuys treats this as OTP (see API error -21: not OTP).
    form.append('sms', `Ma OTP Vlocal cua ban la ${otp}`);
    form.append('bid', makeTrackingId(phoneNumber));
    if (VIETGUYS_PID) {
      form.append('pid', VIETGUYS_PID);
    }
    form.append('type', '0');
    form.append('json', '1');

    if (VIETGUYS_DEBUG_LOG) {
      logRedactedVietGuysPayload({
        from: fromValue,
        u: VIETGUYS_USERNAME,
        pwd,
        phone: toVietGuysPhone(phoneNumber),
        sms: `Ma OTP Vlocal cua ban la ${otp}`,
        bid: makeTrackingId(phoneNumber),
        ...(VIETGUYS_PID ? { pid: VIETGUYS_PID } : {}),
        type: '0',
        json: '1',
      });
    }

    const response = await axios.request({
      method: 'post',
      url: VIETGUYS_CSKH_URL,
      headers: {
        ...form.getHeaders(),
      },
      data: form,
      // Keep backend timeout lower than mobile timeout so app receives a
      // structured backend error instead of hitting client-side AbortController.
      timeout: 9000,
      maxBodyLength: Infinity,
      httpsAgent: vietGuysHttpsAgent,
      validateStatus: () => true,
    });

    const rawText = typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data ?? {});
    let data = null;
    try {
      data = typeof response.data === 'object' && response.data !== null
        ? response.data
        : JSON.parse(rawText);
    } catch {
      data = null;
    }

    const ok = response.status >= 200 && response.status < 300 && (
      (data && Number(data.error) === 0) ||
      (data && typeof data.id === 'string' && data.id.length > 0)
    );

    if (!ok) {
      const errCode = data && data.error_code !== undefined && data.error_code !== null
        ? Number(data.error_code)
        : NaN;
      const logLo = String(data?.log || '').toLowerCase();
      // Docs: −7 = IP không nằm whitelist; log thường "Dia chi IP chua chinh xac".
      if (
        errCode === -7 ||
        logLo.includes('dia chi ip') ||
        (logLo.includes('ip') && logLo.includes('chua'))
      ) {
        throw new Error('vietguys-ip-not-allowed');
      }
      const msg =
        (data && (data.log || data.message || data.error_code)) ||
        rawText ||
        `HTTP ${response.status}`;
      throw new Error(`vietguys-send-failed:${msg}`);
    }

    return data;
  };

  try {
    return await sendOnce(VIETGUYS_BRANDNAME);
  } catch (error) {
    const detail = error?.message ? String(error.message) : '';
    const senderInvalid = detail.toLowerCase().includes('sender chua chinh xac');
    // Some VietGuys setups require sender == account username.
    if (senderInvalid && VIETGUYS_USERNAME && VIETGUYS_USERNAME !== VIETGUYS_BRANDNAME) {
      return sendOnce(VIETGUYS_USERNAME);
    }
    throw error;
  }
}

function requireApiKey(req, res, next) {
  if (!SMS_API_KEY) return next();
  const incoming = req.header('x-api-key') || '';
  if (incoming !== SMS_API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
      error: 'invalid-api-key',
    });
  }
  next();
}

app.get('/', (_req, res) => {
  res.redirect(302, '/health');
});

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'SMS backend is running',
    ts: new Date().toISOString(),
  });
});

registerPushFcmRoute(app, {
  supabaseUrl: SUPABASE_URL,
  serviceKey: SUPABASE_SERVICE_KEY,
  requireApiKey,
});

app.post('/api/send-otp', requireApiKey, async (req, res) => {
  try {
    const phoneNumber = normalizePhone(req.body?.phoneNumber);
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'phoneNumber is required',
        error: 'missing-phone-number',
      });
    }

    const rate = checkOtpSendRateLimit(phoneNumber);
    if (!rate.allowed) {
      const retryMin = Math.max(1, Math.ceil((rate.retryAfterMs || OTP_SEND_COOLDOWN_MS) / 60000));
      return res.status(429).json({
        success: false,
        message: `Bạn đã gửi mã OTP quá nhiều lần. Vui lòng thử lại sau ${retryMin} phút hoặc liên hệ hỗ trợ.`,
        error: 'otp-rate-limited',
        retryAfterMs: rate.retryAfterMs || OTP_SEND_COOLDOWN_MS,
        remainingAttempts: 0,
      });
    }

    recordOtpSendAttempt(phoneNumber);
    const afterSend = getOtpSendRateEntry(phoneNumber);
    const remainingAttempts = afterSend
      ? Math.max(0, OTP_SEND_MAX_ATTEMPTS - (afterSend.sendCount || 0))
      : OTP_SEND_MAX_ATTEMPTS;

    const otp = generateOtpCode();
    let usingLocalFallback = false;
    try {
      await sendOtpViaVietGuys(phoneNumber, otp);
    } catch (sendErr) {
      const detail = sendErr?.message ? String(sendErr.message) : '';
      if (!OTP_DEV_FALLBACK_ON_SEND_FAIL) {
        throw sendErr;
      }
      usingLocalFallback = true;
      console.warn('[OTP] VietGuys send failed, using local fallback OTP:', detail);
      console.warn(`[OTP] Fallback code for ${phoneNumber}: ${otp}`);
    }

    otpStore.set(phoneNumber, {
      otp,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
    });

    return res.json({
      success: true,
      message: usingLocalFallback
        ? `VietGuys tạm lỗi sender, dùng OTP test: ${otp}`
        : 'Đã gửi mã OTP qua SMS (brandname CSKH). Vui lòng kiểm tra tin nhắn.',
      remainingAttempts,
    });
  } catch (error) {
    const code = error?.code ? String(error.code) : 'send-otp-failed';
    const detail = error?.message ? String(error.message) : 'Unknown error';
    const message =
      detail === 'vietguys-not-configured'
        ? 'SMS OTP VietGuys (CSKH) chưa được cấu hình.'
        : detail.startsWith('vietguys-refresh-failed') || detail === 'vietguys-refresh-not-configured'
          ? 'Không lấy được access token VietGuys (Generate Access Token). Kiểm tra VIETGUYS_USERNAME và VIETGUYS_REFRESH_TOKEN trên ai.vietguys.biz → Profile → Settings V4.'
        : detail === 'vietguys-ip-not-allowed'
          ? 'VietGuys chỉ chấp nhận IP đã khai báo (mã −7). Đăng ký IP public của máy chủ chạy sms-backend với VietGuys; khi dev local, whitelist IP nhà hoặc tunnel qua server đã whitelist.'
        : detail.toLowerCase().includes('sender chua chinh xac')
          ? 'VietGuys từ chối brandname sender. Cần cấu hình VIETGUYS_BRANDNAME đúng brandname đã đăng ký.'
        : detail.includes('API dang o trang thai tat')
          ? 'VietGuys báo API SMS/Voice OTP của tài khoản đang bị tắt. Vui lòng bật dịch vụ hoặc cấu hình đúng passcode/brandname.'
        : /xac\s*thuc/i.test(detail) && /chua\s*chinh\s*xac|khong\s*dung/i.test(detail)
          ? 'VietGuys từ chối xác thực. Đặt VIETGUYS_REFRESH_TOKEN (docs Generate Access Token) để backend lấy pwd động; hoặc đúng Pwd trong Profile → Token Field (VIETGUYS_PASSCODE).'
          : 'Không thể gửi mã OTP qua SMS.';

    return res.status(500).json({
      success: false,
      message,
      error: `${code}: ${detail}`,
    });
  }
});

app.post('/api/verify-otp', requireApiKey, async (req, res) => {
  try {
    const phoneNumber = normalizePhone(req.body?.phoneNumber);
    const otp = String(req.body?.otp || '').trim();

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: 'phoneNumber and otp are required',
        error: 'missing-params',
      });
    }

    const entry = getStoredOtp(phoneNumber);
    if (!entry) {
      return res.status(400).json({
        success: false,
        message: 'OTP không hợp lệ hoặc đã hết hạn.',
        error: 'otp-expired',
      });
    }

    if (entry.attempts >= 5) {
      otpStore.delete(phoneNumber);
      return res.status(400).json({
        success: false,
        message: 'OTP đã bị khóa do nhập sai quá nhiều lần.',
        error: 'otp-locked',
      });
    }

    if (entry.otp !== otp) {
      entry.attempts += 1;
      otpStore.set(phoneNumber, entry);
      return res.status(400).json({
        success: false,
        message: 'OTP không đúng.',
        error: 'otp-not-match',
      });
    }

    otpStore.delete(phoneNumber);

    return res.json({
      success: true,
      message: 'Xác thực OTP thành công.',
    });
  } catch (error) {
    const code = error?.code ? String(error.code) : 'verify-otp-failed';
    const detail = error?.message ? String(error.message) : 'Unknown error';
    return res.status(500).json({
      success: false,
      message: 'Không thể xác thực OTP.',
      error: `${code}: ${detail}`,
    });
  }
});

/**
 * Đặt lại mật khẩu: xác thực OTP (cùng otpStore với /api/send-otp) rồi gọi Supabase RPC
 * reset_password_for_phone bằng service_role — không expose RPC cho anon.
 */
app.post('/api/reset-password-phone', requireApiKey, async (req, res) => {
  try {
    const phoneNumber = normalizePhone(req.body?.phoneNumber);
    const otp = String(req.body?.otp || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu số điện thoại hoặc mã OTP.',
        error: 'missing-params',
      });
    }
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới tối thiểu 6 ký tự.',
        error: 'weak-password',
      });
    }

    const entry = getStoredOtp(phoneNumber);
    if (!entry) {
      return res.status(400).json({
        success: false,
        message: 'OTP không hợp lệ hoặc đã hết hạn. Vui lòng gửi lại mã.',
        error: 'otp-expired',
      });
    }
    if (entry.attempts >= 5) {
      otpStore.delete(phoneNumber);
      return res.status(400).json({
        success: false,
        message: 'OTP đã bị khóa do nhập sai quá nhiều lần.',
        error: 'otp-locked',
      });
    }
    if (entry.otp !== otp) {
      entry.attempts += 1;
      otpStore.set(phoneNumber, entry);
      return res.status(400).json({
        success: false,
        message: 'Mã OTP không đúng.',
        error: 'otp-not-match',
      });
    }

    otpStore.delete(phoneNumber);

    const profilePhone = phoneNumber.replace(/^\+/, '');
    let rpcResult;
    try {
      rpcResult = await supabaseRpc('reset_password_for_phone', {
        p_phone: profilePhone,
        p_new_password: newPassword,
      });
    } catch (rpcErr) {
      const msg = rpcErr?.message ? String(rpcErr.message) : 'rpc-error';
      console.error('[reset-password-phone] Supabase RPC failed:', msg);
      return res.status(500).json({
        success: false,
        message: 'Không cập nhật được mật khẩu. Kiểm tra cấu hình Supabase trên sms-backend.',
        error: msg,
      });
    }

    const ok = rpcResult && typeof rpcResult === 'object' && rpcResult.ok === true;
    if (!ok) {
      const err = rpcResult?.error ? String(rpcResult.error) : 'reset_failed';
      const message =
        err === 'user_not_found'
          ? 'Không tìm thấy tài khoản với số điện thoại này.'
          : err === 'invalid_phone'
            ? 'Số điện thoại không hợp lệ.'
            : 'Không đặt lại được mật khẩu.';
      return res.status(400).json({
        success: false,
        message,
        error: err,
      });
    }

    return res.json({
      success: true,
      message: 'Đã đặt lại mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.',
    });
  } catch (error) {
    const code = error?.code ? String(error.code) : 'reset-password-failed';
    const detail = error?.message ? String(error.message) : 'Unknown error';
    return res.status(500).json({
      success: false,
      message: 'Không thể đặt lại mật khẩu.',
      error: `${code}: ${detail}`,
    });
  }
});

app.listen(PORT, HOST, () => {
  console.log(
    `[SMS-BACKEND] Listening http://${HOST}:${PORT}/health — firewall/security group must allow inbound TCP ${PORT}`,
  );
  try {
    const { getMessagingOrNull } = require('./pushFcm');
    console.log('[SMS-BACKEND] FCM (Firebase Admin):', getMessagingOrNull() ? 'ready' : 'not configured');
  } catch {
    /* ignore */
  }
  console.log(
    '[SMS-BACKEND] VietGuys env:',
    JSON.stringify({
      username: !!VIETGUYS_USERNAME,
      refresh_token: !!VIETGUYS_REFRESH_TOKEN,
      passcode_or_access_fallback: !!(VIETGUYS_PASSCODE || VIETGUYS_ACCESS_TOKEN),
      brandname: !!((VIETGUYS_BRANDNAME || '').trim()),
      pid: !!((VIETGUYS_PID || '').trim()),
    }),
  );
  // Tránh OTP request đầu tiên sau restart phải refresh token (≤12s) + gửi SMS (≤9s) trong khi app chỉ chờ ~12s → timeout.
  if (VIETGUYS_USERNAME && VIETGUYS_REFRESH_TOKEN && vietGuysHasSmsCredential()) {
    getVietGuysPwdForSms()
      .then(() => console.log('[SMS-BACKEND] VietGuys access token warm-up OK'))
      .catch((e) =>
        console.warn('[SMS-BACKEND] VietGuys warm-up failed (OTP vẫn chạy, có thể chậm hơn):', e?.message || e),
      );
  }
});
