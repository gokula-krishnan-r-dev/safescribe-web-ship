# SafeScribe Mic (Flutter)

Phone companion for SafeScribe consultations — consent + audio only. No PHI UI.

## Production / staging (live surface)

Today’s live production surface (see `infra/MIC_PRODUCTION_DEPLOY.md`):

| Surface | URL |
|---------|-----|
| Web + Mic QR | https://staging.safescribe.ca |
| API | https://api-staging.safescribe.ca |

Release APKs default to `https://api-staging.safescribe.ca`.

## Run (device / emulator)

```bash
cd apps/safescribe-mic
flutter pub get
flutter run --dart-define=API_URL=https://api-staging.safescribe.ca
```

Local API from a physical phone (use LAN IP, not localhost):

```bash
flutter run --dart-define=API_URL=http://192.168.x.x:3001
```

## Deep links

- HTTPS: `https://staging.safescribe.ca/mic/<pairToken>`
- Custom: `safescribe-mic://pair?token=<pairToken>`

## Icons & splash

```bash
dart run flutter_launcher_icons
dart run flutter_native_splash:create
```

## Release APK (production API)

```bash
./scripts/build-release-apk.sh
# → build/app/outputs/flutter-apk/app-release.apk
# also copied to dist/safescribe-mic-release.apk
```

Or manually:

```bash
flutter build apk --release \
  --dart-define=API_URL=https://api-staging.safescribe.ca
```

Install:

```bash
adb install -r dist/safescribe-mic-release.apk
```

## Signing

Release builds use `android/key.properties` + `android/keystore/*.jks` (gitignored).
If missing, Gradle falls back to the debug keystore so local builds still work.
