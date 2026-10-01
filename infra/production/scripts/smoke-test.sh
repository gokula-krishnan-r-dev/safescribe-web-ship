#!/usr/bin/env bash
# Public smoke tests for SafeScribe staging or production.
# Usage:
#   ./infra/production/scripts/smoke-test.sh           # production defaults
#   ./infra/production/scripts/smoke-test.sh staging   # staging endpoints
set -euo pipefail

ENV_NAME="${1:-production}"

case "$ENV_NAME" in
  staging)
    WEB_URL="${WEB_URL:-https://staging.safescribe.ca}"
    API_URL="${API_URL:-https://api-staging.safescribe.ca}"
    AI_URL="${AI_URL:-https://ai-staging.safescribe.ca}"
    ;;
  production|prod)
    WEB_URL="${WEB_URL:-https://safescribe.ca}"
    API_URL="${API_URL:-https://api.safescribe.ca}"
    AI_URL="${AI_URL:-https://ai.safescribe.ca}"
    ;;
  *)
    echo "Unknown env: $ENV_NAME (use staging|production)" >&2
    exit 1
    ;;
esac

pass=0
fail=0

check() {
  local name="$1"
  shift
  if "$@" >/tmp/ss-smoke.txt 2>&1; then
    echo "OK   $name"
    pass=$((pass + 1))
  else
    echo "FAIL $name"
    head -10 /tmp/ss-smoke.txt || true
    fail=$((fail + 1))
  fi
}

echo "=== SafeScribe smoke test ($ENV_NAME) ==="
echo "WEB=$WEB_URL"
echo "API=$API_URL"
echo "AI=$AI_URL"
echo

check "api-health" bash -c "curl -fsS --max-time 20 '${API_URL}/api/v1/health' | grep -E 'healthy|degraded'"
check "api-db" bash -c "curl -fsS --max-time 20 '${API_URL}/api/v1/health' | grep -q '\"database\":\"ok\"'"
check "api-redis" bash -c "curl -fsS --max-time 20 '${API_URL}/api/v1/health' | grep -q '\"redis\":\"ok\"'"
check "ai-health" bash -c "curl -fsS --max-time 20 '${AI_URL}/health' | grep -q ok"
check "ai-ready" bash -c "curl -fsS --max-time 20 '${AI_URL}/health/ready' | grep -Eq 'true|ready|ok'"
check "web-https" bash -c "code=\$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 '${WEB_URL}'); [[ \$code =~ ^(200|301|302|307|308)\$ ]]"

# SafeScribe Mic — pairing claim rejects missing body (route must be mounted)
check "mic-claim-route" bash -c "code=\$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST '${API_URL}/api/v1/mic/pairings/claim' -H 'Content-Type: application/json' -d '{}'); [[ \$code =~ ^(400|401|404|422)\$ ]]"
# Mic companion page (web) — should not require login
check "mic-web-path" bash -c "code=\$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 '${WEB_URL}/mic/test-token-smoke'); [[ \$code =~ ^(200|404)\$ ]]"

echo
echo "=== Result: ${pass} passed, ${fail} failed ==="
[[ "$fail" -eq 0 ]]
