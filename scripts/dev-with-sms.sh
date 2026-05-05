#!/usr/bin/env bash
# Chạy sms-backend + Expo dev client. Backend lắng nghe 0.0.0.0 (xem sms-backend/start.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SMS_PID=""
cleanup() {
  if [[ -n "${SMS_PID:-}" ]] && kill -0 "$SMS_PID" 2>/dev/null; then
    kill "$SMS_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ ! -f "$ROOT/sms-backend/server.js" ]]; then
  echo "Không thấy sms-backend/server.js" >&2
  exit 1
fi

echo "[dev-with-sms] Đang khởi động sms-backend..."
bash "$ROOT/sms-backend/start.sh" &
SMS_PID=$!
sleep 1

if [[ -f "$ROOT/.env" ]] && grep -qE '127\.0\.0\.1:3000|localhost:3000' "$ROOT/.env" 2>/dev/null; then
  LAN_IP=""
  if command -v ipconfig >/dev/null 2>&1; then
    LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  fi
  echo ""
  echo "⚠️  EXPO_PUBLIC_SMS_API_BASE_URL đang là localhost — máy thật / Wi‑Fi sẽ KHÔNG kết nối được OTP backend."
  if [[ -n "${LAN_IP}" ]]; then
    echo "   → Đổi trong .env thành: EXPO_PUBLIC_SMS_API_BASE_URL=http://${LAN_IP}:3000"
    echo "   → Rồi tắt Expo và chạy lại (Metro cần đọc lại biến môi trường)."
  else
    echo "   → Hoặc dùng URL public VPS: http://IP_VPS:3000 (VietGuys whitelist IP VPS)."
  fi
  echo ""
fi

exec npx expo start --dev-client
