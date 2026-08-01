#!/usr/bin/env bash
set -euo pipefail

backup_root="${MEMORYAI_PG_BACKUP_ROOT:-/home/ubuntu/memoryai-backups/postgresql}"
log_dir="$backup_root/logs"
log_file="$log_dir/restore-drill.log"
source_backup="${1:-$(find "$backup_root/daily" -type f -name 'memoryai-*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)}"
test_database="memoryai_restore_drill_$(date -u +%Y%m%d%H%M%S)"
tombstone_source_database="${MEMORYAI_DELETION_TOMBSTONE_SOURCE_DATABASE:-}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -d -m 700 "$log_dir"
touch "$log_file"
chmod 600 "$log_file"

cleanup() {
  sudo -n -u postgres dropdb --if-exists "$test_database" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ -z "$source_backup" ] || [ ! -s "$source_backup" ]; then
  printf '%s ERROR no non-empty backup available\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$log_file"
  exit 1
fi

if [[ ! "$tombstone_source_database" =~ ^[a-z][a-z0-9_]{2,62}$ ]]; then
  printf '%s ERROR deletion tombstone source database missing or invalid\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$log_file"
  exit 1
fi

sudo -n -u postgres createdb --encoding=UTF8 --locale=C.UTF-8 --template=template0 "$test_database"
# Root opens the protected backup and postgres consumes it from stdin.
sudo -n -u postgres pg_restore --exit-on-error --no-owner --dbname="$test_database" < "$source_backup"
"$script_dir/reapply-account-deletion-tombstones.sh" "$tombstone_source_database" "$test_database"
table_count="$(sudo -n -u postgres psql -Atqc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'" "$test_database")"
memory_count="$(sudo -n -u postgres psql -Atqc "SELECT COUNT(*) FROM memories" "$test_database")"

if [ "$table_count" -lt 9 ]; then
  printf '%s ERROR restore table count too low\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$log_file"
  exit 1
fi

printf '%s OK backup=%s tables=%s memories=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$(basename "$source_backup")" \
  "$table_count" \
  "$memory_count" >> "$log_file"
printf 'RESTORE_DRILL=pass tables=%s memories=%s\n' "$table_count" "$memory_count"
