#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/server/healthcheck.sh
# Optional env:
#   FRONT_URL=https://tournament-platform.ru
#   API_URL=https://api.tournament-platform.ru/api
#   PM2_API_NAME=api
#   PM2_FRONTEND_NAME=frontend
#   TELEGRAM_BOT_TOKEN=...
#   TELEGRAM_CHAT_ID=...

FRONT_URL="${FRONT_URL:-https://tournament-platform.ru}"
API_URL="${API_URL:-https://api.tournament-platform.ru/api}"
PM2_API_NAME="${PM2_API_NAME:-api}"
PM2_FRONTEND_NAME="${PM2_FRONTEND_NAME:-frontend}"

send_telegram() {
  local text="$1"
  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    return 0
  fi
  curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" >/dev/null
}

require_ok() {
  local name="$1"
  local cmd="$2"
  if ! eval "$cmd" >/dev/null 2>&1; then
    send_telegram "ALERT: ${name} failed on $(hostname)"
    echo "FAILED: ${name}" >&2
    exit 1
  fi
}

require_ok "frontend http" "curl -fsS --max-time 10 '$FRONT_URL'"
require_ok "api http" "curl -fsS --max-time 10 '$API_URL'"
require_ok "pm2 api online" "pm2 pid '$PM2_API_NAME' | rg -q '^[0-9]+'"
require_ok "pm2 frontend online" "pm2 pid '$PM2_FRONTEND_NAME' | rg -q '^[0-9]+'"

echo "Healthcheck OK"
