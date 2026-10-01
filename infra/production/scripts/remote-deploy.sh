#!/usr/bin/env bash
# Sync monorepo to production VM and deploy changed services.
# Usage:
#   PROD_HOST=<ip> PROD_USER=ubuntu \
#   DEPLOY_KEY=infra/production/secrets/deploy_key \
#   ./infra/production/scripts/remote-deploy.sh [--api] [--ai] [--all]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HOST="${PROD_HOST:?Set PROD_HOST}"
USER="${PROD_USER:-ubuntu}"
KEY="${DEPLOY_KEY:-$ROOT/infra/production/secrets/deploy_key}"
REMOTE_DIR="/opt/safescribe"
DEPLOY_API=0
DEPLOY_AI=0

for arg in "$@"; do
  case "$arg" in
    --api) DEPLOY_API=1 ;;
    --ai) DEPLOY_AI=1 ;;
    --all) DEPLOY_API=1; DEPLOY_AI=1 ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

if [[ "$DEPLOY_API" -eq 0 && "$DEPLOY_AI" -eq 0 ]]; then
  DEPLOY_API=1
  DEPLOY_AI=1
fi

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=12 "${USER}@${HOST}")
RSYNC=(rsync -az --delete
  --exclude '.git'
  --exclude 'node_modules'
  --exclude '.next'
  --exclude 'dist'
  --exclude '.venv'
  --exclude '__pycache__'
  --exclude '*.pyc'
  --exclude 'apps/api/uploads'
  --exclude 'infra/staging/secrets'
  --exclude 'infra/production/secrets'
  --exclude '.env'
  --exclude 'apps/ai-engine/.env'
  --exclude '*.env'
  --exclude '*credentials*.json'
  --exclude '*-sa.json'
  --exclude 'rxnowapp-*.json'
  --exclude '.DS_Store'
  --exclude '*.docx'
  --exclude 'Prescription_sample.pdf'
  -e "ssh -i ${KEY} -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=12"
)

echo "==> Syncing repo to ${USER}@${HOST}:${REMOTE_DIR}"
"${SSH[@]}" "sudo mkdir -p ${REMOTE_DIR} /tmp/safescribe-rsync && sudo chown -R ${USER}:${USER} /tmp/safescribe-rsync"
"${RSYNC[@]}" "$ROOT/" "${USER}@${HOST}:/tmp/safescribe-rsync/"

"${SSH[@]}" "sudo rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.venv' \
  --exclude 'uploads' \
  --exclude 'releases' \
  --exclude '.env' \
  --exclude 'apps/ai-engine/.env' \
  --exclude 'apps/ai-engine/.venv' \
  --exclude '.DS_Store' \
  /tmp/safescribe-rsync/ ${REMOTE_DIR}/ \
  && sudo chown -R safescribe:safescribe ${REMOTE_DIR} /var/log/safescribe 2>/dev/null || true \
  && sudo chown -R ${USER}:${USER} ${REMOTE_DIR}/infra || true"

echo "==> Deploying as root via sudo"
if [[ "$DEPLOY_API" -eq 1 ]]; then
  echo "==> Deploying API"
  "${SSH[@]}" "sudo bash ${REMOTE_DIR}/infra/production/scripts/deploy-api.sh"
fi

if [[ "$DEPLOY_AI" -eq 1 ]]; then
  echo "==> Deploying AI"
  "${SSH[@]}" "sudo bash ${REMOTE_DIR}/infra/production/scripts/deploy-ai.sh"
fi

echo "==> Health checks"
"${SSH[@]}" "sudo bash ${REMOTE_DIR}/infra/production/scripts/healthcheck.sh"
echo "Production remote deploy finished."
