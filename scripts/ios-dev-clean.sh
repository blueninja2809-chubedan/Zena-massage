#!/usr/bin/env bash
# Clean JS/Expo caches + native iOS build folder, then rebuild dev client (scheme Zena).
# Ensures CocoaPods from `gem install --user-install` is on PATH (no Homebrew required).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GEM_USER_BIN="$(ruby -r rubygems -e 'puts File.join(Gem.user_dir, "bin")')"
export PATH="${GEM_USER_BIN}:/opt/homebrew/bin:/usr/local/bin:${PATH}"
# CocoaPods / ActiveSupport trên Ruby 2.6: cần require logger trước ActiveSupport
export RUBYOPT="-rlogger"

if ! command -v pod >/dev/null 2>&1; then
  echo "Không tìm thấy lệnh 'pod' (CocoaPods)."
  echo "Cài CocoaPods (user gem) rồi thử lại:"
  echo "  gem install cocoapods --user-install --no-document"
  echo "  export PATH=\"\$(ruby -r rubygems -e 'puts File.join(Gem.user_dir, \\\"bin\\\")'):\\\$PATH\""
  echo "  export RUBYOPT=-rlogger   # nếu Ruby 2.6 và lỗi Logger/ActiveSupport"
  exit 1
fi

echo "Using pod: $(command -v pod) ($(pod --version))"
# KHÔNG xóa ios/build: RN 0.83 để codegen ở đó — xóa sẽ gãy ReactCodegen ("Build input file cannot be found").
rm -rf .expo node_modules/.cache/metro node_modules/.cache/babel-loader

if [[ -f ios/Zena.xcworkspace/contents.xcworkspacedata ]]; then
  echo "Xcode clean (giữ codegen trong build)…"
  (cd ios && xcodebuild -workspace Zena.xcworkspace -scheme Zena -configuration Debug -sdk iphonesimulator clean) || true
fi

exec npx expo run:ios --no-build-cache --scheme Zena "$@"
