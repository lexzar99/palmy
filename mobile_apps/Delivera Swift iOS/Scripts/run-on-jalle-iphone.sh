#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVICE_ID="${DEVICE_ID:-0C1A989B-5685-5B80-A264-3DBCC36A7A8C}"
BUNDLE_ID="${BUNDLE_ID:-se.delivera.swift}"

cd "$ROOT"

xcodebuild -quiet \
  -project "DeliveraSwift.xcodeproj" \
  -scheme DeliveraSwift \
  -configuration Debug \
  -destination "id=${DEVICE_ID}" \
  build

APP_PATH="$(find "$HOME/Library/Developer/Xcode/DerivedData" -path "*/Build/Products/Debug-iphoneos/DeliveraSwift.app" -type d | tail -1)"

xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH"
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID"
