#!/usr/bin/env bash
# Apply SafeScribe Mic-aware API nginx vhost and reload.
# Usage on VM (sudo):
#   bash /opt/safescribe/infra/staging/scripts/apply-nginx-api.sh staging
#   bash /opt/safescribe/infra/production/scripts/apply-nginx-api.sh production
set -euo pipefail

ENV_NAME="${1:-staging}"

if [[ "$ENV_NAME" == "production" || "$ENV_NAME" == "prod" ]]; then
  SRC="/opt/safescribe/infra/production/nginx/api.safescribe.ca.conf"
  # Existing bootstrap names use no trailing .conf on sites-available
  DEST="/etc/nginx/sites-available/api.safescribe.ca"
  ENABLE_NAME="api.safescribe.ca"
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

# Enable only the canonical name (remove mistaken .conf symlink if present)
mkdir -p /etc/nginx/sites-enabled
ln -sfn "$DEST" "/etc/nginx/sites-enabled/${ENABLE_NAME}"
rm -f "/etc/nginx/sites-enabled/${ENABLE_NAME}.conf"
# Clean accidental double-enabled copies
rm -f "/etc/nginx/sites-available/${ENABLE_NAME}.conf"

nginx -t
systemctl reload nginx
echo "[nginx] Reloaded OK ($ENV_NAME → $ENABLE_NAME)"
