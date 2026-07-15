#!/usr/bin/env bash
set -Eeuo pipefail

readonly deploy_dir="/home/ubuntu/memory-ai"
readonly backup_entry="$deploy_dir/scripts/backup/postgresql-to-cos.sh"
readonly cron_source="$deploy_dir/scripts/backup/memoryai-postgresql-cos-backup.cron"
readonly cron_target="/etc/cron.d/memoryai-postgresql-cos-backup"
readonly coscmd_config="/etc/memoryai/coscmd-backup.conf"
readonly coscmd_log="/var/log/memoryai/coscmd-backup.log"
readonly alert_hook="/usr/local/sbin/memoryai-backup-alert"
readonly expected_bucket="memoryai-pg-backup-prod-1442603693"
readonly expected_region="ap-guangzhou"
readonly expected_schedule="30 2 * * *"

dry_run=0
if [[ "${1:-}" == "--dry-run" && $# == 1 ]]; then
  dry_run=1
elif (( $# != 0 )); then
  printf 'Usage: %s [--dry-run]\n' "$0" >&2
  exit 64
fi

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit "${2:-1}"
}

(( EUID == 0 )) || fail "installer must run as root" 77

secure_root_file() {
  local path="$1" allowed_modes="$2" owner mode
  [[ -f "$path" && ! -L "$path" ]] || return 1
  owner="$(stat -c '%U:%G' "$path")" || return 1
  mode="$(stat -c '%a' "$path")" || return 1
  [[ "$owner" == "root:root" && " $allowed_modes " == *" $mode "* ]]
}

validate_sources() {
  local actual_dir cron_line
  actual_dir="$(cd "$(dirname "$0")/../.." && pwd -P)" || fail "cannot resolve deployment directory"
  [[ "$actual_dir" == "$deploy_dir" ]] || fail "deployment directory must be $deploy_dir (actual: $actual_dir)"
  [[ -f "$backup_entry" && ! -L "$backup_entry" ]] || fail "formal backup entry must be a regular non-symlink file"
  [[ -f "$cron_source" && ! -L "$cron_source" ]] || fail "cron template must be a regular non-symlink file"

  ! grep -Eiq 'replace-with|placeholder|changeme|todo' "$backup_entry" "$cron_source" || fail "backup assets contain a placeholder"
  grep -Fx 'readonly expected_bucket="memoryai-pg-backup-prod-1442603693"' "$backup_entry" >/dev/null || fail "backup entry bucket guard is invalid"
  grep -Fx 'readonly expected_region="ap-guangzhou"' "$backup_entry" >/dev/null || fail "backup entry region guard is invalid"
  [[ "$(grep -Ec '^CRON_TZ=' "$cron_source")" == 1 ]] || fail "cron template must contain exactly one CRON_TZ"
  grep -Fx 'CRON_TZ=UTC' "$cron_source" >/dev/null || fail "cron template must set CRON_TZ=UTC"
  grep -Fx 'HOME=/nonexistent' "$cron_source" >/dev/null || fail "cron template must isolate HOME"
  grep -Fx 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' "$cron_source" >/dev/null || fail "cron template PATH is invalid"

  cron_line="$(grep -Ev '^[[:space:]]*(#|$|[A-Z_]+=)' "$cron_source")"
  [[ "$(printf '%s\n' "$cron_line" | wc -l)" == 1 ]] || fail "cron template must contain exactly one job"
  [[ "$cron_line" == "$expected_schedule root "* ]] || fail "cron schedule must be 02:30 UTC"
  [[ "$(grep -oE 'COS_BACKUP_BUCKET=[^ ]+' <<< "$cron_line")" == "COS_BACKUP_BUCKET=$expected_bucket" ]] || fail "cron bucket is invalid"
  [[ "$(grep -oE 'COS_BACKUP_REGION=[^ ]+' <<< "$cron_line")" == "COS_BACKUP_REGION=$expected_region" ]] || fail "cron region is invalid"
  [[ "$cron_line" == *"$backup_entry" ]] || fail "cron must invoke the formal backup entry"
  [[ "$cron_line" != *"scripts/postgresql/cos-upload.sh"* ]] || fail "cron invokes the legacy backup helper"
  [[ "$cron_line" != *"flock"* ]] || fail "cron must not add a second flock"
  [[ "$cron_line" != *"SECRET"* && "$cron_line" != *"PASSWORD"* ]] || fail "cron must not contain credentials"
}

validate_prerequisites() {
  secure_root_file "$coscmd_config" "400 600" || fail "coscmd config must be root:root mode 400 or 600 and not a symlink"
  secure_root_file "$alert_hook" "500 700" || fail "alert hook must be root:root mode 500 or 700 and not a symlink"
  [[ -x "$alert_hook" ]] || fail "alert hook must be executable"

  if [[ -e "$coscmd_log" ]]; then
    secure_root_file "$coscmd_log" "600" || fail "coscmd log must be root:root mode 600 and not a symlink"
  elif (( dry_run )); then
    fail "coscmd log does not exist; dry-run never creates it"
  else
    local log_dir
    log_dir="$(dirname "$coscmd_log")"
    if [[ -e "$log_dir" ]]; then
      [[ -d "$log_dir" && ! -L "$log_dir" ]] || fail "coscmd log directory is unsafe"
      [[ "$(stat -c '%U:%G' "$log_dir")" == "root:root" ]] || fail "coscmd log directory must be root:root"
    else
      install -d -o root -g root -m 700 "$log_dir"
    fi
    install -o root -g root -m 600 /dev/null "$coscmd_log"
  fi

  command -v systemctl >/dev/null 2>&1 || fail "systemctl is required"
  systemctl list-unit-files cron.service --no-legend 2>/dev/null | grep -q '^cron\.service' || fail "cron.service is not installed"
  systemctl is-active --quiet cron.service || fail "cron.service is not active"
}

validate_installed_file() {
  local source_hash target_hash
  secure_root_file "$cron_target" "644" || fail "installed cron must be root:root mode 644 and not a symlink"
  source_hash="$(sha256sum "$cron_source" | awk '{print $1}')"
  target_hash="$(sha256sum "$cron_target" | awk '{print $1}')"
  [[ "$source_hash" == "$target_hash" ]] || fail "installed cron SHA-256 mismatch"
  cmp --silent "$cron_source" "$cron_target" || fail "installed cron content mismatch"
}

validate_sources
validate_prerequisites

if (( dry_run )); then
  printf 'DRY_RUN_OK target=%s schedule=02:30UTC\n' "$cron_target"
  exit 0
fi

if [[ -e "$cron_target" ]]; then
  secure_root_file "$cron_target" "644" || fail "existing cron target is unsafe"
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_path="$cron_target.backup.$timestamp"
  [[ ! -e "$backup_path" ]] || fail "timestamped cron backup already exists"
  install -o root -g root -m 600 "$cron_target" "$backup_path"
fi

temporary="$(mktemp "${cron_target}.tmp.XXXXXX")"
cleanup() { rm -f -- "$temporary"; }
trap cleanup EXIT
install -o root -g root -m 644 "$cron_source" "$temporary"
mv -fT -- "$temporary" "$cron_target"
trap - EXIT

validate_installed_file
printf 'CRON_INSTALLED target=%s sha256=%s\n' "$cron_target" "$(sha256sum "$cron_target" | awk '{print $1}')"
