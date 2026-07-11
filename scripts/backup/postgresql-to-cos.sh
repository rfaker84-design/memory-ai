#!/usr/bin/env bash
set -euo pipefail

root="${MEMORYAI_PG_BACKUP_ROOT:-/home/ubuntu/memoryai-backups/postgresql}"
database="${MEMORYAI_PG_DATABASE:-memoryai}"
bucket="${COS_BACKUP_BUCKET:-}"
region="${COS_BACKUP_REGION:-}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
daily="$root/daily/memoryai-$timestamp.dump"
log="$root/logs/backup-cos.log"
verify_tmp="$root/.verify-$timestamp.dump"

install -d -m 700 "$root/daily" "$root/weekly" "$root/logs"
touch "$log" && chmod 600 "$log"
log_event() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$log"; }
alert() { log_event "ALERT $1"; logger -t memoryai-backup "ALERT $1" 2>/dev/null || true; }
trap 'rm -f "$verify_tmp" "$daily.tmp"' EXIT

if [[ -z "$bucket" || -z "$region" || -z "${TENCENT_SECRET_ID:-}" || -z "${TENCENT_SECRET_KEY:-}" ]]; then
  alert "COS credentials or backup destination are not configured"
  exit 2
fi
command -v coscmd >/dev/null 2>&1 || { alert "coscmd is not installed"; exit 1; }

sudo -n -u postgres pg_dump --format=custom --compress=6 "$database" > "$daily.tmp"
test -s "$daily.tmp" && pg_restore --list "$daily.tmp" >/dev/null
chmod 600 "$daily.tmp" && mv "$daily.tmp" "$daily"
local_hash="$(sha256sum "$daily" | awk '{print $1}')"

upload_and_verify() {
  local source="$1" key="$2"
  if ! coscmd upload "$source" "$key" >/dev/null; then alert "COS upload failed key=$key local_preserved=$source"; return 1; fi
  if ! coscmd download "$key" "$verify_tmp" >/dev/null; then alert "COS verification download failed key=$key local_preserved=$source"; return 1; fi
  remote_hash="$(sha256sum "$verify_tmp" | awk '{print $1}')"
  rm -f "$verify_tmp"
  if [[ "$local_hash" != "$remote_hash" ]]; then alert "COS hash mismatch key=$key local_preserved=$source"; return 1; fi
  log_event "OK key=$key sha256=$local_hash"
}

upload_and_verify "$daily" "memoryai-postgresql/daily/$(basename "$daily")"
if [[ "$(date -u +%u)" == "7" ]]; then
  weekly="$root/weekly/$(basename "$daily")"
  cp --preserve=mode,timestamps "$daily" "$weekly"
  upload_and_verify "$weekly" "memoryai-postgresql/weekly/$(basename "$weekly")"
fi

# Retention starts only after the current COS upload and hash verification pass.
mapfile -t old_daily < <(find "$root/daily" -type f -name 'memoryai-*.dump' -printf '%T@ %p\n' | sort -nr | tail -n +8 | cut -d' ' -f2-)
mapfile -t old_weekly < <(find "$root/weekly" -type f -name 'memoryai-*.dump' -printf '%T@ %p\n' | sort -nr | tail -n +5 | cut -d' ' -f2-)
for file in "${old_daily[@]}" "${old_weekly[@]}"; do [[ -n "$file" ]] && rm -f -- "$file"; done
prune_cos() {
  local prefix="$1" keep="$2"
  mapfile -t old_keys < <(coscmd list "$prefix" 2>/dev/null | awk '{print $NF}' | grep "^${prefix}memoryai-.*\.dump$" | sort -r | tail -n "+$((keep + 1))" || true)
  for key in "${old_keys[@]}"; do
    coscmd delete "$key" >/dev/null || { alert "COS retention delete failed key=$key"; return 1; }
  done
}
prune_cos "memoryai-postgresql/daily/" 7
prune_cos "memoryai-postgresql/weekly/" 4
log_event "OK retention daily=7 weekly=4"
printf 'BACKUP_COS_VERIFIED=%s\n' "$local_hash"
