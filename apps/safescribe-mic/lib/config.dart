/// Runtime / build-time configuration for SafeScribe Mic.
///
/// Override at build time:
///   flutter build apk --dart-define=API_URL=https://api-staging.safescribe.ca
///
/// Live production surface today is the staging cluster
/// (see infra/MIC_PRODUCTION_DEPLOY.md).
library;

const kAppName = 'SafeScribe Mic';
const kAppVersionLabel = '1.0.1';

/// Default API base — production/staging live surface.
const kApiBase = String.fromEnvironment(
  'API_URL',
  defaultValue: 'https://api-staging.safescribe.ca',
);

/// Brand teal used across UI + Android theme.
const kBrandTealValue = 0xFF0F766E;

/// Consent notice version — must match server expectations.
const kConsentNotice = 'mic-consent-v1.0';

/// HTTP timeouts for production networks.
const kHttpTimeout = Duration(seconds: 30);
const kUploadTimeout = Duration(seconds: 90);
const kHeartbeatInterval = Duration(seconds: 15);
const kPartRotateInterval = Duration(seconds: 5);

bool get kIsProdApi =>
    kApiBase.startsWith('https://') && !kApiBase.contains('localhost');
