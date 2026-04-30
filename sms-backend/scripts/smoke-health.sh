#!/usr/bin/env bash
# Gọi GET /health tới backend SMS (để đo được / không được tới server).
#
# Trên VPS (SSH): chứng minh Node đã chạy
#   ./scripts/smoke-health.sh http://127.0.0.1:3000
#
# Trên máy dev / máy khác internet: chứng minh có mở firewall / security group không
#   ./scripts/smoke-health.sh http://116.96.46.159:3000

set -euo pipefail
BASE="${1:-http://127.0.0.1:3000}"
BASE="${BASE%/}"
echo "→ GET ${BASE}/health"
if curl -sfS --connect-timeout "${SMOKE_CONNECT_TIMEOUT:-8}" "${BASE}/health"; then
  echo ""
  echo "OK — backend đáp được tại đường dẫn này."
  exit 0
fi

echo >&2 ""
echo >&2 "FAIL — không có HTTP đáp. Thường gặp:"
echo >&2 "  • Trên VPS: chạy sms-backend với HOST=0.0.0.0 (start.sh hoặc npm run pm2:start)."
echo >&2 "  • Firewall VPS: sudo ufw allow 3000/tcp && sudo ufw reload"
echo >&2 "  • Provider (AWS/Vultr/DO...): nhóm bảo mật ingress TCP 3000 (hoặc 80/443 nếu có reverse proxy)."
echo >&2 "  • App EXPO_PUBLIC_SMS_API_BASE_URL phải trùng host:port của server đang MỞ được từ ngoài."
exit 1
