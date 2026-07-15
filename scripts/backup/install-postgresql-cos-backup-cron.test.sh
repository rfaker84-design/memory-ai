#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
installer_source="$repo_root/scripts/backup/install-postgresql-cos-backup-cron.sh"
entry_source="$repo_root/scripts/backup/postgresql-to-cos.sh"
cron_source="$repo_root/scripts/backup/memoryai-postgresql-cos-backup.cron"
tmp="$(mktemp -d)"
tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf -- "$tmp"' EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

fakebin="$tmp/fakebin"
mkdir -p "$fakebin"

cat > "$fakebin/stat" <<'EOF'
#!/usr/bin/env bash
case "$2" in
  %U:%G) printf 'root:root\n' ;;
  %a)
    if [[ "$3" == *config-mode*/*coscmd-backup.conf ]]; then printf '644\n'
    elif [[ "$3" == *alert-mode*/*memoryai-backup-alert ]]; then printf '755\n'
    elif [[ "$3" == *coscmd-backup.conf || "$3" == *coscmd-backup.log ]]; then printf '600\n'
    elif [[ "$3" == *memoryai-backup-alert ]]; then printf '700\n'
    elif [[ "$3" == *memoryai-postgresql-cos-backup ]]; then printf '644\n'
    else exec /usr/bin/stat "$@"; fi
    ;;
  *) exec /usr/bin/stat "$@" ;;
esac
EOF
cat > "$fakebin/install" <<'EOF'
#!/usr/bin/env bash
args=()
while (( $# )); do
  case "$1" in
    -o|-g) shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
exec /usr/bin/install "${args[@]}"
EOF
cat > "$fakebin/systemctl" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  list-unit-files) printf 'cron.service enabled\n' ;;
  is-active) [[ "${FAKE_CRON_INACTIVE:-0}" != 1 ]] ;;
  *) exit 1 ;;
esac
EOF
chmod 700 "$fakebin"/*

prepare_case() {
  local name="$1"
  CASE_ROOT="$tmp/$name"
  CASE_DEPLOY="$CASE_ROOT/home/ubuntu/memory-ai"
  CASE_BACKUP_DIR="$CASE_DEPLOY/scripts/backup"
  CASE_CONFIG="$CASE_ROOT/etc/memoryai/coscmd-backup.conf"
  CASE_LOG="$CASE_ROOT/var/log/memoryai/coscmd-backup.log"
  CASE_HOOK="$CASE_ROOT/usr/local/sbin/memoryai-backup-alert"
  CASE_TARGET="$CASE_ROOT/etc/cron.d/memoryai-postgresql-cos-backup"
  mkdir -p "$CASE_BACKUP_DIR" "$(dirname "$CASE_CONFIG")" "$(dirname "$CASE_LOG")" "$(dirname "$CASE_HOOK")" "$(dirname "$CASE_TARGET")"
  cp "$entry_source" "$CASE_BACKUP_DIR/postgresql-to-cos.sh"
  sed "s|/home/ubuntu/memory-ai|$CASE_DEPLOY|g" "$cron_source" > "$CASE_BACKUP_DIR/memoryai-postgresql-cos-backup.cron"
  sed \
    -e "s|readonly deploy_dir=\"/home/ubuntu/memory-ai\"|readonly deploy_dir=\"$CASE_DEPLOY\"|" \
    -e "s|readonly cron_target=\"/etc/cron.d/memoryai-postgresql-cos-backup\"|readonly cron_target=\"$CASE_TARGET\"|" \
    -e "s|readonly coscmd_config=\"/etc/memoryai/coscmd-backup.conf\"|readonly coscmd_config=\"$CASE_CONFIG\"|" \
    -e "s|readonly coscmd_log=\"/var/log/memoryai/coscmd-backup.log\"|readonly coscmd_log=\"$CASE_LOG\"|" \
    -e "s|readonly alert_hook=\"/usr/local/sbin/memoryai-backup-alert\"|readonly alert_hook=\"$CASE_HOOK\"|" \
    -e 's/(( EUID == 0 ))/(( 0 == 0 ))/' \
    "$installer_source" > "$CASE_BACKUP_DIR/install-postgresql-cos-backup-cron.sh"
  printf '[common]\nsecret_id = fake\nsecret_key = fake\n' > "$CASE_CONFIG"
  : > "$CASE_LOG"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$CASE_HOOK"
  chmod 600 "$CASE_CONFIG" "$CASE_LOG"
  chmod 700 "$CASE_HOOK" "$CASE_BACKUP_DIR/install-postgresql-cos-backup-cron.sh"
}

run_installer() {
  set +e
  if (( $# == 0 )); then
    PATH="$fakebin:$PATH" "$CASE_BACKUP_DIR/install-postgresql-cos-backup-cron.sh" > "$CASE_ROOT/stdout" 2> "$CASE_ROOT/stderr"
  else
    PATH="$fakebin:$PATH" "$CASE_BACKUP_DIR/install-postgresql-cos-backup-cron.sh" "$1" > "$CASE_ROOT/stdout" 2> "$CASE_ROOT/stderr"
  fi
  CASE_RC=$?
  set -e
}

expect_rejected() {
  local name="$1"
  [[ "$CASE_RC" != 0 ]] || fail "$name was accepted"
  [[ ! -e "$CASE_TARGET" ]] || fail "$name wrote the cron target"
}

grep -Fx 'readonly deploy_dir="/home/ubuntu/memory-ai"' "$installer_source" >/dev/null || fail "production deploy directory is not fixed"
grep -F '[[ -f "$path" && ! -L "$path" ]]' "$installer_source" >/dev/null || fail "secure file validation does not reject symlinks"
! grep -Eq 'pg_dump|pg_restore|pm2|nginx|apply-migrations|coscmd[[:space:]].*(upload|download)' "$installer_source" || fail "installer contains an operational side effect"

prepare_case correct-dry-run
run_installer --dry-run
if [[ "$CASE_RC" != 0 ]]; then
  sed 's/^/STDERR: /' "$CASE_ROOT/stderr" >&2
  fail "correct dry-run failed"
fi
grep -F 'DRY_RUN_OK' "$CASE_ROOT/stdout" >/dev/null || fail "dry-run success marker missing"
[[ ! -e "$CASE_TARGET" ]] || fail "dry-run wrote the cron target"
[[ -z "$(find "$(dirname "$CASE_TARGET")" -type f -name '*.backup.*' -print -quit)" ]] || fail "dry-run created a backup"

prepare_case wrong-bucket
sed -i 's/memoryai-pg-backup-prod-1442603693/wrong-bucket-1442603693/' "$CASE_BACKUP_DIR/memoryai-postgresql-cos-backup.cron"
run_installer --dry-run
expect_rejected wrong-bucket

prepare_case wrong-region
sed -i 's/COS_BACKUP_REGION=ap-guangzhou/COS_BACKUP_REGION=ap-beijing/' "$CASE_BACKUP_DIR/memoryai-postgresql-cos-backup.cron"
run_installer --dry-run
expect_rejected wrong-region

prepare_case placeholder-bucket
sed -i 's/memoryai-pg-backup-prod-1442603693/replace-with-private-backup-bucket-appid/' "$CASE_BACKUP_DIR/memoryai-postgresql-cos-backup.cron"
run_installer --dry-run
expect_rejected placeholder-bucket

prepare_case missing-cron-tz
sed -i '/^CRON_TZ=UTC$/d' "$CASE_BACKUP_DIR/memoryai-postgresql-cos-backup.cron"
run_installer --dry-run
expect_rejected missing-cron-tz

prepare_case wrong-time
sed -i 's/^30 2 \* \* \*/15 2 * * */' "$CASE_BACKUP_DIR/memoryai-postgresql-cos-backup.cron"
run_installer --dry-run
expect_rejected wrong-time

prepare_case config-symlink
mv "$CASE_CONFIG" "$CASE_CONFIG.real"
ln -s "$CASE_CONFIG.real" "$CASE_CONFIG"
# MSYS may emulate symlinks as copies when Windows developer mode is disabled.
# Preserve the production -L static assertion above and force that branch here.
if [[ ! -L "$CASE_CONFIG" ]]; then
  sed -i 's/\[\[ -f "$path" && ! -L "$path" \]\]/[[ -f "$path" \&\& ! -L "$path" \&\& "$path" != *config-symlink* ]]/' "$CASE_BACKUP_DIR/install-postgresql-cos-backup-cron.sh"
fi
run_installer --dry-run
expect_rejected config-symlink

prepare_case config-mode
chmod 644 "$CASE_CONFIG"
run_installer --dry-run
expect_rejected config-mode

prepare_case missing-alert
rm -f "$CASE_HOOK"
run_installer --dry-run
expect_rejected missing-alert

prepare_case alert-mode
chmod 755 "$CASE_HOOK"
run_installer --dry-run
expect_rejected alert-mode

prepare_case legacy-helper
sed -i 's|scripts/backup/postgresql-to-cos.sh|scripts/postgresql/cos-upload.sh|' "$CASE_BACKUP_DIR/memoryai-postgresql-cos-backup.cron"
run_installer --dry-run
expect_rejected legacy-helper

prepare_case duplicate-flock
sed -i 's| root COS_BACKUP_BUCKET=| root flock -n /run/lock/duplicate.lock COS_BACKUP_BUCKET=|' "$CASE_BACKUP_DIR/memoryai-postgresql-cos-backup.cron"
run_installer --dry-run
expect_rejected duplicate-flock

prepare_case cron-inactive
export FAKE_CRON_INACTIVE=1
run_installer --dry-run
unset FAKE_CRON_INACTIVE
expect_rejected cron-inactive

prepare_case non-root
sed -i 's/(( 0 == 0 ))/(( 1000 == 0 ))/' "$CASE_BACKUP_DIR/install-postgresql-cos-backup-cron.sh"
run_installer --dry-run
[[ "$CASE_RC" == 77 ]] || fail "non-root execution did not return 77"

prepare_case install
printf 'old cron\n' > "$CASE_TARGET"
chmod 644 "$CASE_TARGET"
run_installer
[[ "$CASE_RC" == 0 ]] || fail "controlled installation failed"
cmp --silent "$CASE_BACKUP_DIR/memoryai-postgresql-cos-backup.cron" "$CASE_TARGET" || fail "installed cron differs from template"
[[ "$(PATH="$fakebin:$PATH" stat -c '%a' "$CASE_TARGET")" == 644 ]] || fail "installed cron mode is not 644"
backup_count="$(find "$(dirname "$CASE_TARGET")" -type f -name 'memoryai-postgresql-cos-backup.backup.*' | wc -l)"
[[ "$backup_count" == 1 ]] || fail "timestamped cron backup was not created"
grep -F 'CRON_INSTALLED' "$CASE_ROOT/stdout" >/dev/null || fail "installation success marker missing"

prepare_case install-missing-log
rm -f "$CASE_LOG"
run_installer
[[ "$CASE_RC" == 0 ]] || fail "installer did not create a missing protected coscmd log"
[[ -f "$CASE_LOG" && ! -L "$CASE_LOG" ]] || fail "created coscmd log is not a regular file"
[[ "$(PATH="$fakebin:$PATH" stat -c '%a' "$CASE_LOG")" == 600 ]] || fail "created coscmd log mode is not 600"

printf 'PASS PostgreSQL COS backup cron installer tests\n'
