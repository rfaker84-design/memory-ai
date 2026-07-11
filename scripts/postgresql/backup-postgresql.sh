#!/usr/bin/env bash
set -euo pipefail

backup_root="${MEMORYAI_PG_BACKUP_ROOT:-/home/ubuntu/memoryai-backups/postgresql}"
daily_dir="$backup_root/daily"
weekly_dir="$backup_root/weekly"
log_dir="$backup_root/logs"
log_file="$log_dir/backup.log"
database="${MEMORYAI_PG_DATABASE:-memoryai}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
minimum_free_bytes="${MEMORYAI_PG_MIN_FREE_BYTES:-5368709120}"

install -d -m 700 "$backup_root" "$daily_dir" "$weekly_dir" "$log_dir"
touch "$log_file"
chmod 600 "$log_file"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$log_file"
}

available_bytes="$(df -B1 --output=avail "$backup_root" | tail -n 1 | tr -d ' ')"
if [ "$available_bytes" -lt "$minimum_free_bytes" ]; then
  log "ERROR insufficient disk space for PostgreSQL backup"
  logger -t memoryai-postgresql "backup blocked: insufficient disk space"
  exit 1
fi

temporary="$daily_dir/.memoryai-$timestamp.dump.tmp"
destination="$daily_dir/memoryai-$timestamp.dump"
trap 'rm -f "$temporary"' EXIT

# The root-owned backup directory is intentionally not traversable by postgres.
# Let the invoking root shell open the file and stream pg_dump into it instead.
sudo -n -u postgres pg_dump --format=custom --compress=6 "$database" > "$temporary"
test -s "$temporary"
pg_restore --list "$temporary" >/dev/null
chown root:root "$temporary"
chmod 600 "$temporary"
mv "$temporary" "$destination"

if [ "$(date -u +%u)" = "7" ]; then
  cp --preserve=mode,ownership,timestamps "$destination" "$weekly_dir/"
fi

find "$daily_dir" -type f -name 'memoryai-*.dump' -mtime +6 -delete
find "$weekly_dir" -type f -name 'memoryai-*.dump' -mtime +27 -delete

log "OK backup=$(basename "$destination") size=$(stat -c %s "$destination")"
printf 'BACKUP_CREATED=%s\n' "$destination"
