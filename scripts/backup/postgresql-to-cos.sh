#!/usr/bin/env bash
set -Eeuo pipefail

readonly coscmd_config="/etc/memoryai/coscmd-backup.conf"
readonly coscmd_log="/var/log/memoryai/coscmd-backup.log"
readonly lock_file="/run/lock/memoryai-postgresql-cos-backup.lock"
readonly alert_hook="/usr/local/sbin/memoryai-backup-alert"

root="${MEMORYAI_PG_BACKUP_ROOT:-/home/ubuntu/memoryai-backups/postgresql}"
database="${MEMORYAI_PG_DATABASE:-memoryai}"
bucket="${COS_BACKUP_BUCKET:-}"
region="${COS_BACKUP_REGION:-}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
daily="$root/daily/memoryai-$timestamp.dump"
event_log="$root/logs/backup-cos.log"
verify_tmp="$root/.verify-$timestamp.dump"
stage="startup"

# Never allow coscmd or a child process to discover per-user credentials.
export HOME=/nonexistent
unset TENCENT_SECRET_ID TENCENT_SECRET_KEY TENCENTCLOUD_SECRET_ID TENCENTCLOUD_SECRET_KEY

install -d -m 700 "$root/daily" "$root/weekly" "$root/logs" "$(dirname "$coscmd_log")"
touch "$event_log" "$coscmd_log"
chmod 600 "$event_log" "$coscmd_log"

log_event() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$event_log"
}

secure_root_file() {
  local path="$1" allowed_modes="$2" owner mode
  [[ -f "$path" && ! -L "$path" ]] || return 1
  owner="$(stat -c '%U:%G' "$path")" || return 1
  mode="$(stat -c '%a' "$path")" || return 1
  [[ "$owner" == "root:root" && " $allowed_modes " == *" $mode "* ]]
}

send_alert() {
  local message="$1"
  log_event "ALERT $message"
  logger -t memoryai-backup "ALERT $message" 2>/dev/null || true
  if [[ -e "$alert_hook" ]]; then
    if secure_root_file "$alert_hook" "500 700" && [[ -x "$alert_hook" ]]; then
      "$alert_hook" "$message" >/dev/null 2>&1 || log_event "ALERT stage=alert-hook rc=$?"
    else
      log_event "ALERT stage=alert-hook-validation rc=1"
    fi
  fi
}

on_error() {
  local rc="$?"
  trap - ERR
  send_alert "stage=$stage rc=$rc"
  exit "$rc"
}

cleanup() {
  rm -f -- "$verify_tmp" "$daily.tmp"
}

trap on_error ERR
trap cleanup EXIT

stage="lock"
exec 9>"$lock_file"
if ! flock -n 9; then
  send_alert "stage=lock rc=75"
  exit 75
fi

stage="configuration"
[[ -n "$bucket" && -n "$region" ]] || { send_alert "stage=configuration rc=2"; exit 2; }
if ! secure_root_file "$coscmd_config" "400 600"; then
  send_alert "stage=config-permissions rc=2"
  exit 2
fi
command -v coscmd >/dev/null 2>&1 || { send_alert "stage=coscmd-missing rc=127"; exit 127; }

readonly -a COSCMD=(
  coscmd
  -c "$coscmd_config"
  -l "$coscmd_log"
  -b "$bucket"
  -r "$region"
)

stage="pg-dump"
sudo -n -u postgres pg_dump --format=custom --compress=6 "$database" > "$daily.tmp"
stage="dump-validation"
test -s "$daily.tmp"
pg_restore --list "$daily.tmp" >/dev/null
chmod 600 "$daily.tmp"
mv "$daily.tmp" "$daily"
local_hash="$(sha256sum "$daily" | awk '{print $1}')"

upload_and_verify() {
  local source="$1" key="$2" remote_hash
  stage="cos-upload"
  "${COSCMD[@]}" upload "$source" "$key" >/dev/null
  stage="cos-download-verification"
  "${COSCMD[@]}" download "$key" "$verify_tmp" >/dev/null
  stage="hash-verification"
  remote_hash="$(sha256sum "$verify_tmp" | awk '{print $1}')"
  rm -f -- "$verify_tmp"
  [[ "$local_hash" == "$remote_hash" ]]
  log_event "OK stage=cos-verification"
}

upload_and_verify "$daily" "memoryai-postgresql/daily/$(basename "$daily")"
if [[ "$(date -u +%u)" == "7" ]]; then
  stage="weekly-copy"
  weekly="$root/weekly/$(basename "$daily")"
  cp --preserve=mode,timestamps "$daily" "$weekly"
  upload_and_verify "$weekly" "memoryai-postgresql/weekly/$(basename "$weekly")"
fi

# COS lifecycle rules own remote retention: daily 8 days, weekly 35 days.
# This script deliberately never lists or deletes remote objects.
stage="local-retention"
mapfile -t old_daily < <(find "$root/daily" -type f -name 'memoryai-*.dump' -printf '%T@ %p\n' | sort -nr | tail -n +8 | cut -d' ' -f2-)
mapfile -t old_weekly < <(find "$root/weekly" -type f -name 'memoryai-*.dump' -printf '%T@ %p\n' | sort -nr | tail -n +5 | cut -d' ' -f2-)
for file in "${old_daily[@]}" "${old_weekly[@]}"; do
  [[ -n "$file" ]] && rm -f -- "$file"
done

stage="complete"
log_event "OK stage=complete local_daily=7 local_weekly=4 remote_lifecycle=daily-8d,weekly-35d"
printf 'BACKUP_COS_VERIFIED=%s\n' "$local_hash"
