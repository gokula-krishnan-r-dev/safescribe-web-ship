#!/usr/bin/env bash
# Deploy NestJS API to staging VM. Prefer running as root (sudo).
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/safescribe}"
APP_USER="${APP_USER:-safescribe}"
RELEASES="${APP_ROOT}/releases"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
NEW_RELEASE="${RELEASES}/api-${TS}"
CURRENT_LINK="${APP_ROOT}/current-api"
PREV_LINK="${APP_ROOT}/previous-api"

log() { echo "[deploy-api $(date -u +%H:%M:%S)] $*"; }

if [[ ! -f /etc/safescribe/api.env ]]; then
  log "ERROR: /etc/safescribe/api.env missing"
  exit 1
fi

if [[ ! -d "$APP_ROOT/apps/api" ]]; then
  log "ERROR: $APP_ROOT/apps/api not found — sync repo first"
  exit 1
fi

chown -R "$APP_USER:$APP_USER" "$APP_ROOT" /var/log/safescribe
mkdir -p "$RELEASES" /var/log/safescribe "$APP_ROOT/apps/api/uploads"

log "Building API release ${TS}"
cd "$APP_ROOT"

# Run install/build as app user so pnpm store lives in a writable home
run_user() {
  sudo -u "$APP_USER" -H env CI=1 bash -lc "cd $APP_ROOT && $*"
}

# Ensure env dir readable by app user
chown root:"$APP_USER" /etc/safescribe
chmod 750 /etc/safescribe
chown root:"$APP_USER" /etc/safescribe/*.env
chmod 640 /etc/safescribe/*.env

run_user "pnpm install --frozen-lockfile"
run_user "pnpm --filter @safescript/shared build"
run_user "pnpm db:generate"
run_user "pnpm --filter @safescript/api build"

mkdir -p "$NEW_RELEASE"
echo "$TS" > "${NEW_RELEASE}/VERSION"
if [[ -L "$CURRENT_LINK" ]]; then
  ln -sfn "$(readlink -f "$CURRENT_LINK")" "$PREV_LINK"
fi
ln -sfn "$NEW_RELEASE" "$CURRENT_LINK"

log "Running migrations"
set -a
# shellcheck disable=SC1091
source /etc/safescribe/api.env
set +a
sudo -u "$APP_USER" -H env CI=1 DATABASE_URL="$DATABASE_URL" bash -lc "cd $APP_ROOT && pnpm db:migrate:deploy"

log "Importing Renew workflow workbooks (idempotent)"
sudo -u "$APP_USER" -H env CI=1 DATABASE_URL="$DATABASE_URL" bash -lc "cd $APP_ROOT && pnpm db:seed:renew-workflow"

log "Bootstrapping Approved Indications repository from starter library (idempotent)"
sudo -u "$APP_USER" -H env CI=1 DATABASE_URL="$DATABASE_URL" bash -lc "cd $APP_ROOT && pnpm db:seed:approved-indications"

log "Bootstrapping Clinical Safety Reference & Target Values (idempotent)"
sudo -u "$APP_USER" -H env CI=1 DATABASE_URL="$DATABASE_URL" bash -lc "cd $APP_ROOT && pnpm db:seed:clinical-references"

log "Restarting PM2 (root daemon — simpler on single-tenant staging VM)"
# Stop crash-looping previous process if any
if ! grep -qE '^DEMO_LOGIN_BYPASS_EMAILS=' /etc/safescribe/api.env; then
  printf '\n# Demo accounts skip email 2FA after a valid password. Set to none to disable.\nDEMO_LOGIN_BYPASS_EMAILS=\n' >> /etc/safescribe/api.env
fi
pm2 delete safescribe-api >/dev/null 2>&1 || true

set -a
# shellcheck disable=SC1091
source /etc/safescribe/api.env
set +a

pm2 start /opt/safescribe/infra/staging/pm2/ecosystem.config.cjs --update-env
pm2 save
# Boot persistence
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -n 1 | bash || true

log "Health check"
ok=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 10 "http://127.0.0.1:3001/api/v1/health" | tee /tmp/api-health.json | grep -Eq '"status"'; then
    ok=1
    break
  fi
  sleep 3
done

if [[ "$ok" -ne 1 ]]; then
  log "Health check FAILED — rolling back"
  if [[ -L "$PREV_LINK" ]]; then
    ln -sfn "$(readlink -f "$PREV_LINK")" "$CURRENT_LINK"
    set -a; source /etc/safescribe/api.env; set +a
    pm2 reload /opt/safescribe/infra/staging/pm2/ecosystem.config.cjs --update-env || true
  fi
  pm2 logs safescribe-api --lines 40 --nostream || true
  exit 1
fi

cd "$RELEASES"
ls -1dt api-* 2>/dev/null | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r rm -rf

log "API deploy OK"
cat /tmp/api-health.json
echo

# Refresh nginx Mic SSE / upload locations when repo config is present
if [[ -x /opt/safescribe/infra/staging/scripts/apply-nginx-api.sh ]]; then
  log "Applying API nginx vhost (SafeScribe Mic SSE + uploads)"
  bash /opt/safescribe/infra/staging/scripts/apply-nginx-api.sh staging || log "WARN: nginx apply skipped"
fi
