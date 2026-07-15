#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly RUNNER="$SCRIPT_DIR/run-006-auth-pg14-matrix.sh"
readonly TMP_ROOT="$(mktemp -d)"
readonly FAKE_BIN="$TMP_ROOT/bin"
readonly FAKE_DB_DIR="$TMP_ROOT/databases"
readonly FAKE_LOG="$TMP_ROOT/commands.log"
readonly HOLDER_MARKER="$TMP_ROOT/holder.locked"
LAST_STATE=""
LAST_OUTPUT=""
LAST_RC=0

cleanup() { rm -rf -- "$TMP_ROOT"; }
trap cleanup EXIT INT TERM
mkdir -p "$FAKE_BIN" "$FAKE_DB_DIR"

cat >"$FAKE_BIN/createdb" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
database="${*: -1}"
printf 'createdb\t%s\n' "$database" >>"$FAKE_LOG"
: >"$FAKE_DB_DIR/$database"
FAKE

cat >"$FAKE_BIN/dropdb" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
database="${*: -1}"
printf 'dropdb\t%s\n' "$database" >>"$FAKE_LOG"
[[ "${FAKE_DROPDB_FAIL:-0}" != "1" ]] || exit 92
[[ "${FAKE_DATABASE_STILL_EXISTS:-0}" == "1" ]] || rm -f -- "$FAKE_DB_DIR/$database"
FAKE

cat >"$FAKE_BIN/psql" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'psql' >>"$FAKE_LOG"
printf '\t%s' "$@" >>"$FAKE_LOG"
printf '\n' >>"$FAKE_LOG"
joined=" $* "

argument_value() {
  local prefix="$1" argument
  shift
  for argument in "$@"; do
    [[ "$argument" == "$prefix"* ]] && { printf '%s' "${argument#*=}"; return 0; }
  done
  return 1
}

if [[ "$joined" == *" SHOW server_version_num; "* ]]; then printf '140023\n'; exit 0; fi
if [[ "$joined" == *"pg_terminate_backend"* ]]; then
  [[ "${FAKE_TERMINATE_FAIL:-0}" != "1" ]] || exit 91
  exit 0
fi
if [[ "$joined" == *"FROM pg_catalog.pg_database WHERE datname LIKE"* ]]; then
  prefix="$(argument_value matrix_prefix= "$@")"
  prefix="${prefix%%%}"
  find "$FAKE_DB_DIR" -maxdepth 1 -type f -name "${prefix}*" | wc -l | tr -d ' '
  exit 0
fi
if [[ "$joined" == *"FROM pg_catalog.pg_database WHERE datname ="* ]]; then
  database="$(argument_value matrix_db= "$@")"
  if [[ "${FAKE_DATABASE_STILL_EXISTS:-0}" == "1" || -e "$FAKE_DB_DIR/$database" ]]; then printf '1\n'; else printf '0\n'; fi
  exit 0
fi
if [[ "$joined" == *"FROM pg_catalog.pg_stat_activity WHERE datname ="* ]]; then
  printf '%s\n' "${FAKE_CONNECTIONS_REMAIN:-0}"
  exit 0
fi
if [[ "$joined" == *"FROM pg_catalog.pg_locks"* && "$joined" == *"AccessExclusiveLock"* ]]; then
  [[ -e "$HOLDER_MARKER" ]] && printf '1\n' || printf '0\n'
  exit 0
fi
if [[ "$joined" == *"FROM pg_catalog.pg_stat_activity WHERE application_name"* ]]; then printf '0\n'; exit 0; fi
if [[ "$joined" == *"pg_sleep(30)"* ]]; then
  trap 'rm -f -- "$HOLDER_MARKER"; exit 0' TERM INT EXIT
  : >"$HOLDER_MARKER"
  sleep 4
  exit 0
fi
if [[ "$joined" == *"UNION ALL SELECT 'constraint'"* ]]; then printf 'catalog-snapshot\n'; exit 0; fi
if [[ "$joined" == *"001_memoryai_core.sql"* && "${FAKE_FIXTURE_FAILURE:-0}" == "1" ]]; then
  printf 'ERROR: fixture failure\n' >&2
  exit 42
fi
if [[ "$joined" == *"006_auth_verification_challenges.sql"* ]]; then
  database="$(argument_value -d= "$@" 2>/dev/null || true)"
  if [[ -z "$database" ]]; then
    previous=""
    for argument in "$@"; do [[ "$previous" == "-d" ]] && database="$argument"; previous="$argument"; done
  fi
  case "${FAKE_006_MODE:-exact}" in
    exact) printf 'ERROR: 006 challenge_id check failed: atttypid must be uuid, got 25\n' >&2; exit 1 ;;
    object-mismatch) printf 'ERROR: 006 other_field check failed: atttypid must be uuid\n' >&2; exit 1 ;;
    category-mismatch) printf 'ERROR: 006 challenge_id check failed: default is missing\n' >&2; exit 1 ;;
    unrelated) printf 'ERROR: 006 challenge_id permission denied\n' >&2; exit 1 ;;
    success) exit 0 ;;
    lock)
      counter="$FAKE_DB_DIR/.006-${database}"
      count=0; [[ -f "$counter" ]] && count="$(<"$counter")"
      count=$((count + 1)); printf '%s' "$count" >"$counter"
      if [[ "$count" -eq 1 ]]; then exit 0; fi
      sleep 2
      printf 'CREATE TABLE public.auth_verification_challenges (...);\nERROR: canceling statement due to lock timeout\n' >&2
      exit 1
      ;;
    lock-hang)
      counter="$FAKE_DB_DIR/.006-${database}"
      count=0; [[ -f "$counter" ]] && count="$(<"$counter")"
      count=$((count + 1)); printf '%s' "$count" >"$counter"
      [[ "$count" -eq 1 ]] && exit 0
      sleep 5
      exit 1
      ;;
    self-term|self-int)
      signal=TERM; [[ "${FAKE_006_MODE}" == "self-int" ]] && signal=INT
      pid="$PPID"; target=""
      while [[ "$pid" =~ ^[0-9]+$ && "$pid" -gt 1 && -r "/proc/$pid/stat" ]]; do
        command_line="$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null || true)"
        [[ "$command_line" == *"run-006-auth-pg14-matrix.sh"* ]] && target="$pid"
        pid="$(awk '{ print $4 }' "/proc/$pid/stat")"
      done
      [[ -n "$target" ]] || exit 99
      kill -"$signal" "$target"
      sleep 0.2
      exit 143
      ;;
  esac
fi
exit 0
FAKE

chmod +x "$FAKE_BIN/createdb" "$FAKE_BIN/dropdb" "$FAKE_BIN/psql"

fail_test() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
assert_contains() { grep -Fq -- "$2" "$1" || fail_test "$1 does not contain $2"; }
assert_not_contains() { ! grep -Fq -- "$2" "$1" || fail_test "$1 unexpectedly contains $2"; }

run_fake() {
  local name="$1" scenario="$2" mode="$3" root rc state_mode
  root="$TMP_ROOT/runtime-$name"
  shift 3
  rm -rf -- "$root"
  mkdir "$root"
  chmod 700 "$root"
  : >"$FAKE_LOG"
  LAST_OUTPUT="$TMP_ROOT/$name.out"
  set +e
  env PSQL="$FAKE_BIN/psql" CREATEDB="$FAKE_BIN/createdb" DROPDB="$FAKE_BIN/dropdb" \
    FAKE_LOG="$FAKE_LOG" FAKE_DB_DIR="$FAKE_DB_DIR" HOLDER_MARKER="$HOLDER_MARKER" \
    FAKE_006_MODE="$mode" MEMORYAI_AUTH_TEST_ALLOW=I_UNDERSTAND_LOCAL_PG14 \
    MEMORYAI_AUTH_TEST_ADMIN_DB=postgres MATRIX_TEST_MODE=1 MATRIX_TEST_ALLOW_WINDOWS_ACL=1 MATRIX_TEST_ROOT="$root" \
    MATRIX_RUN_ID="test_${name}_$RANDOM" MATRIX_ONLY_SCENARIO="$scenario" PGHOST=127.0.0.1 \
    "$@" "$RUNNER" >"$LAST_OUTPUT" 2>&1
  rc=$?
  set -e
  LAST_RC="$rc"
  LAST_STATE="$(find "$root" -maxdepth 1 -type f -name '*.state.*' -print -quit)"
  [[ -n "$LAST_STATE" ]] || fail_test "$name did not retain a state file"
  state_mode="$(stat -c '%a' "$LAST_STATE")"
  [[ "$state_mode" == "600" || ( "$(uname -s)" == MINGW* && "$state_mode" == "644" ) ]] || fail_test "$name state mode is unsafe"
  [[ "$(find "$root" -maxdepth 1 -type d -name 'memoryai-auth-pg14-matrix.*' | wc -l | tr -d ' ')" == "0" ]] || fail_test "$name left a work directory"
  return "$rc"
}

list_output="$TMP_ROOT/list.tsv"
"$RUNNER" --list >"$list_output"
[[ "$(wc -l <"$list_output" | tr -d ' ')" == "79" ]] || fail_test "--list must contain 79 scenarios"
[[ "$(cut -f1 "$list_output" | sort -u | wc -l | tr -d ' ')" == "79" ]] || fail_test "scenario names are not unique"
[[ "$(cut -f4 "$list_output" | sort -u | wc -l | tr -d ' ')" == "79" ]] || fail_test "database names are not unique"
awk -F '\t' 'NF != 6 || length($4) > 63 || $4 !~ /^memoryai_auth_negative_[0-9a-f]{8}_[0-9]{2}_[a-z0-9_]{1,8}_[0-9a-f]{8}$/ { exit 1 }' "$list_output" || fail_test "--list database format contract failed"

dry_root="$TMP_ROOT/dry-root"
: >"$FAKE_LOG"
dry_output="$TMP_ROOT/dry.tsv"
env PSQL="$FAKE_BIN/psql" CREATEDB="$FAKE_BIN/createdb" DROPDB="$FAKE_BIN/dropdb" \
  FAKE_LOG="$FAKE_LOG" MATRIX_TEST_MODE=1 MATRIX_TEST_ALLOW_WINDOWS_ACL=1 MATRIX_TEST_ROOT="$dry_root" "$RUNNER" --dry-run >"$dry_output"
[[ "$(wc -l <"$dry_output" | tr -d ' ')" == "79" ]] || fail_test "--dry-run must plan 79 scenarios"
[[ ! -e "$dry_root" ]] || fail_test "--dry-run wrote or deleted a runtime path"
[[ ! -s "$FAKE_LOG" ]] || fail_test "--dry-run called a database command"

run_fake exact challenge_id_type exact || fail_test "exact object/category rejection stopped the matrix"
for status in STARTED SCENARIO_DATABASE SCENARIO_STARTED EXPECTED_REJECTION_PASS CLEANUP_PASS COMPLETE; do assert_contains "$LAST_STATE" "$status"; done
[[ "$(grep -c $'SCENARIO_DATABASE ' "$LAST_STATE")" == "79" ]] || fail_test "state mapping does not contain 79 scenarios"

if run_fake object-mismatch challenge_id_type object-mismatch; then fail_test "wrong object passed"; fi
assert_contains "$LAST_STATE" "FAILED_object_mismatch_71"
if run_fake category-mismatch challenge_id_type category-mismatch; then fail_test "wrong category passed"; fi
assert_contains "$LAST_STATE" "FAILED_category_mismatch_71"
if run_fake unrelated challenge_id_type unrelated; then fail_test "unrelated error passed"; fi
assert_contains "$LAST_STATE" "FAILED_unrelated_error_71"
if run_fake unexpected-success challenge_id_type success; then fail_test "unexpected success passed"; fi
assert_contains "$LAST_STATE" "FAILED_unexpected_success_70"

fixture_rc=0
if run_fake original-rc challenge_id_type exact FAKE_FIXTURE_FAILURE=1; then
  fail_test "fixture failure returned success"
else
  fixture_rc=$?
fi
[[ "$fixture_rc" == "42" ]] || fail_test "original fixture exit code was not preserved: $fixture_rc"
assert_contains "$LAST_STATE" "FAILED_challenge_id_type_create_42"
assert_contains "$LAST_STATE" "CLEANUP_PASS"

for cleanup_case in terminate dropdb exists connections; do
  extra=()
  case "$cleanup_case" in
    terminate) extra=(FAKE_TERMINATE_FAIL=1) ;;
    dropdb) extra=(FAKE_DROPDB_FAIL=1) ;;
    exists) extra=(FAKE_DATABASE_STILL_EXISTS=1) ;;
    connections) extra=(FAKE_CONNECTIONS_REMAIN=1) ;;
  esac
  if run_fake "cleanup-$cleanup_case" challenge_id_type exact "${extra[@]}"; then fail_test "$cleanup_case cleanup failure returned success"; fi
  assert_contains "$LAST_STATE" "FAILED_cleanup_"
  rm -f -- "$FAKE_DB_DIR"/*
done

run_fake lock lock_timeout lock || fail_test "lock handshake/timeout scenario failed"
assert_contains "$LAST_STATE" "LOCK_GRANTED lock_timeout"
assert_contains "$LAST_STATE" "EXPECTED_REJECTION_PASS lock_timeout elapsed_ms="
lock_elapsed="$(sed -n 's/.*EXPECTED_REJECTION_PASS lock_timeout elapsed_ms=//p' "$LAST_STATE" | tail -1)"
[[ "$lock_elapsed" =~ ^[0-9]+$ && "$lock_elapsed" -ge 1500 && "$lock_elapsed" -le 6000 ]] || fail_test "lock elapsed range failed: $lock_elapsed"
[[ ! -e "$HOLDER_MARKER" ]] || fail_test "lock holder marker remained"

if run_fake lock-external-timeout lock_timeout lock-hang MATRIX_TEST_LOCK_EXTERNAL_TIMEOUT=1; then
  fail_test "external lock timeout returned success"
fi
assert_contains "$LAST_STATE" "FAILED_external_timeout_79"
assert_contains "$LAST_STATE" "CLEANUP_PASS"

if run_fake term challenge_id_type self-term; then fail_test "TERM returned success"; fi
assert_contains "$LAST_STATE" "FAILED_signal_TERM_143"
assert_contains "$LAST_STATE" "CLEANUP_PASS"
if run_fake int challenge_id_type self-int; then fail_test "INT returned success"; fi
assert_contains "$LAST_STATE" "FAILED_signal_INT_130"
assert_contains "$LAST_STATE" "CLEANUP_PASS"

behavior_cases=(
  phone_hash_len63 phone_hash_len64 phone_hash_len65 phone_hash_nonhex phone_hash_uppercase
  code_digest_len63 code_digest_len64 code_digest_len65 code_digest_nonhex code_digest_uppercase
  request_ip_hash_len63 request_ip_hash_len64 request_ip_hash_len65 request_ip_hash_nonhex request_ip_hash_uppercase
  purpose_sign_in purpose_other attempts_negative max_attempts_zero attempts_over_max attempts_zero attempts_equal_max
  timing_resend_equal_created timing_expires_equal_resend timing_strictly_increasing
  consumed_null consumed_equal_created consumed_before_created
  provider_null provider_len1 provider_len128 provider_empty provider_len129
)
[[ "${#behavior_cases[@]}" == "33" ]] || fail_test "behavior boundary count changed"
for behavior_case in "${behavior_cases[@]}"; do grep -Fq -- "$behavior_case" "$RUNNER" || fail_test "missing behavior boundary $behavior_case"; done

printf 'run-006-auth-pg14-matrix fake CLI tests: PASS\n'
