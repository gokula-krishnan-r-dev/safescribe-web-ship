#!/usr/bin/env bash
# Rollback API to previous release symlink.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/safescribe}"
CURRENT_LINK="${APP_ROOT}/current-api"
PREV_LINK="${APP_ROOT}/previous-api"

if [[ ! -L "$PREV_LINK" ]]; then
  echo "No previous API release to roll back to"
  exit 1
fi

ln -sfn "$(readlink -f "$PREV_LINK")" "$CURRENT_LINK"
set -a
# shellcheck disable=SC1091
source /etc/safescribe/api.env
set +a
pm2 reload /opt/safescribe/infra/staging/pm2/ecosystem.config.cjs --update-env
sleep 3
curl -fsS http://127.0.0.1:3001/api/v1/health
echo
echo "Rolled back API to $(readlink -f "$CURRENT_LINK")"
