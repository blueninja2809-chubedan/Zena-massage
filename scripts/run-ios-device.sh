#!/usr/bin/env bash
# Build and install the dev client on the first connected physical iPhone/iPad (USB).
#
# Prerequisites (one-time on your Mac):
#   - Xcode + Apple ID with access to team VN8Z43439T (or change DEVELOPMENT_TEAM in ios/Zena.xcodeproj).
#   - CocoaPods: gem install cocoapods --user-install   OR   brew install cocoapods
#   - Ruby 2.6 (system): export RUBYOPT=-rlogger before pod/cocoapods 1.16+ (see below).
#   - Register the device: open ios/Zena.xcworkspace in Xcode, select the Zena target, plug in the
#     phone, wait until Xcode offers "Register Device" / signing succeeds once.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# CocoaPods 1.16 + ActiveSupport on Ruby 2.6 needs Logger loaded first.
export RUBYOPT="-rlogger"
export PATH="${HOME}/.gem/ruby/2.6.0/bin:${HOME}/.gem/ruby/3.2.0/bin:${HOME}/.gem/ruby/3.3.0/bin:/opt/homebrew/bin:/usr/local/bin:${PATH}"

if ! command -v pod >/dev/null 2>&1; then
  echo "CocoaPods (pod) not found. Install with: gem install cocoapods --user-install"
  exit 1
fi

echo "==> pod install"
(cd ios && pod install)

UDID="$(
  xcrun xcdevice list 2>/dev/null | python3 -c "
import sys, json
try:
  data = json.load(sys.stdin)
except Exception:
  sys.exit(1)
for d in data:
  if d.get('simulator'):
    continue
  if d.get('platform') == 'com.apple.platform.iphoneos' and d.get('available'):
    print(d['identifier'])
    sys.exit(0)
sys.exit(1)
" || true
)"

if [[ -z "${UDID}" ]]; then
  echo "No connected physical iOS device found. Unlock the iPhone and trust this Mac (USB)."
  exit 1
fi

echo "==> Building for device UDID: ${UDID}"
exec npx expo run:ios --device "${UDID}" --no-install
