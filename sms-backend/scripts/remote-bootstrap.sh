#!/usr/bin/env bash
# Chạy TRÊN VPS (hoặc qua SSH) trong thư mục gốc sms-backend sau khi đã có code + .env.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[remote-bootstrap] $(hostname) — $ROOT"

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
  fi
  echo "[ERR] Chưa có .env. Đã tạo từ .env.example nếu có — SSH vào sửa VietGuys + SMS_API_KEY + Supabase rồi chạy lại:" >&2
  echo "  nano $ROOT/.env" >&2
  exit 1
fi

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"

if command -v ufw >/dev/null 2>&1; then
  if [[ "$(id -u)" -eq 0 ]]; then
    ufw allow "${PORT}/tcp" 2>/dev/null || true
    ufw reload 2>/dev/null || true
    echo "[remote-bootstrap] ufw (root): đã allow tcp/$PORT"
  elif sudo -n ufw allow "${PORT}/tcp" 2>/dev/null; then
    sudo -n ufw reload 2>/dev/null || true
    echo "[remote-bootstrap] ufw (sudo -n): đã allow tcp/$PORT"
  else
    echo "[WARN] ufw cần quyền root/sudo. Trên VPS chạy tay:" >&2
    echo "  sudo ufw allow ${PORT}/tcp && sudo ufw reload" >&2
  fi
else
  echo "[remote-bootstrap] Không có ufw (OK nếu chỉ dùng firewall cloud)."
fi

echo "[remote-bootstrap] npm ci …"
npm ci

echo "[remote-bootstrap] PM2 …"
npx --yes pm2@5.4.3 delete zena-sms-backend 2>/dev/null || true
npx --yes pm2@5.4.3 start ecosystem.config.cjs
npx --yes pm2@5.4.3 save 2>/dev/null || true

sleep 1
echo "[remote-bootstrap] GET http://127.0.0.1:${PORT}/health"
if curl -sfS --connect-timeout 5 "http://127.0.0.1:${PORT}/health"; then
  echo ""
  echo "[remote-bootstrap] OK — backend đáp trên localhost."
else
  echo "[ERR] localhost:${PORT} không đáp — xem pm2 logs: npx pm2 logs zena-sms-backend" >&2
  exit 1
fi

echo ""
echo "[remote-bootstrap] Xong. Nếu từ Mac curl http://PUBLIC_IP:${PORT}/health vẫn timeout → mở inbound TCP ${PORT} trên panel cloud (không phải Mac)."
