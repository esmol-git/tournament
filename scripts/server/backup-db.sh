#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/server/backup-db.sh
# Optional env:
#   BACKUP_DIR=/var/backups/tournament/db
#   RETENTION_DAYS=14
#   API_ENV_FILE=/opt/tournament/api/shared/.env
#   TELEGRAM_BOT_TOKEN=...
#   TELEGRAM_CHAT_ID=...

BACKUP_DIR="${BACKUP_DIR:-/var/backups/tournament/db}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
API_ENV_FILE="${API_ENV_FILE:-/opt/tournament/api/shared/.env}"

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$API_ENV_FILE" ]]; then
  echo "Missing env file: $API_ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$API_ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set in $API_ENV_FILE" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/tournament-db-$STAMP.sql.gz"

if pg_dump "$DATABASE_URL" | gzip > "$OUT_FILE"; then
  echo "Backup created: $OUT_FILE"
else
  echo "Backup failed" >&2
  exit 1
fi

# Retention policy
find "$BACKUP_DIR" -type f -name "tournament-db-*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

send_telegram() {
  local text="$1"
  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    return 0
  fi
  curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" >/dev/null
}

send_telegram "DB backup OK: ${OUT_FILE}"
