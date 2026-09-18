#!/usr/bin/env bash
# Costruisce release/MySapienza.ipa per AltStore/Sideloadly.
# Non firmato di proposito: è AltStore a firmarlo col tuo Apple ID.
set -euo pipefail
cd "$(dirname "$0")/../ios/App"
rm -rf build-ipa
xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphoneos \
  -destination "generic/platform=iOS" -derivedDataPath build-ipa -quiet \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" 2>&1 \
  | grep -E "error" || true
APP=build-ipa/Build/Products/Release-iphoneos/App.app
[ -d "$APP" ] || { echo "build fallita"; exit 1; }
rm -rf build-ipa/Payload && mkdir -p build-ipa/Payload ../../release
cp -R "$APP" build-ipa/Payload/MySapienza.app
rm -f ../../release/MySapienza.ipa
(cd build-ipa && zip -qr ../../../release/MySapienza.ipa Payload)
echo "pronto: release/MySapienza.ipa ($(du -h ../../release/MySapienza.ipa | cut -f1))"
