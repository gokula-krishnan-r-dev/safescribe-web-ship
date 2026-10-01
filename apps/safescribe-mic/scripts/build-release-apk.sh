#!/usr/bin/env bash
# Build a signed release APK pointed at the live SafeScribe API.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_URL="${API_URL:-https://api-staging.safescribe.ca}"
OUT_DIR="$ROOT/dist"
mkdir -p "$OUT_DIR"

echo "==> flutter pub get"
flutter pub get

echo "==> launcher icons"
dart run flutter_launcher_icons

echo "==> native splash"
dart run flutter_native_splash:create || true

echo "==> build release APK (API_URL=$API_URL)"
flutter build apk --release --dart-define="API_URL=$API_URL"

APK_SRC="$ROOT/build/app/outputs/flutter-apk/app-release.apk"
APK_DST="$OUT_DIR/safescribe-mic-release.apk"
cp -f "$APK_SRC" "$APK_DST"

echo ""
echo "Release APK ready:"
echo "  $APK_DST"
ls -lh "$APK_DST"
echo ""
echo "Install: adb install -r \"$APK_DST\""
echo "API:     $API_URL"
