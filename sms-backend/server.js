const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const twilio = require('twilio');
const crypto = require('crypto');
const https = require('https');
const dns = require('dns');
require('dotenv').config();

const app = express();

const PORT = Number(process.env.PORT || 3000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const SMS_API_KEY = process.env.SMS_API_KEY || '';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID || '';

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
  console.warn('[WARN] Missing Twilio env vars. OTP endpoints will fail until configured.');
}

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

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

    await twilioClient.verify.v2
      .services(TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: phoneNumber, channel: 'sms' });

    return res.json({
      success: true,
      message: 'OTP sent successfully',
    });
  } catch (error) {
    const code = error?.code ? String(error.code) : 'send-otp-failed';
    const detail = error?.message ? String(error.message) : 'Unknown error';
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
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

    const verificationCheck = await twilioClient.verify.v2
      .services(TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phoneNumber, code: otp });

    if (verificationCheck.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'OTP is invalid or expired',
        error: `otp-not-approved:${verificationCheck.status}`,
      });
    }

    return res.json({
      success: true,
      message: 'OTP verified successfully',
    });
  } catch (error) {
    const code = error?.code ? String(error.code) : 'verify-otp-failed';
    const detail = error?.message ? String(error.message) : 'Unknown error';
    return res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
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

      // Look up the payment to get userId from buyerName
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

app.listen(PORT, () => {
  console.log(`[SMS-BACKEND] Running at http://localhost:${PORT}`);
});
