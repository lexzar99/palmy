#!/usr/bin/env bash
# Bygg APK för en specifik miljö.
# Usage:  ./scripts/build_apk.sh [production|staging|development]
set -euo pipefail

ENV="${1:-production}"
cd "$(dirname "$0")/.."

case "$ENV" in
  production)
    echo "🚀 Building PRODUCTION APK"
    flutter build apk --release \
      --dart-define=ENV=production
    ;;
  staging)
    echo "🧪 Building STAGING APK"
    flutter build apk --release \
      --dart-define=ENV=staging \
      --dart-define=API_URL=https://palmy-staging.up.railway.app \
      --dart-define=SOCKET_URL=https://palmy-staging.up.railway.app
    ;;
  development|dev)
    echo "🛠  Building DEV APK (pekar på localhost:4000)"
    flutter build apk --debug \
      --dart-define=ENV=development
    ;;
  *)
    echo "Okänd miljö: $ENV. Använd production | staging | development"
    exit 1
    ;;
esac

OUT="build/app/outputs/flutter-apk/app-release.apk"
[ -f "build/app/outputs/flutter-apk/app-debug.apk" ] && OUT="build/app/outputs/flutter-apk/app-debug.apk"
echo "✅ APK klar: $OUT"
