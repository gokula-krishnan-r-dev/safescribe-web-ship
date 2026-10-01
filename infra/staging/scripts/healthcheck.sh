#!/usr/bin/env bash
# Post-deploy health verification for all staging services.
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:3001}"
AI_URL="${AI_URL:-http://127.0.0.1:8000}"
PUBLIC_API="${PUBLIC_API:-https://api-staging.safescribe.ca}"
PUBLIC_AI="${PUBLIC_AI:-https://ai-staging.safescribe.ca}"
CHECK_PUBLIC="${CHECK_PUBLIC:-0}"

pass=0
fail=0

if [[ -f /etc/safescribe/docker.env ]]; then
  # shellcheck disable=SC1091
  set -a
  source /etc/safescribe/docker.env
  set +a
fi

check() {
  local name="$1"
  shift
  if "$@" >/tmp/hc-out.txt 2>&1; then
    echo "OK   $name"
    pass=$((pass + 1))
  else
    echo "FAIL $name"
    head -20 /tmp/hc-out.txt || true
    fail=$((fail + 1))
  fi
}

echo "=== SafeScribe staging health ==="
check "postgres" docker exec safescribe-postgres pg_isready -U safescribe -d safescribe
check "redis" docker exec safescribe-redis redis-cli -a "${REDIS_PASSWORD:-}" ping
check "api-local" bash -c "curl -fsS --max-time 10 ${API_URL}/api/v1/health | grep -E 'healthy|degraded'"
check "ai-local" bash -c "curl -fsS --max-time 10 ${AI_URL}/health | grep -q ok"
check "ai-ready" bash -c "curl -fsS --max-time 10 ${AI_URL}/health/ready | grep -q true"
check "nginx" systemctl is-active --quiet nginx
check "pm2-api" bash -c "pm2 describe safescribe-api | grep -q online"
check "systemd-ai" systemctl is-active --quiet safescribe-ai
if [[ "$CHECK_PUBLIC" == "1" ]]; then
  check "api-public" bash -c "curl -fsS --max-time 15 ${PUBLIC_API}/api/v1/health | grep -E 'healthy|degraded'"
  check "ai-public" bash -c "curl -fsS --max-time 15 ${PUBLIC_AI}/health | grep -q ok"
fi

echo "=== Result: ${pass} passed, ${fail} failed ==="
[[ "$fail" -eq 0 ]]
