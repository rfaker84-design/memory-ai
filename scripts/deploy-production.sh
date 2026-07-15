#!/usr/bin/env bash
set -e

pwd
git pull
npm install
npm run build
pm2 restart memoryai --update-env
pm2 status

LISTENERS=$(ss -H -ltn 'sport = :3000')
if [ -z "$LISTENERS" ] || echo "$LISTENERS" | awk '{print $4}' | grep -Ev '^(127\.0\.0\.1|\[::1\]):3000$' >/dev/null; then
  echo "[FAIL] port 3000 must listen on loopback only" >&2
  exit 1
fi
