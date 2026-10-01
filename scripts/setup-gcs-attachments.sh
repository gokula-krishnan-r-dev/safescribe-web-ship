#!/usr/bin/env bash
# Create a private GCS bucket + service account for consultation photo attachments.
# Usage:
#   ./scripts/setup-gcs-attachments.sh [PROJECT_ID] [BUCKET_NAME] [REGION]
#
# Defaults target the SafeScribe GCP project when available.

set -euo pipefail

PROJECT="${1:-safescribe-488815}"
BUCKET="${2:-safescribe-consult-attachments}"
REGION="${3:-northamerica-northeast1}"
SA_NAME="safescribe-storage"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
KEY_DIR="${HOME}/.config/safescribe"
KEY_FILE="${KEY_DIR}/gcs-sa.json"

echo "Project:  ${PROJECT}"
echo "Bucket:   gs://${BUCKET}"
echo "Region:   ${REGION}"
echo "SA:       ${SA_EMAIL}"

gcloud config set project "${PROJECT}" >/dev/null

if ! gcloud storage buckets describe "gs://${BUCKET}" --project="${PROJECT}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BUCKET}" \
    --project="${PROJECT}" \
    --location="${REGION}" \
    --uniform-bucket-level-access
  gcloud storage buckets update "gs://${BUCKET}" \
    --public-access-prevention \
    --project="${PROJECT}"
  echo "Created bucket gs://${BUCKET}"
else
  echo "Bucket already exists"
fi

if ! gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SA_NAME}" \
    --project="${PROJECT}" \
    --display-name="SafeScribe consultation attachments"
  echo "Created service account ${SA_EMAIL}"
else
  echo "Service account already exists"
fi

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin" \
  --project="${PROJECT}" >/dev/null

mkdir -p "${KEY_DIR}"
chmod 700 "${KEY_DIR}"
if [[ ! -f "${KEY_FILE}" ]]; then
  gcloud iam service-accounts keys create "${KEY_FILE}" \
    --iam-account="${SA_EMAIL}" \
    --project="${PROJECT}"
  chmod 600 "${KEY_FILE}"
  echo "Wrote key to ${KEY_FILE}"
else
  echo "Key already present at ${KEY_FILE}"
fi

cat <<EOF

Add these to your repo-root .env (never commit the key file):

GCS_PROJECT_ID=${PROJECT}
GCS_BUCKET=${BUCKET}
GOOGLE_APPLICATION_CREDENTIALS=${KEY_FILE}

Restart the API after updating .env.
EOF
