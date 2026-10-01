#!/usr/bin/env bash
# Enable Cloud Translation Advanced (v3) on the SafeScribe GCP project and
# grant the existing storage service account least-privilege translate access.
#
# Usage:
#   ./scripts/setup-google-translate.sh [PROJECT_ID] [SA_EMAIL]
#
# Requires: gcloud authenticated as a user who can enable APIs and bind IAM.
# Does not create or print service-account keys.

set -euo pipefail

PROJECT="${1:-safescribe-488815}"
SA_EMAIL="${2:-safescribe-storage@${PROJECT}.iam.gserviceaccount.com}"
API="translate.googleapis.com"
ROLE="roles/cloudtranslate.user"

echo "Project: ${PROJECT}"
echo "API:     ${API}"
echo "SA:      ${SA_EMAIL}"
echo "Role:    ${ROLE}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is not installed. Install the Google Cloud SDK, then retry." >&2
  exit 1
fi

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q .; then
  echo "No active gcloud account. Run: gcloud auth login" >&2
  exit 1
fi

gcloud config set project "${PROJECT}" >/dev/null
gcloud services enable "${API}" --project="${PROJECT}"
echo "Enabled ${API}"

if gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT}" >/dev/null 2>&1; then
  gcloud projects add-iam-policy-binding "${PROJECT}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}" \
    --condition=None \
    --quiet >/dev/null
  echo "Granted ${ROLE} to ${SA_EMAIL}"
else
  echo "Service account ${SA_EMAIL} was not found — skip IAM bind."
  echo "Grant ${ROLE} to the runtime identity that the API uses (Workload Identity or GOOGLE_APPLICATION_CREDENTIALS)."
fi

cat <<EOF

Cloud Translation Advanced v3 is enabled.

Add these to the repo-root .env (reuse the existing GCS service account; never commit the key):

GOOGLE_CLOUD_PROJECT=${PROJECT}
GOOGLE_TRANSLATE_LOCATION=global
GOOGLE_TRANSLATE_MODEL=general/nmt
GOOGLE_TRANSLATE_GLOSSARY_PREFIX=
TRANSLATION_ENABLED=true
TRANSLATION_CACHE_TTL_SECONDS=604800
GOOGLE_TRANSLATE_TIMEOUT_MS=15000

Notes:
  • Default model is general/nmt (not Translation LLM).
  • Location stays global until privacy review picks a region.
  • Glossaries are optional and require a regional location, not global.
    Version-controlled terms: apps/api/src/modules/consultations/handout-glossary/safescribe-medical.en.tsv
  • Restart the API after updating .env.

EOF
