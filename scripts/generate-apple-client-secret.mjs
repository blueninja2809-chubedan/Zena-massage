/**
 * Tạo Apple "client secret" (JWT) cho Supabase Auth → Provider Apple.
 *
 * Chạy (đổi giá trị cho đúng tài khoản của bạn):
 *
 *   APPLE_TEAM_ID=VN8Z43439T \
 *   APPLE_SERVICE_ID=com.zena.massagenow.supabase \
 *   APPLE_KEY_ID=LBUK26YGYX \
 *   APPLE_KEY_PATH=./AuthKey_LBUK26YGYX.p8 \
 *   node scripts/generate-apple-client-secret.mjs
 *
 * Dán JWT in ra vào ô "Secret Key" trên Supabase. JWT hết hạn theo `exp` (khoảng 150 ngày) — cần tạo lại định kỳ.
 */
import { createSign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlRaw(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const teamId = process.env.APPLE_TEAM_ID?.trim();
const serviceId = process.env.APPLE_SERVICE_ID?.trim();
const keyId = process.env.APPLE_KEY_ID?.trim();
const keyPath = process.env.APPLE_KEY_PATH?.trim() || './AuthKey.p8';

if (!teamId || !serviceId || !keyId) {
  console.error(
    'Thiếu biến môi trường. Cần: APPLE_TEAM_ID, APPLE_SERVICE_ID, APPLE_KEY_ID (tùy chọn: APPLE_KEY_PATH)',
  );
  process.exit(1);
}

const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);
if (!fs.existsSync(resolved)) {
  console.error(`Không tìm thấy file key: ${resolved}`);
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(resolved, 'utf8').trim();
if (!privateKeyPem.includes('BEGIN PRIVATE KEY')) {
  console.error('File .p8 phải là PEM (-----BEGIN PRIVATE KEY-----).');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const exp = now + 86400 * 150; // dưới 6 tháng

const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
const payload = {
  iss: teamId,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: serviceId,
};

const encodedHeader = b64urlJson(header);
const encodedPayload = b64urlJson(payload);
const signingInput = `${encodedHeader}.${encodedPayload}`;

const sign = createSign('SHA256');
sign.end(signingInput);

let signature;
try {
  signature = sign.sign({
    key: privateKeyPem,
    dsaEncoding: 'ieee-p1363',
  });
} catch (e) {
  console.error(
    'Ký ES256 thất bại. Kiểm tra file .p8 còn nguyên (không sửa bằng TextEdit), Key ID trùng tên file AuthKey_<KEYID>.p8.',
  );
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

console.log(`${signingInput}.${b64urlRaw(signature)}`);
