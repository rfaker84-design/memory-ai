#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_script="$repo_root/scripts/backup/postgresql-to-cos.sh"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
assert_contains() { grep -F -- "$2" "$1" >/dev/null || fail "$3"; }
assert_not_contains() { ! grep -F -- "$2" "$1" >/dev/null || fail "$3"; }

sandbox="$tmp/sandbox"
fakebin="$tmp/fakebin"
mkdir -p "$sandbox/etc/memoryai" "$sandbox/var/log/memoryai" "$sandbox/run/lock" "$sandbox/usr/local/sbin" "$fakebin"
config="$sandbox/etc/memoryai/coscmd-backup.conf"
coslog="$sandbox/var/log/memoryai/coscmd-backup.log"
lock="$sandbox/run/lock/memoryai-postgresql-cos-backup.lock"
hook="$sandbox/usr/local/sbin/memoryai-backup-alert"
printf '[common]\nsecret_id = fake\nsecret_key = fake\nbucket = fake\nregion = fake\n' > "$config"
chmod 600 "$config"

test_script="$tmp/postgresql-to-cos.sh"
sed \
  -e "s|/etc/memoryai/coscmd-backup.conf|$config|g" \
  -e "s|/var/log/memoryai/coscmd-backup.log|$coslog|g" \
  -e "s|/run/lock/memoryai-postgresql-cos-backup.lock|$lock|g" \
  -e "s|/usr/local/sbin/memoryai-backup-alert|$hook|g" \
  "$source_script" > "$test_script"
chmod 700 "$test_script"

cat > "$fakebin/sudo" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_SUDO_CAPTURE"
printf 'fake-postgresql-dump\n'
EOF
cat > "$fakebin/install" <<'EOF'
#!/usr/bin/env bash
while [[ "$1" == -* || "$1" =~ ^[0-9]+$ ]]; do shift; done
mkdir -p "$@"
EOF
cat > "$fakebin/stat" <<'EOF'
#!/usr/bin/env bash
case "$2" in
  %U:%G)
    if [[ "${FAKE_CONFIG_OWNER_BAD:-0}" == 1 && "$3" == *coscmd-backup.conf ]]; then printf 'nobody:nogroup\n'
    else printf 'root:root\n'; fi
    ;;
  %a)
    if [[ "${FAKE_CONFIG_INSECURE:-0}" == 1 && "$3" == *coscmd-backup.conf ]]; then printf '644\n'
    elif [[ "$3" == *memoryai-backup-alert ]]; then printf '700\n'
    else printf '600\n'; fi
    ;;
  *) exec /usr/bin/stat "$@" ;;
esac
EOF
cat > "$fakebin/pg_restore" <<'EOF'
#!/usr/bin/env bash
exit "${FAKE_PG_RESTORE_RC:-0}"
EOF
cat > "$fakebin/flock" <<'EOF'
#!/usr/bin/env bash
[[ "${FAKE_LOCK_CONFLICT:-0}" == 1 ]] && exit 1
exit 0
EOF
cat > "$fakebin/logger" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_LOGGER_CAPTURE"
EOF
cat > "$fakebin/coscmd" <<'EOF'
#!/usr/bin/env bash
printf 'HOME=%s TENCENT_SECRET_ID=%s ARGS=%s\n' "${HOME:-}" "${TENCENT_SECRET_ID:-}" "$*" >> "$FAKE_COSCMD_CAPTURE"
action=""
for arg in "$@"; do
  case "$arg" in upload|download|list|delete) action="$arg"; break;; esac
done
[[ "${FAKE_COSCMD_FAILURE:-}" == "$action" ]] && exit 9
case "$action" in
  upload)
    while [[ "$1" != upload ]]; do shift; done
    printf '%s' "$2" > "$FAKE_UPLOAD_SOURCE"
    ;;
  download)
    while [[ "$1" != download ]]; do shift; done
    source="$(cat "$FAKE_UPLOAD_SOURCE")"
    if [[ "${FAKE_HASH_MISMATCH:-0}" == 1 ]]; then printf 'corrupt\n' > "$3"; else cp "$source" "$3"; fi
    ;;
esac
EOF
chmod 700 "$fakebin"/*

cat > "$hook" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$1" >> "$FAKE_ALERT_CAPTURE"
EOF
chmod 700 "$hook"

run_case() {
  local name="$1" mode="${2:-success}" root bucket region
  root="$tmp/$name/backups"
  bucket="memoryai-pg-backup-prod-1442603693"
  region="ap-guangzhou"
  [[ "$mode" == wrong-bucket ]] && bucket="wrong-backup-bucket-1442603693"
  [[ "$mode" == placeholder-bucket ]] && bucket="replace-with-private-backup-bucket-appid"
  [[ "$mode" == wrong-region ]] && region="ap-beijing"
  mkdir -p "$root"
  : > "$tmp/$name-coscmd.log"
  : > "$tmp/$name-sudo.log"
  : > "$tmp/$name-logger.log"
  : > "$tmp/$name-alert.log"
  set +e
  PATH="$fakebin:$PATH" \
  MEMORYAI_PG_BACKUP_ROOT="$root" \
  COS_BACKUP_BUCKET="$bucket" \
  COS_BACKUP_REGION="$region" \
  TENCENT_SECRET_ID="must-be-unset" \
  FAKE_COSCMD_CAPTURE="$tmp/$name-coscmd.log" \
  FAKE_SUDO_CAPTURE="$tmp/$name-sudo.log" \
  FAKE_LOGGER_CAPTURE="$tmp/$name-logger.log" \
  FAKE_ALERT_CAPTURE="$tmp/$name-alert.log" \
  FAKE_UPLOAD_SOURCE="$tmp/$name-upload-source" \
  FAKE_COSCMD_FAILURE="$([[ "$mode" == upload-failure ]] && printf upload || ([[ "$mode" == download-failure ]] && printf download || true))" \
  FAKE_HASH_MISMATCH="$([[ "$mode" == hash-mismatch ]] && printf 1 || printf 0)" \
  FAKE_LOCK_CONFLICT="$([[ "$mode" == lock-conflict ]] && printf 1 || printf 0)" \
  FAKE_CONFIG_INSECURE="$([[ "$mode" == insecure-config ]] && printf 1 || printf 0)" \
  FAKE_CONFIG_OWNER_BAD="$([[ "$mode" == bad-owner ]] && printf 1 || printf 0)" \
  "$test_script" > "$tmp/$name-stdout.log" 2> "$tmp/$name-stderr.log"
  CASE_RC=$?
  set -e
  CASE_ROOT="$root"
}

# Production paths and no remote retention commands are enforced statically.
grep -F 'readonly coscmd_config="/etc/memoryai/coscmd-backup.conf"' "$source_script" >/dev/null || fail "fixed config path missing"
grep -F 'readonly coscmd_log="/var/log/memoryai/coscmd-backup.log"' "$source_script" >/dev/null || fail "fixed coscmd log path missing"
assert_not_contains "$source_script" 'coscmd list' "remote list must not exist"
assert_not_contains "$source_script" 'coscmd delete' "remote delete must not exist"
assert_not_contains "$source_script" 'eval ' "arbitrary alert command evaluation must not exist"
assert_not_contains "$repo_root/scripts/postgresql/cos-upload.sh" 'coscmd ' "legacy helper retains a second coscmd implementation"
assert_contains "$repo_root/scripts/postgresql/cos-upload.sh" 'postgresql-to-cos.sh' "legacy helper does not delegate to canonical entrypoint"
cron="$repo_root/scripts/backup/memoryai-postgresql-cos-backup.cron"
assert_contains "$cron" 'HOME=/nonexistent' "cron HOME is not isolated"
assert_contains "$cron" 'CRON_TZ=UTC' "cron timezone is not UTC"
assert_contains "$cron" 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' "cron PATH is not fixed"
assert_contains "$cron" '/scripts/backup/postgresql-to-cos.sh' "cron does not call canonical entrypoint"
assert_contains "$cron" '30 2 * * * root' "cron schedule is not 02:30 UTC"
assert_contains "$cron" 'COS_BACKUP_BUCKET=memoryai-pg-backup-prod-1442603693' "cron bucket is not production"
assert_contains "$cron" 'COS_BACKUP_REGION=ap-guangzhou' "cron region is not production"
assert_not_contains "$cron" 'replace-with-private-backup-bucket-appid' "cron retains the bucket placeholder"
assert_not_contains "$cron" 'scripts/postgresql/cos-upload.sh' "cron calls the legacy helper"
if grep -Ev '^[[:space:]]*(#|$)' "$cron" | grep -F 'flock ' >/dev/null; then fail "cron contains a second flock"; fi

run_case success
if [[ "$CASE_RC" != 0 ]]; then
  sed 's/^/STDERR: /' "$tmp/success-stderr.log" >&2
  sed 's/^/EVENT: /' "$CASE_ROOT/logs/backup-cos.log" >&2 || true
  fail "success case exited $CASE_RC"
fi
[[ "$(wc -l < "$tmp/success-coscmd.log")" == 2 ]] || fail "expected one upload and one verification download"
while IFS= read -r call; do
  if [[ "$call" != *"ARGS=-c $config -l $coslog -b memoryai-pg-backup-prod-1442603693 -r ap-guangzhou "* ]]; then
    printf 'CALL: %s\n' "$call" >&2
    fail "coscmd call missing explicit global flags"
  fi
done < "$tmp/success-coscmd.log"
assert_contains "$tmp/success-coscmd.log" 'HOME=/nonexistent' "HOME was not isolated"
assert_contains "$tmp/success-coscmd.log" 'TENCENT_SECRET_ID=' "generic credential was not removed"
assert_not_contains "$tmp/success-coscmd.log" '.cos.conf' "default coscmd config was referenced"
assert_not_contains "$tmp/success-coscmd.log" ' delete ' "remote delete was invoked"
assert_not_contains "$tmp/success-coscmd.log" ' list ' "remote list was invoked"
assert_not_contains "$CASE_ROOT/logs/backup-cos.log" 'must-be-unset' "generic credential leaked to event log"

for mode in wrong-bucket wrong-region placeholder-bucket; do
  run_case "$mode" "$mode"
  [[ "$CASE_RC" == 2 ]] || fail "$mode did not fail closed"
  [[ ! -s "$tmp/$mode-coscmd.log" ]] || fail "coscmd ran for $mode"
  [[ ! -s "$tmp/$mode-sudo.log" ]] || fail "pg_dump ran for $mode"
done

run_case upload_failure upload-failure
[[ "$CASE_RC" == 9 ]] || fail "upload failure did not propagate exact exit code"
assert_contains "$CASE_ROOT/logs/backup-cos.log" 'ALERT stage=cos-upload rc=9' "upload failure alert missing"
assert_contains "$tmp/upload_failure-alert.log" 'stage=cos-upload rc=9' "external alert hook did not run"

run_case download_failure download-failure
[[ "$CASE_RC" == 9 ]] || fail "download failure did not propagate exact exit code"
assert_contains "$CASE_ROOT/logs/backup-cos.log" 'ALERT stage=cos-download-verification rc=9' "download failure alert missing"

run_case hash_mismatch hash-mismatch
[[ "$CASE_RC" != 0 ]] || fail "hash mismatch reported success"
assert_contains "$CASE_ROOT/logs/backup-cos.log" 'ALERT stage=hash-verification rc=1' "hash mismatch stage alert missing"

run_case lock_conflict lock-conflict
[[ "$CASE_RC" == 75 ]] || fail "lock conflict did not return 75"
[[ ! -s "$tmp/lock_conflict-coscmd.log" ]] || fail "coscmd ran despite lock conflict"
assert_contains "$tmp/lock_conflict-alert.log" 'stage=lock rc=75' "lock conflict external alert missing"

# An insecure dedicated config must fail before coscmd.
run_case insecure_config insecure-config
[[ "$CASE_RC" == 2 ]] || fail "insecure config did not fail closed"
[[ ! -s "$tmp/insecure_config-coscmd.log" ]] || fail "coscmd ran with insecure config"

run_case bad_owner bad-owner
[[ "$CASE_RC" == 2 ]] || fail "non-root config owner did not fail closed"
[[ ! -s "$tmp/bad_owner-coscmd.log" ]] || fail "coscmd ran with non-root-owned config"

printf 'PASS postgresql-to-cos hardening tests\n'
