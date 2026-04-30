#!/usr/bin/env bash
# Listen 0.0.0.0 (IPv4 mọi interface), không chỉ localhost.
#
# Máy Mac (repo đặt tại Documents):
#   cd /Users/admin/Documents/Zena-massage/sms-backend && chmod +x start.sh && ./start.sh
#
# VPS (ví dụ clone vào home):
#   cd "$HOME/Zena-massage/sms-backend" && chmod +x start.sh && ./start.sh
#
# Hoặc không dùng script:
#   HOST=0.0.0.0 PORT=3000 node server.js

set -euo pipefail
cd "$(dirname "$0")"

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"

if [[ ! -f server.js ]]; then
  echo "Không thấy server.js — chạy lệnh trong thư mục sms-backend (clone repo)." >&2
  exit 1
fi

echo "[sms-backend] HOST=$HOST PORT=$PORT (cần mở firewall TCP $PORT)"
exec node server.js
