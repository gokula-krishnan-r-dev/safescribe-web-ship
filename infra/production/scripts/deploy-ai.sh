#!/usr/bin/env bash
# Deploy Python AI engine to production VM.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/safescribe}"
AI_DIR="${APP_ROOT}/apps/ai-engine"
RELEASES="${APP_ROOT}/releases"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

log() { echo "[deploy-ai $(date -u +%H:%M:%S)] $*"; }

if [[ ! -d "$AI_DIR" ]]; then
  log "ERROR: $AI_DIR missing"
  exit 1
fi

if [[ ! -f /etc/safescribe/ai.env ]]; then
  log "ERROR: /etc/safescribe/ai.env missing"
  exit 1
fi

cd "$AI_DIR"
log "Ensuring venv + dependencies"
python3.12 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Snapshot requirements lock marker
mkdir -p "$RELEASES"
echo "$TS" > "${RELEASES}/ai-${TS}.stamp"
# Keep previous stamp for rollback reference
if [[ -f "${RELEASES}/ai-current.stamp" ]]; then
  cp "${RELEASES}/ai-current.stamp" "${RELEASES}/ai-previous.stamp"
fi
echo "$TS" > "${RELEASES}/ai-current.stamp"

log "Installing/restarting systemd unit"
sudo cp "${APP_ROOT}/infra/production/systemd/safescribe-ai.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable safescribe-ai
sudo systemctl restart safescribe-ai

log "Health check"
ok=0
# Uvicorn cold start after pip sync can take 30–45s on a small VM
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if curl -fsS --max-time 10 "http://127.0.0.1:8000/health" | tee /tmp/ai-health.json | grep -q '"status"'; then
    ok=1
    break
  fi
  sleep 3
done

if [[ "$ok" -ne 1 ]]; then
  log "Health check FAILED — attempting restart rollback"
  sudo systemctl restart safescribe-ai || true
  sleep 5
  if ! curl -fsS --max-time 15 "http://127.0.0.1:8000/health" | grep -q '"status"'; then
    log "AI still unhealthy"
    sudo journalctl -u safescribe-ai -n 40 --no-pager || true
    exit 1
  fi
fi

# Fail deploy if staged pathway routes are missing (avoids opaque API 404s on upload/classify).
log "Verifying pathway routes"
OPENAPI="$(curl -fsS --max-time 10 http://127.0.0.1:8000/openapi.json)"
for route in \
  /api/v1/pathway/classify \
  /api/v1/pathway/analyze-overlap \
  /api/v1/pathway/extract-concepts \
  /api/v1/pathway/generate-from-concepts
do
  if ! echo "$OPENAPI" | grep -Fq "\"$route\""; then
    log "ERROR: missing route $route — AI process likely stale or import failed"
    sudo journalctl -u safescribe-ai -n 40 --no-pager || true
    exit 1
  fi
done

# Prune stamps
cd "$RELEASES"
ls -1dt ai-*.stamp 2>/dev/null | grep -v current | grep -v previous | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r rm -f

log "AI deploy OK"
cat /tmp/ai-health.json
echo
