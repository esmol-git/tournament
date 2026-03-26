#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/tournament/api}"
RELEASE_ARCHIVE="${1:-/tmp/tournament-backend-release.tgz}"
PROCESS_NAME="${PROCESS_NAME:-api}"

if [[ ! -f "$RELEASE_ARCHIVE" ]]; then
  echo "Release archive not found: $RELEASE_ARCHIVE" >&2
  exit 1
fi

RELEASES_DIR="$APP_ROOT/releases"
SHARED_DIR="$APP_ROOT/shared"
CURRENT_LINK="$APP_ROOT/current"
STAMP="$(date +%Y%m%d%H%M%S)"
NEW_RELEASE_DIR="$RELEASES_DIR/$STAMP"

mkdir -p "$RELEASES_DIR" "$SHARED_DIR"

if [[ ! -f "$SHARED_DIR/.env" ]]; then
  echo "Missing $SHARED_DIR/.env. Create it once before deploy." >&2
  exit 1
fi

mkdir -p "$NEW_RELEASE_DIR"
tar -xzf "$RELEASE_ARCHIVE" -C "$NEW_RELEASE_DIR"
ln -sfn "$SHARED_DIR/.env" "$NEW_RELEASE_DIR/.env"

cd "$NEW_RELEASE_DIR"
npm ci --omit=dev

if [[ -f "prisma/schema.prisma" ]]; then
  npx prisma migrate deploy
fi

ln -sfn "$NEW_RELEASE_DIR" "$CURRENT_LINK"
cd "$CURRENT_LINK"

if pm2 describe "$PROCESS_NAME" >/dev/null 2>&1; then
  pm2 restart "$PROCESS_NAME" --update-env
else
  pm2 start dist/main.js --name "$PROCESS_NAME"
fi

pm2 save

# Keep only the newest 5 releases.
ls -1dt "$RELEASES_DIR"/* 2>/dev/null | sed -e '1,5d' | xargs -r rm -rf

echo "Backend deployed: $NEW_RELEASE_DIR"
