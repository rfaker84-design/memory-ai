#!/usr/bin/env bash
set -euo pipefail

backup_root="${MEMORYAI_PG_BACKUP_ROOT:-/home/ubuntu/memoryai-backups/postgresql}"
log_file="$backup_root/logs/monitor.log"
minimum_free_bytes="${MEMORYAI_PG_MIN_FREE_BYTES:-5368709120}"
minimum_available_kb="${MEMORYAI_PG_MIN_AVAILABLE_KB:-524288}"

install -d -m 700 "$(dirname "$log_file")"
touch "$log_file"
chmod 600 "$log_file"

failures=()
systemctl is-active --quiet postgresql || failures+=("postgresql-inactive")
sudo -n -u postgres pg_isready -q -h 127.0.0.1 -p 5432 -d memoryai || failures+=("postgresql-not-ready")

available_bytes="$(df -B1 --output=avail / | tail -n 1 | tr -d ' ')"
available_memory_kb="$(awk '/MemAvailable/ {print $2}' /proc/meminfo)"
[ "$available_bytes" -ge "$minimum_free_bytes" ] || failures+=("disk-low")
[ "$available_memory_kb" -ge "$minimum_available_kb" ] || failures+=("memory-low")

if [ "${#failures[@]}" -gt 0 ]; then
  message="ERROR ${failures[*]}"
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$message" >> "$log_file"
  logger -t memoryai-postgresql "$message"
  exit 1
fi

printf '%s OK disk_available=%s memory_available_kb=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$available_bytes" \
  "$available_memory_kb" >> "$log_file"
