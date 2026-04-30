#!/usr/bin/env bash
# Từ Mac (repo đã clone): rsync sms-backend lên VPS + SSH chạy remote-bootstrap.sh
#
# Một lần (đường dẫn VPS phải TUYỆT ĐỐI, ví dụ user root):
#   export SMS_VPS_SSH='root@116.96.46.159'
#   export SMS_VPS_PATH='/root/zena-sms-backend'
#   cd .../Zena-massage/sms-backend && bash scripts/deploy-from-mac.sh
#
# Lần đầu: tạo .env trên VPS (nano) HOẶC một lần đẩy .env từ máy (cẩn thận):
#   COPY_ENV=1 bash scripts/deploy-from-mac.sh
#
# Cần: ssh-copy-id đã cấu hình (đăng nhập SSH không hỏi mật khẩu), hoặc ssh-agent.

set -euo pipefail

SMS_VPS_SSH="${SMS_VPS_SSH:?Thiếu SMS_VPS_SSH (vd: root@116.96.46.159)}"
SMS_VPS_PATH="${SMS_VPS_PATH:?Thiếu SMS_VPS_PATH — đường dẫn TUYỆT ĐỐI trên VPS (vd: /root/zena-sms-backend)}"

if [[ "$SMS_VPS_PATH" != /* ]]; then
  echo "SMS_VPS_PATH phải bắt đầu bằng / (đường dẫn tuyệt đối trên VPS)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SMS_ROOT"

EXCLUDE_ENV=(--exclude '.env')
if [[ "${COPY_ENV:-0}" == "1" ]]; then
  EXCLUDE_ENV=()
  echo "[deploy-from-mac] COPY_ENV=1 — sẽ rsync cả .env (chỉ dùng khi tin VPS của bạn)."
fi

echo "→ mkdir + rsync → $SMS_VPS_SSH:$SMS_VPS_PATH"
ssh -o BatchMode=yes -o ConnectTimeout=15 "$SMS_VPS_SSH" "mkdir -p '$SMS_VPS_PATH'"

rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  "${EXCLUDE_ENV[@]}" \
  ./ "$SMS_VPS_SSH:$SMS_VPS_PATH/"

echo "→ remote-bootstrap trên VPS…"
ssh -o BatchMode=yes -o ConnectTimeout=30 "$SMS_VPS_SSH" "cd '$SMS_VPS_PATH' && chmod +x scripts/remote-bootstrap.sh scripts/smoke-health.sh && bash scripts/remote-bootstrap.sh"

echo ""
echo "→ Kiểm tra từ Mac (phải không timeout sau khi cloud mở cổng):"
HOST_ONLY="${SMS_VPS_SSH#*@}"
bash "$SCRIPT_DIR/smoke-health.sh" "http://${HOST_ONLY}:3000" || true
