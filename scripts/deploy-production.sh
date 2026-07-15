#!/usr/bin/env bash
set -e

pwd
git pull
npm install
npm run build

NGINX_CONFIG=$(sudo nginx -T 2>&1) || {
  echo "[FAIL] unable to inspect Nginx configuration" >&2
  exit 1
}
if ! echo "$NGINX_CONFIG" | grep -Eq 'proxy_set_header[[:space:]]+X-Real-IP[[:space:]]+\$remote_addr;'; then
  echo "[FAIL] Nginx must replace X-Real-IP with \$remote_addr" >&2
  exit 1
fi

pm2 restart memoryai --update-env
pm2 status

LISTENERS=$(ss -H -ltn 'sport = :3000')
if [ -z "$LISTENERS" ] || echo "$LISTENERS" | awk '{print $4}' | grep -Ev '^(127\.0\.0\.1|\[::1\]):3000$' >/dev/null; then
  echo "[FAIL] port 3000 must listen on loopback only" >&2
  exit 1
fi
