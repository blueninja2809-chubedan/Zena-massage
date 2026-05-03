const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const https = require('https');
const dns = require('dns');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

// Luôn load .env cạnh server.js — tránh PASSCODE trống khi chạy node từ cwd khác (home vs công ty).
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

const PORT = Number(process.env.PORT || 3000);
/** Listen address — must be 0.0.0.0 on VPS so phones reach OTP/PayOS (not only localhost). */
const HOST = (process.env.HOST ?? '0.0.0.0').trim() || '0.0.0.0';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const SMS_API_KEY = process.env.SMS_API_KEY || '';
const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 5 * 60 * 1000);
const OTP_DEV_FALLBACK_ON_SEND_FAIL = process.env.OTP_DEV_FALLBACK_ON_SEND_FAIL === '1';
/** Set to 1 to log each VietGuys-bound request (pwd / token values are redacted). */
const VIETGUYS_DEBUG_LOG = process.env.VIETGUYS_DEBUG_LOG === '1';
const OTP_LENGTH = 6;
const otpStore = new Map();

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

// ── PayOS configuration ──
const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID || '';
const PAYOS_API_KEY = process.env.PAYOS_API_KEY || '';
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY || '';
const PAYOS_BASE_URL = 'https://api-merchant.payos.vn';

// PayOS Cloudflare has broken IPv6 TLS – force IPv4 via custom https.Agent
const payosAgent = new https.Agent({
  lookup: (hostname, opts, cb) => dns.lookup(hostname, { ...opts, family: 4 }, cb),
});

/**
 * Wrapper around fetch that forces IPv4 for PayOS API calls.
 * Node.js v24 defaults to IPv6 which causes TLS ECONNRESET with PayOS Cloudflare.
 */
async function payosFetch(url, options = {}) {
  // Node.js v24 defaults to IPv6; PayOS Cloudflare has broken IPv6 TLS.
  // We use https.request with a custom agent that forces IPv4.
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const bodyStr = options.body || null;
    const reqOpts = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      agent: payosAgent,
      headers: { ...(options.headers || {}) },
    };
    if (bodyStr) reqOpts.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(reqOpts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data),
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('PayOS request timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Supabase config (for updating wallet after PayOS webhook)
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
  console.warn('[WARN] Missing PayOS env vars (PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY). PayOS endpoints will fail.');
}

function payosSignature(data, checksumKey) {
  const sortedKeys = Object.keys(data).sort();
  const raw = sortedKeys.map((k) => `${k}=${data[k]}`).join('&');
  return crypto.createHmac('sha256', checksumKey).update(raw).digest('hex');
}

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

async function supabaseRestInsert(table, row) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  return res.ok;
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

// ── PayOS: Create payment link (QR code) ──
app.post('/api/payos/create-payment', requireApiKey, async (req, res) => {
  try {
    const { userId, amount, description } = req.body || {};
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'userId and positive amount required' });
    }

    const orderCode = Math.floor(Date.now() / 1000); // unique order code (PayOS requires < 2^53)
    const returnUrl = req.body.returnUrl || 'https://massage-now.app/payment-success';
    const cancelUrl = req.body.cancelUrl || 'https://massage-now.app/payment-cancel';

    // PayOS description: ASCII only, max 25 chars
    const desc = (description || `Nap tien ${Number(amount).toLocaleString('vi-VN')}d`).substring(0, 25);

    const paymentData = {
      orderCode,
      amount: Number(amount),
      description: desc,
      returnUrl,
      cancelUrl,
      buyerName: userId,
    };

    // Create checksum signature
    const signData = {
      amount: paymentData.amount,
      cancelUrl: paymentData.cancelUrl,
      description: paymentData.description,
      orderCode: paymentData.orderCode,
      returnUrl: paymentData.returnUrl,
    };
    const signature = payosSignature(signData, PAYOS_CHECKSUM_KEY);
    paymentData.signature = signature;

    console.log('[PayOS] Creating payment:', { orderCode: paymentData.orderCode, amount: paymentData.amount, description: paymentData.description });
    console.log('[PayOS] Using client_id:', PAYOS_CLIENT_ID ? PAYOS_CLIENT_ID.substring(0, 8) + '...' : 'MISSING');

    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await payosFetch(`${PAYOS_BASE_URL}/v2/payment-requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': PAYOS_CLIENT_ID,
            'x-api-key': PAYOS_API_KEY,
          },
          body: JSON.stringify(paymentData),
        });
        break; // success, exit retry loop
      } catch (fetchErr) {
        console.warn(`[PayOS] Fetch attempt ${attempt}/3 failed:`, fetchErr.message);
        if (attempt === 3) throw fetchErr;
        await new Promise((r) => setTimeout(r, 1000 * attempt)); // backoff
      }
    }

    const result = await response.json();

    if (result.code !== '00' || !result.data) {
      console.error('[PayOS] Create payment failed:', result);
      return res.status(400).json({
        success: false,
        message: result.desc || 'Failed to create PayOS payment',
        error: result,
      });
    }

    const bookingId = typeof req.body.bookingId === 'string' ? req.body.bookingId.trim() : '';
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (bookingId && uuidRe.test(bookingId)) {
      const inserted = await supabaseRestInsert('payos_booking_orders', {
        order_code: result.data.orderCode,
        booking_id: bookingId,
        user_id: userId,
        amount: Number(amount),
      });
      if (!inserted) {
        console.error('[PayOS] Failed to register booking order in Supabase');
        return res.status(500).json({
          success: false,
          message: 'Failed to register booking payment',
        });
      }
    }

    return res.json({
      success: true,
      data: {
        orderCode: result.data.orderCode,
        checkoutUrl: result.data.checkoutUrl,
        qrCode: result.data.qrCode,
        amount: result.data.amount,
      },
    });
  } catch (error) {
    console.error('[PayOS] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create payment',
      error: String(error.message || error),
    });
  }
});

// ── PayOS: Check payment status ──
app.get('/api/payos/payment-status/:orderCode', requireApiKey, async (req, res) => {
  try {
    const { orderCode } = req.params;
    const response = await payosFetch(`${PAYOS_BASE_URL}/v2/payment-requests/${orderCode}`, {
      method: 'GET',
      headers: {
        'x-client-id': PAYOS_CLIENT_ID,
        'x-api-key': PAYOS_API_KEY,
      },
    });

    const result = await response.json();

    if (result.code !== '00') {
      return res.status(400).json({
        success: false,
        message: result.desc || 'Failed to check payment status',
      });
    }

    return res.json({
      success: true,
      data: {
        orderCode: result.data.orderCode,
        status: result.data.status, // PENDING, PAID, CANCELLED, EXPIRED
        amount: result.data.amount,
        amountPaid: result.data.amountPaid,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to check payment status',
      error: String(error.message || error),
    });
  }
});

// ── PayOS: Webhook (automatic payment confirmation) ──
app.post('/api/payos/webhook', async (req, res) => {
  try {
    const webhookData = req.body;

    // Verify webhook signature
    if (webhookData.data && webhookData.signature) {
      const computedSig = payosSignature(webhookData.data, PAYOS_CHECKSUM_KEY);
      if (computedSig !== webhookData.signature) {
        console.warn('[PayOS Webhook] Invalid signature');
        return res.status(400).json({ success: false, message: 'Invalid signature' });
      }
    }

    const data = webhookData.data || {};
    const { orderCode, amount, description } = data;

    // success = true means payment completed
    if (webhookData.success && data.orderCode) {
      console.log(`[PayOS Webhook] Payment ${orderCode} completed: ${amount} VND`);

      // Service booking via payos_booking_orders — confirm booking, do NOT credit wallet
      if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
        try {
          const bookingRpc = await supabaseRpc('complete_payos_booking_from_webhook', {
            p_order_code: Number(orderCode),
          });
          if (bookingRpc && bookingRpc.ok === true) {
            console.log(`[PayOS Webhook] Service booking confirmed for order ${orderCode}`);
            return res.json({ success: true });
          }
        } catch (err) {
          console.warn('[PayOS Webhook] Booking completion RPC failed:', err.message);
        }
      }

      // Wallet top-up (top-up flow only — not linked to payos_booking_orders)
      try {
        const paymentResp = await payosFetch(`${PAYOS_BASE_URL}/v2/payment-requests/${orderCode}`, {
          method: 'GET',
          headers: {
            'x-client-id': PAYOS_CLIENT_ID,
            'x-api-key': PAYOS_API_KEY,
          },
        });
        const paymentResult = await paymentResp.json();

        if (paymentResult.code === '00' && paymentResult.data) {
          const userId = paymentResult.data.buyerName; // we stored userId here
          if (userId && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
            await supabaseRpc('wallet_topup', {
              p_user_id: userId,
              p_amount: Number(amount),
              p_method: 'payos',
            });
            console.log(`[PayOS Webhook] Wallet topped up for user ${userId}: +${amount}`);
          }
        }
      } catch (err) {
        console.error('[PayOS Webhook] Failed to process wallet top-up:', err.message);
      }
    }

    // Always respond 200 to acknowledge webhook
    return res.json({ success: true });
  } catch (error) {
    console.error('[PayOS Webhook] Error:', error);
    return res.json({ success: true }); // still 200 to prevent retries
  }
});

app.listen(PORT, HOST, () => {
  console.log(
    `[SMS-BACKEND] Listening http://${HOST}:${PORT}/health — firewall/security group must allow inbound TCP ${PORT}`,
  );
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
});
