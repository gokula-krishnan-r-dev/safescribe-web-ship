#!/usr/bin/env bash
# Apply SafeScribe Mic-aware API nginx vhost and reload.
# Usage on VM (sudo):
#   bash /opt/safescribe/infra/production/scripts/apply-nginx-api.sh http
#   bash /opt/safescribe/infra/production/scripts/apply-nginx-api.sh production
#   bash /opt/safescribe/infra/production/scripts/apply-nginx-api.sh staging
set -euo pipefail

ENV_NAME="${1:-staging}"

if [[ "$ENV_NAME" == "http" ]]; then
  SRC="/opt/safescribe/infra/production/nginx/api.safescribe.ca.http.conf"
  DEST="/etc/nginx/sites-available/api.safescribe.ca"
  ENABLE_NAME="api.safescribe.ca"
elif [[ "$ENV_NAME" == "production" || "$ENV_NAME" == "prod" ]]; then
  SRC="/opt/safescribe/infra/production/nginx/api.safescribe.ca.conf"
  DEST="/etc/nginx/sites-available/api.safescribe.ca"
  ENABLE_NAME="api.safescribe.ca"
  if [[ ! -f /etc/letsencrypt/live/api.safescribe.ca/fullchain.pem ]]; then
    echo "ERROR: TLS cert missing for api.safescribe.ca — install HTTP vhost first" >&2
    exit 1
  fi
else
  SRC="/opt/safescribe/infra/staging/nginx/api-staging.safescribe.ca.conf"
  DEST="/etc/nginx/sites-available/api-staging.safescribe.ca"
  ENABLE_NAME="api-staging.safescribe.ca"
fi

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: nginx source missing: $SRC" >&2
  exit 1
fi

echo "[nginx] Installing $SRC → $DEST"
cp "$SRC" "$DEST"

if [[ -f /opt/safescribe/infra/nginx/cloudflare-real-ip.conf ]]; then
  cp /opt/safescribe/infra/nginx/cloudflare-real-ip.conf /etc/nginx/conf.d/cloudflare-real-ip.conf
  echo "[nginx] Installed Cloudflare real_ip restoration"
fi

mkdir -p /etc/nginx/sites-enabled
ln -sfn "$DEST" "/etc/nginx/sites-enabled/${ENABLE_NAME}"
rm -f "/etc/nginx/sites-enabled/${ENABLE_NAME}.conf"

nginx -t
systemctl reload nginx
echo "[nginx] Reloaded OK ($ENV_NAME → $ENABLE_NAME)"
