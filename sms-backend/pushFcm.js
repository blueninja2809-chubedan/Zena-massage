'use strict';

/**
 * FCM (Firebase Cloud Messaging) qua Firebase Admin — thay cho Expo Push API.
 * App lưu token thiết bị gốc vào profiles.push_token (Android: FCM; iOS: FCM khi đã cấu hình Firebase + APNs).
 */

const fs = require('fs');
const path = require('path');

/** Lazy load — OTP backend vẫn chạy nếu chưa cài firebase-admin (Hostinger zip thiếu dep). */
let admin = null;
try {
  // eslint-disable-next-line global-require
  admin = require('firebase-admin');
} catch (e) {
  console.warn(
    '[FCM] firebase-admin chưa cài — route /api/push/fcm tắt. Chạy: npm install firebase-admin',
  );
}

let messagingSingleton = null;

function loadServiceAccountJson() {
  const b64 = (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim();
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const relPath = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  try {
    if (b64) {
      return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    }
    if (raw) {
      return JSON.parse(raw);
    }
    if (relPath) {
      const abs = path.isAbsolute(relPath) ? relPath : path.join(__dirname, relPath);
      return JSON.parse(fs.readFileSync(abs, 'utf8'));
    }
  } catch (e) {
    console.warn('[FCM] Failed to parse Firebase service account:', e?.message || e);
  }
  return null;
}

function getMessagingOrNull() {
  if (!admin) {
    return null;
  }
  if (messagingSingleton) {
    return messagingSingleton;
  }
  const json = loadServiceAccountJson();
  if (!json || !json.client_email || !json.private_key) {
    return null;
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(json),
    });
  }
  messagingSingleton = admin.messaging();
  return messagingSingleton;
}

function fcmChannelIdFromData(data) {
  const t = data && data.type;
  if (t === 'booking' || t === 'job' || t === 'review') {
    return 'booking';
  }
  if (t === 'promotion') {
    return 'promotion';
  }
  return 'default';
}

/** FCM data payload: all values must be strings. */
function stringifyData(data) {
  const out = {};
  if (!data || typeof data !== 'object') {
    return out;
  }
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) {
      continue;
    }
    out[String(k)] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

async function supabaseSelectPushTokens(supabaseUrl, serviceKey, userIds) {
  if (!supabaseUrl || !serviceKey || !userIds.length) {
    return [];
  }
  const unique = [...new Set(userIds.map(String).filter(Boolean))];
  const rows = [];
  const chunkSize = 80;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const slice = unique.slice(i, i + chunkSize);
    const inList = slice.join(',');
    const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/profiles?select=id,push_token&id=in.(${inList})`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[FCM] Supabase profiles fetch failed:', res.status, text.slice(0, 300));
      continue;
    }
    const batch = await res.json();
    if (Array.isArray(batch)) {
      rows.push(...batch);
    }
  }
  return rows;
}

function isLikelyExpoPushToken(token) {
  return typeof token === 'string' && token.startsWith('ExponentPushToken');
}

/**
 * @param {import('express').Express} app
 * @param {{ supabaseUrl: string; serviceKey: string; requireApiKey: import('express').RequestHandler }} opts
 */
function registerPushFcmRoute(app, opts) {
  const { supabaseUrl, serviceKey, requireApiKey } = opts;

  app.post('/api/push/fcm', requireApiKey, async (req, res) => {
    try {
      const fcm = getMessagingOrNull();
      if (!fcm) {
        return res.status(503).json({
          success: false,
          error: 'fcm-not-configured',
          message:
            'Set FIREBASE_SERVICE_ACCOUNT_BASE64 (or FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT_PATH) on the server.',
        });
      }

      const title = String(req.body?.title ?? '').trim();
      const bodyText = String(req.body?.body ?? '').trim();
      const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};
      const userId = req.body?.userId != null ? String(req.body.userId).trim() : '';
      const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds.map((x) => String(x).trim()).filter(Boolean) : [];

      if (!title || !bodyText) {
        return res.status(400).json({ success: false, error: 'missing-title-body' });
      }

      const targets = userIds.length ? userIds : userId ? [userId] : [];
      if (!targets.length) {
        return res.status(400).json({ success: false, error: 'missing-userid-or-userids' });
      }

      const profiles = await supabaseSelectPushTokens(supabaseUrl, serviceKey, targets);
      const tokens = profiles
        .map((p) => p.push_token)
        .filter((t) => typeof t === 'string' && t.length > 0 && !isLikelyExpoPushToken(t));

      if (!tokens.length) {
        return res.json({ success: true, sent: 0, skipped: profiles.length, message: 'no-native-tokens' });
      }

      const channelId = fcmChannelIdFromData(data);
      const dataStrings = stringifyData(data);

      let sent = 0;
      let failed = 0;
      const errors = [];

      for (const token of tokens) {
        try {
          await fcm.send({
            token,
            notification: { title, body: bodyText },
            data: dataStrings,
            android: {
              priority: 'high',
              notification: {
                channelId,
                sound: 'default',
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  'content-available': 1,
                },
              },
            },
          });
          sent += 1;
        } catch (err) {
          failed += 1;
          const code = err?.errorInfo?.code || err?.code || '';
          errors.push(String(code || err?.message || err).slice(0, 120));
        }
      }

      return res.json({
        success: true,
        sent,
        failed,
        skippedExpoTokens: profiles.filter((p) => isLikelyExpoPushToken(p.push_token)).length,
        errors: errors.slice(0, 5),
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: e?.message ? String(e.message) : String(e),
      });
    }
  });
}

module.exports = { registerPushFcmRoute, getMessagingOrNull };
