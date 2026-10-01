#!/usr/bin/env bash
# Daily Postgres + Redis RDB backup to /var/backups/safescribe
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/safescribe}"
KEEP_DAYS="${KEEP_DAYS:-7}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_ROOT}/${TS}"

mkdir -p "$DEST"

# shellcheck disable=SC1091
set -a
source /etc/safescribe/docker.env
set +a

echo "[backup] starting ${TS}"

docker exec safescribe-postgres pg_dump -U safescribe -d safescribe -Fc \
  > "${DEST}/postgres.dump"

docker exec safescribe-redis redis-cli -a "$REDIS_PASSWORD" --rdb /data/dump.rdb BGSAVE >/dev/null || true
sleep 2
docker cp safescribe-redis:/data/dump.rdb "${DEST}/redis.rdb" 2>/dev/null || true

# Env snapshot (no secrets in world-readable path — keep root-only)
install -m 600 /etc/safescribe/api.env "${DEST}/api.env.bak" 2>/dev/null || true

tar -C "$BACKUP_ROOT" -czf "${BACKUP_ROOT}/safescribe-${TS}.tar.gz" "$TS"
rm -rf "$DEST"

find "$BACKUP_ROOT" -name 'safescribe-*.tar.gz' -mtime "+${KEEP_DAYS}" -delete

echo "[backup] done ${BACKUP_ROOT}/safescribe-${TS}.tar.gz"
