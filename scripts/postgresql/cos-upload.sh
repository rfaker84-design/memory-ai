#!/usr/bin/env bash
set -euo pipefail

backup_root="${MEMORYAI_PG_BACKUP_ROOT:-/home/ubuntu/memoryai-backups/postgresql}"
log_file="$backup_root/logs/cos-upload.log"
source_backup="${1:-$(find "$backup_root/daily" -type f -name 'memoryai-*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)}"

install -d -m 700 "$(dirname "$log_file")"
touch "$log_file"
chmod 600 "$log_file"

if [ -z "${COS_BACKUP_BUCKET:-}" ] || [ -z "${COS_BACKUP_REGION:-}" ]; then
  printf '%s SKIP COS backup credentials or destination are not configured\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$log_file"
  exit 2
fi

if ! command -v coscmd >/dev/null 2>&1; then
  printf '%s ERROR coscmd is not installed\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$log_file"
  exit 1
fi

if [ -z "$source_backup" ] || [ ! -s "$source_backup" ]; then
  printf '%s ERROR no non-empty backup available\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$log_file"
  exit 1
fi

coscmd upload "$source_backup" "memoryai-postgresql/$(basename "$source_backup")" >/dev/null
printf '%s OK backup=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$source_backup")" >> "$log_file"
printf 'COS_UPLOAD=pass\n'
