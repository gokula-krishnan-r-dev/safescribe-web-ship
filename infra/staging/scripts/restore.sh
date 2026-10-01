#!/usr/bin/env bash
# Restore Postgres from a pg_dump custom-format file inside a backup archive.
# Usage: restore.sh /var/backups/safescribe/safescribe-YYYYMMDDTHHMMSSZ.tar.gz
set -euo pipefail

ARCHIVE="${1:?Usage: restore.sh <backup-archive.tar.gz>}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# shellcheck disable=SC1091
set -a
source /etc/safescribe/docker.env
set +a

tar -xzf "$ARCHIVE" -C "$TMP"
DUMP="$(find "$TMP" -name 'postgres.dump' | head -1)"
[[ -n "$DUMP" ]] || { echo "postgres.dump not found in archive"; exit 1; }

echo "Restoring $DUMP — this will overwrite the safescribe database"
read -r -p "Type RESTORE to continue: " confirm
[[ "$confirm" == "RESTORE" ]] || exit 1

docker exec -i safescribe-postgres pg_restore \
  -U safescribe -d safescribe --clean --if-exists \
  < "$DUMP"

echo "Restore complete. Restart API: pm2 reload safescribe-api"
