#!/usr/bin/env node
/**
 * Đọc VIETGUYS_* từ sms-backend/.env, gọi POST token/v1/refresh, in access_token (và refresh_token mới nếu có).
 * Chạy: cd sms-backend && node scripts/print-vietguys-access-token.js
 */
const https = require('https');
const dns = require('dns');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axios = require('axios');

const agent = new https.Agent({
  lookup: (hostname, opts, cb) => dns.lookup(hostname, { ...opts, family: 4 }, cb),
});

const TOKEN_URL =
  process.env.VIETGUYS_TOKEN_URL || 'https://api-v2.vietguys.biz:4438/token/v1/refresh';
const USERNAME = (process.env.VIETGUYS_USERNAME || '').trim();
const REFRESH = (process.env.VIETGUYS_REFRESH_TOKEN || '').trim();

async function main() {
  if (!REFRESH || !USERNAME) {
    console.error('Thiếu VIETGUYS_REFRESH_TOKEN hoặc VIETGUYS_USERNAME trong sms-backend/.env');
    process.exit(1);
  }
  const body = JSON.stringify({ username: USERNAME, type: 'refresh_token' });
  const response = await axios.request({
    method: 'post',
    url: TOKEN_URL,
    headers: {
      'Content-Type': 'application/json',
      'Refresh-Token': REFRESH,
    },
    data: body,
    timeout: 15000,
    httpsAgent: agent,
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
  const newRefresh =
    data?.data?.refresh_token != null ? String(data.data.refresh_token) : data?.refresh_token;

  if (!data || !errOk || typeof accessTok !== 'string' || !accessTok.trim()) {
    console.error('Refresh thất bại. HTTP', response.status);
    console.error(JSON.stringify(data ?? response.data, null, 2));
    process.exit(1);
  }

  const exp = data.data?.expired_at ?? data.expired_at;
  const out = {
    access_token: accessTok.trim(),
    ...(newRefresh ? { refresh_token: String(newRefresh) } : {}),
    expired_at: exp,
  };
  console.log(JSON.stringify(out, null, 2));
  console.error(
    '\n→ access_token: có thể đặt vào VIETGUYS_PASSCODE (dự phòng). refresh_token mới (nếu có): cập nhật VIETGUYS_REFRESH_TOKEN.',
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
