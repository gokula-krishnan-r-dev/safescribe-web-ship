#!/usr/bin/env bash
# Apply AI nginx vhost and reload.
# Usage on VM (sudo):
#   bash /opt/safescribe/infra/production/scripts/apply-nginx-ai.sh http
#   bash /opt/safescribe/infra/production/scripts/apply-nginx-ai.sh production
set -euo pipefail

ENV_NAME="${1:-production}"
INFRA="/opt/safescribe/infra/production/nginx"

if [[ "$ENV_NAME" == "http" ]]; then
  SRC="${INFRA}/ai.safescribe.ca.http.conf"
else
  SRC="${INFRA}/ai.safescribe.ca.conf"
fi

DEST="/etc/nginx/sites-available/ai.safescribe.ca"
ENABLE_NAME="ai.safescribe.ca"

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: nginx source missing: $SRC" >&2
  exit 1
fi

if [[ "$ENV_NAME" != "http" && ! -f /etc/letsencrypt/live/ai.safescribe.ca/fullchain.pem ]]; then
  echo "ERROR: TLS cert missing for ai.safescribe.ca — run promote-from-staging.sh first" >&2
  exit 1
fi

echo "[nginx] Installing $SRC → $DEST"
cp "$SRC" "$DEST"
mkdir -p /etc/nginx/sites-enabled
ln -sfn "$DEST" "/etc/nginx/sites-enabled/${ENABLE_NAME}"
rm -f "/etc/nginx/sites-enabled/${ENABLE_NAME}.conf"

nginx -t
systemctl reload nginx
echo "[nginx] Reloaded OK (ai $ENV_NAME → $ENABLE_NAME)"
