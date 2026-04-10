#!/usr/bin/env bash
set -euo pipefail

# Minimal CLI helper for server-side debugging via API:
# - login
# - create team
# - create player
# - attach player to team
# - seed all in one command
#
# Required env:
#   API_BASE, TENANT_SLUG, USERNAME, PASSWORD
#
# Optional env:
#   TOKEN_FILE (default: /tmp/tp-debug-api-token)
#
# Examples:
#   API_BASE=https://api.tournament-platform.ru TENANT_SLUG=spartak USERNAME=admin PASSWORD=... \
#     ./scripts/server/debug-api.sh seed --team-name "Debug Team" --team-slug debug-team --first-name Ivan --last-name Ivanov

API_BASE="${API_BASE:-https://api.tournament-platform.ru}"
TENANT_SLUG="${TENANT_SLUG:-}"
USERNAME="${USERNAME:-}"
PASSWORD="${PASSWORD:-}"
TOKEN_FILE="${TOKEN_FILE:-/tmp/tp-debug-api-token}"
LAST_IDS_FILE="${LAST_IDS_FILE:-/tmp/tp-debug-api-last-ids}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-table}"

require_env() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "Missing required env: $name" >&2
    exit 1
  fi
}

json_get() {
  local key="$1"
  node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));const v=d['$key'];if(v===undefined||v===null){process.exit(2)};process.stdout.write(String(v));"
}

api_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local token="${4:-}"
  local tmp
  tmp="$(mktemp)"

  local args=(
    -sS
    -X "$method"
    -H "Content-Type: application/json"
    -H "Accept: application/json"
    -w $'\n%{http_code}'
  )
  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer $token")
  fi
  if [[ -n "$body" ]]; then
    args+=(-d "$body")
  fi
  args+=("$API_BASE$path")

  curl "${args[@]}" >"$tmp"
  local status body_text
  status="$(tail -n 1 "$tmp")"
  body_text="$(sed '$d' "$tmp")"
  rm -f "$tmp"

  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo "API error ($status) for $method $path" >&2
    echo "$body_text" >&2
    exit 1
  fi
  printf "%s" "$body_text"
}

login() {
  require_env TENANT_SLUG
  require_env USERNAME
  require_env PASSWORD

  local payload response token tenant_id
  payload="$(printf '{"username":"%s","password":"%s","tenantSlug":"%s"}' "$USERNAME" "$PASSWORD" "$TENANT_SLUG")"
  response="$(api_request POST "/auth/login" "$payload")"
  token="$(printf "%s" "$response" | json_get accessToken)"
  tenant_id="$(printf "%s" "$response" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(String(d?.tenant?.id||''));")"

  printf "%s" "$token" >"$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  echo "Login OK"
  echo "tenantId=$tenant_id"
  echo "token saved to $TOKEN_FILE"
}

read_token() {
  if [[ ! -f "$TOKEN_FILE" ]]; then
    echo "Token file not found: $TOKEN_FILE" >&2
    echo "Run: $0 login" >&2
    exit 1
  fi
  cat "$TOKEN_FILE"
}

resolve_tenant_id() {
  local token="$1"
  api_request GET "/auth/me" "" "$token" | json_get tenantId
}

create_team() {
  local team_name="$1"
  local team_slug="$2"
  local token tenant_id payload
  token="$(read_token)"
  tenant_id="$(resolve_tenant_id "$token")"
  payload="$(printf '{"name":"%s","slug":"%s"}' "$team_name" "$team_slug")"
  api_request POST "/tenants/$tenant_id/teams" "$payload" "$token"
  echo
}

create_player() {
  local first_name="$1"
  local last_name="$2"
  local token tenant_id payload
  token="$(read_token)"
  tenant_id="$(resolve_tenant_id "$token")"
  payload="$(printf '{"firstName":"%s","lastName":"%s"}' "$first_name" "$last_name")"
  api_request POST "/tenants/$tenant_id/players" "$payload" "$token"
  echo
}

attach_player() {
  local team_id="$1"
  local player_id="$2"
  local jersey="${3:-}"
  local token tenant_id payload
  token="$(read_token)"
  tenant_id="$(resolve_tenant_id "$token")"

  if [[ -n "$jersey" ]]; then
    payload="$(printf '{"playerId":"%s","jerseyNumber":%s}' "$player_id" "$jersey")"
  else
    payload="$(printf '{"playerId":"%s"}' "$player_id")"
  fi
  api_request POST "/tenants/$tenant_id/teams/$team_id/players" "$payload" "$token"
  echo
}

list_teams() {
  local format="${1:-$OUTPUT_FORMAT}"
  local token tenant_id
  token="$(read_token)"
  tenant_id="$(resolve_tenant_id "$token")"
  if [[ "$format" == "json" ]]; then
    api_request GET "/tenants/$tenant_id/teams?page=1&pageSize=200" "" "$token"
  else
    api_request GET "/tenants/$tenant_id/teams?page=1&pageSize=200" "" "$token" \
      | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));const items=Array.isArray(d?.items)?d.items:[];for(const t of items){console.log([t.id,t.slug,t.name].join('\t'));}"
  fi
}

list_players() {
  local format="${1:-$OUTPUT_FORMAT}"
  local token tenant_id
  token="$(read_token)"
  tenant_id="$(resolve_tenant_id "$token")"
  if [[ "$format" == "json" ]]; then
    api_request GET "/tenants/$tenant_id/players?page=1&pageSize=200" "" "$token"
  else
    api_request GET "/tenants/$tenant_id/players?page=1&pageSize=200" "" "$token" \
      | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));const items=Array.isArray(d?.items)?d.items:[];for(const p of items){const full=[p.lastName||'',p.firstName||''].join(' ').trim();console.log([p.id,full||'-'].join('\t'));}"
  fi
}

seed() {
  local team_name="$1"
  local team_slug="$2"
  local first_name="$3"
  local last_name="$4"
  local jersey="${5:-}"

  local token tenant_id team_resp player_resp team_id player_id
  token="$(read_token)"
  tenant_id="$(resolve_tenant_id "$token")"

  team_resp="$(api_request POST "/tenants/$tenant_id/teams" "$(printf '{"name":"%s","slug":"%s"}' "$team_name" "$team_slug")" "$token")"
  player_resp="$(api_request POST "/tenants/$tenant_id/players" "$(printf '{"firstName":"%s","lastName":"%s"}' "$first_name" "$last_name")" "$token")"

  team_id="$(printf "%s" "$team_resp" | json_get id)"
  player_id="$(printf "%s" "$player_resp" | json_get id)"

  if [[ -n "$jersey" ]]; then
    api_request POST "/tenants/$tenant_id/teams/$team_id/players" "$(printf '{"playerId":"%s","jerseyNumber":%s}' "$player_id" "$jersey")" "$token" >/dev/null
  else
    api_request POST "/tenants/$tenant_id/teams/$team_id/players" "$(printf '{"playerId":"%s"}' "$player_id")" "$token" >/dev/null
  fi

  echo "Seed OK"
  echo "tenantId=$tenant_id"
  echo "teamId=$team_id"
  echo "playerId=$player_id"
  {
    echo "tenantId=$tenant_id"
    echo "teamId=$team_id"
    echo "playerId=$player_id"
  } >"$LAST_IDS_FILE"
  chmod 600 "$LAST_IDS_FILE"
  echo "saved ids to $LAST_IDS_FILE"
}

delete_team() {
  local team_id="$1"
  local token tenant_id
  token="$(read_token)"
  tenant_id="$(resolve_tenant_id "$token")"
  api_request DELETE "/tenants/$tenant_id/teams/$team_id" "" "$token" >/dev/null
  echo "Deleted team: $team_id"
}

delete_player() {
  local player_id="$1"
  local token tenant_id
  token="$(read_token)"
  tenant_id="$(resolve_tenant_id "$token")"
  api_request DELETE "/tenants/$tenant_id/players/$player_id" "" "$token" >/dev/null
  echo "Deleted player: $player_id"
}

cleanup_seed() {
  if [[ ! -f "$LAST_IDS_FILE" ]]; then
    echo "Last ids file not found: $LAST_IDS_FILE" >&2
    echo "Run seed first or set LAST_IDS_FILE" >&2
    exit 1
  fi

  # shellcheck disable=SC1090
  source "$LAST_IDS_FILE"
  if [[ -z "${teamId:-}" || -z "${playerId:-}" ]]; then
    echo "Invalid ids file: $LAST_IDS_FILE" >&2
    exit 1
  fi

  # Delete team first to detach members, then player.
  delete_team "$teamId"
  delete_player "$playerId"
  echo "Cleanup seed OK"
}

usage() {
  cat <<'EOF'
Usage:
  debug-api.sh login
  debug-api.sh list-teams [--json]
  debug-api.sh list-players [--json]
  debug-api.sh create-team <team-name> <team-slug>
  debug-api.sh create-player <first-name> <last-name>
  debug-api.sh attach-player <team-id> <player-id> [jersey-number]
  debug-api.sh delete-team <team-id>
  debug-api.sh delete-player <player-id>
  debug-api.sh cleanup-seed
  debug-api.sh seed --team-name <name> --team-slug <slug> --first-name <name> --last-name <name> [--jersey <num>]

Required env (for login):
  API_BASE, TENANT_SLUG, USERNAME, PASSWORD

Optional env:
  TOKEN_FILE (default: /tmp/tp-debug-api-token)
  LAST_IDS_FILE (default: /tmp/tp-debug-api-last-ids)
  OUTPUT_FORMAT=table|json (default: table)
EOF
}

cmd="${1:-}"
if [[ -z "$cmd" ]]; then
  usage
  exit 1
fi
shift || true

FORMAT="$OUTPUT_FORMAT"
if [[ "${1:-}" == "--json" ]]; then
  FORMAT="json"
  shift
fi

case "$cmd" in
  login)
    login
    ;;
  list-teams)
    list_teams "$FORMAT"
    ;;
  list-players)
    list_players "$FORMAT"
    ;;
  create-team)
    [[ $# -ge 2 ]] || { usage; exit 1; }
    create_team "$1" "$2"
    ;;
  create-player)
    [[ $# -ge 2 ]] || { usage; exit 1; }
    create_player "$1" "$2"
    ;;
  attach-player)
    [[ $# -ge 2 ]] || { usage; exit 1; }
    attach_player "${1}" "${2}" "${3:-}"
    ;;
  delete-team)
    [[ $# -ge 1 ]] || { usage; exit 1; }
    delete_team "$1"
    ;;
  delete-player)
    [[ $# -ge 1 ]] || { usage; exit 1; }
    delete_player "$1"
    ;;
  cleanup-seed)
    cleanup_seed
    ;;
  seed)
    TEAM_NAME=""
    TEAM_SLUG=""
    FIRST_NAME=""
    LAST_NAME=""
    JERSEY=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --team-name) TEAM_NAME="${2:-}"; shift 2 ;;
        --team-slug) TEAM_SLUG="${2:-}"; shift 2 ;;
        --first-name) FIRST_NAME="${2:-}"; shift 2 ;;
        --last-name) LAST_NAME="${2:-}"; shift 2 ;;
        --jersey) JERSEY="${2:-}"; shift 2 ;;
        *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
      esac
    done
    [[ -n "$TEAM_NAME" && -n "$TEAM_SLUG" && -n "$FIRST_NAME" && -n "$LAST_NAME" ]] || {
      usage
      exit 1
    }
    seed "$TEAM_NAME" "$TEAM_SLUG" "$FIRST_NAME" "$LAST_NAME" "$JERSEY"
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage
    exit 1
    ;;
esac
