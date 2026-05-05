#!/usr/bin/env bash
# Khi gặp: build.db locked / Possibly there are two concurrent builds
# → tắt xcodebuild cũ, xoá DerivedData của Zena, build lại (lần này sẽ biên dịch lại từ index — tránh chồng tiến trình).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[ios] Dừng xcodebuild cũ (nếu có)..."
pkill -x xcodebuild 2>/dev/null || true
sleep 2

echo "[ios] Xóa DerivedData của Zena (unlock build.db)..."
rm -rf "${HOME:?}/Library/Developer/Xcode/DerivedData/Zena-"* 2>/dev/null || true

export PATH="$(ruby -r rubygems -e 'print File.join(Gem.user_dir, %q{bin})'):${PATH}"
export RUBYOPT=-rlogger

echo "[ios] Chạy expo run:ios..."
exec npx expo run:ios "$@"
