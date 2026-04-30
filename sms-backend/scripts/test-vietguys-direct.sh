#!/usr/bin/env bash
# Test VietGuys CSKH API trực tiếp, lấy thông tin từ sms-backend/.env (giống server.js).
# Usage:
#   ./scripts/test-vietguys-direct.sh [phone_without_plus]
# Ví dụ:
#   ./scripts/test-vietguys-direct.sh 84971234567
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Không thấy $ENV_FILE — copy từ .env.example và điền VIETGUYS_*."
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

SMS_PW="${VIETGUYS_PASSCODE:-${VIETGUYS_ACCESS_TOKEN:-}}"
URL="${VIETGUYS_CSKH_URL:-https://cloudsms4.vietguys.biz:4438/api/index.php}"
FROM="${VIETGUYS_BRANDNAME:-}"
USER="${VIETGUYS_USERNAME:-}"
PHONE="${1:-84901234567}"
BID="manual-$(date +%s)"
OTP_SAMPLE="${MANUAL_OTP:-123456}"

if [[ -z "$USER" || -z "$SMS_PW" || -z "$FROM" ]]; then
  echo "Thiếu VIETGUYS_USERNAME hoặc (VIETGUYS_PASSCODE / VIETGUYS_ACCESS_TOKEN) hoặc VIETGUYS_BRANDNAME trong .env."
  exit 1
fi

SMS_BODY="Ma OTP Zena cua ban la ${OTP_SAMPLE}"

args=(
  --location --request POST "$URL"
  --form "from=${FROM}"
  --form "u=${USER}"
  --form "pwd=${SMS_PW}"
  --form "phone=${PHONE}"
  --form "sms=${SMS_BODY}"
  --form "bid=${BID}"
  --form 'type=0'
  --form 'json=1'
)

if [[ -n "${VIETGUYS_PID:-}" ]]; then
  args+=(--form "pid=${VIETGUYS_PID}")
fi

echo "# POST $URL"
echo "# phone=${PHONE} bid=${BID}"
curl -sS "${args[@]}"
echo
