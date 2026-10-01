#!/usr/bin/env bash
# Promote the existing staging GCP VM to also serve production hostnames.
# Run from the laptop (uses the staging deploy key + same VM).
#
#   ./infra/production/scripts/promote-from-staging.sh           # prepare nginx + CORS
#   ./infra/production/scripts/promote-from-staging.sh --certs   # issue Let's Encrypt after DNS
#   ./infra/production/scripts/promote-from-staging.sh --cutover # switch API/WEB URLs after TLS
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HOST="${STAGING_HOST:-${PROD_HOST:-34.19.234.40}}"
USER="${STAGING_USER:-${PROD_USER:-ubuntu}}"
KEY="${DEPLOY_KEY:-$ROOT/infra/staging/secrets/deploy_key}"
REMOTE_DIR="/opt/safescribe"
MODE="prepare"

for arg in "$@"; do
  case "$arg" in
    --prepare) MODE="prepare" ;;
    --certs) MODE="certs" ;;
    --cutover) MODE="cutover" ;;
    *) echo "Unknown arg: $arg (use --prepare | --certs | --cutover)"; exit 1 ;;
  esac
done

if [[ ! -f "$KEY" ]]; then
  echo "ERROR: deploy key missing: $KEY" >&2
  exit 1
fi

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes "${USER}@${HOST}")

echo "==> Syncing repo to ${USER}@${HOST}:${REMOTE_DIR}"
STAGING_HOST="$HOST" STAGING_USER="$USER" DEPLOY_KEY="$KEY" \
  "$ROOT/infra/staging/scripts/remote-deploy.sh" --api

echo "==> Running $MODE on VM"
"${SSH[@]}" "sudo MODE=$MODE bash -s" <<'REMOTE'
set -euo pipefail
MODE="${MODE:-prepare}"
APP_ROOT="/opt/safescribe"
API_APPLY="$APP_ROOT/infra/production/scripts/apply-nginx-api.sh"
AI_APPLY="$APP_ROOT/infra/production/scripts/apply-nginx-ai.sh"
CORS_VALUE="https://safescribe.ca,https://www.safescribe.ca,https://app.safescribe.ca,https://staging.safescribe.ca,https://safescribe-web.vercel.app"

upsert_env() {
  local file="$1" key="$2" value="$3"
  python3 - "$file" "$key" "$value" <<'PY'
from pathlib import Path
import sys
path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
text = Path(path).read_text() if Path(path).exists() else ""
lines = text.splitlines()
out, found = [], False
for line in lines:
    if line.startswith(key + "="):
        out.append(f"{key}={value}")
        found = True
    else:
        out.append(line)
if not found:
    out.append(f"{key}={value}")
Path(path).write_text("\n".join(out) + "\n")
PY
}

mkdir -p /var/www/certbot
chmod +x "$API_APPLY" "$AI_APPLY" || true

echo "[promote] Installing HTTP bootstrap vhosts (keeps staging sites)"
bash "$API_APPLY" http
bash "$AI_APPLY" http

echo "[promote] Allowing production browser origins"
upsert_env /etc/safescribe/api.env CORS_ORIGINS "$CORS_VALUE"
upsert_env /etc/safescribe/ai.env CORS_ORIGINS "$CORS_VALUE"
chown root:safescribe /etc/safescribe/*.env
chmod 640 /etc/safescribe/*.env

dns_resolves() {
  local host="$1"
  getent ahostsv4 "$host" 2>/dev/null | grep -qE '^[0-9]'
}

issue_cert() {
  local domain="$1"
  if [[ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]]; then
    echo "[promote] Cert already present for $domain"
    return 0
  fi
  if ! dns_resolves "$domain"; then
    echo "[promote] SKIP cert for $domain — hostname does not resolve yet"
    echo "          Cloudflare DNS (grey cloud / DNS only): A ${domain%%.safescribe.ca} → 34.19.234.40"
    return 1
  fi
  certbot certonly --webroot -w /var/www/certbot \
    -d "$domain" \
    --non-interactive --agree-tos -m admin@safescribe.ca --keep-until-expiring \
    || {
      echo "[promote] certbot failed for $domain. If the record is Cloudflare-proxied (orange cloud),"
      echo "          switch it to DNS only, wait 1–2 minutes, rerun --certs, then re-enable the proxy."
      return 1
    }
}

install_tls_if_ready() {
  local ready=0
  if [[ -f /etc/letsencrypt/live/api.safescribe.ca/fullchain.pem ]]; then
    bash "$API_APPLY" production
    ready=1
  fi
  if [[ -f /etc/letsencrypt/live/ai.safescribe.ca/fullchain.pem ]]; then
    bash "$AI_APPLY" production
    ready=1
  fi
  return 0
}

if [[ "$MODE" == "certs" || "$MODE" == "cutover" ]]; then
  issue_cert api.safescribe.ca || true
  issue_cert ai.safescribe.ca || true
fi

install_tls_if_ready

if [[ "$MODE" == "cutover" ]]; then
  if [[ ! -f /etc/letsencrypt/live/api.safescribe.ca/fullchain.pem ]]; then
    echo "ERROR: cannot cut over without api.safescribe.ca TLS" >&2
    exit 1
  fi
  echo "[promote] Switching API/WEB URLs to production hostnames"
  upsert_env /etc/safescribe/api.env API_URL "https://api.safescribe.ca"
  upsert_env /etc/safescribe/api.env NEXT_PUBLIC_API_URL "https://api.safescribe.ca"
  upsert_env /etc/safescribe/api.env WEB_URL "https://safescribe.ca"
  upsert_env /etc/safescribe/ai.env NESTJS_CALLBACK_URL "https://api.safescribe.ca/api/v1/ai-engine/callback"
fi

echo "[promote] Reloading API with updated env"
pm2 reload safescribe-api --update-env || pm2 restart safescribe-api --update-env
systemctl reload nginx
echo "[promote] $MODE complete"
REMOTE
