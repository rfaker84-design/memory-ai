#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly RUNNER="$SCRIPT_DIR/run-006-auth-pg14-matrix.sh"
readonly TMP_ROOT="$(mktemp -d)"
readonly FAKE_BIN="$TMP_ROOT/bin"
readonly FAKE_DB_DIR="$TMP_ROOT/databases"
readonly FAKE_LOG="$TMP_ROOT/commands.log"

cleanup() {
  rm -rf -- "$TMP_ROOT"
}
trap cleanup EXIT INT TERM

mkdir -p "$FAKE_BIN" "$FAKE_DB_DIR"
: >"$FAKE_LOG"

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
rm -f -- "$FAKE_DB_DIR/$database"
FAKE

cat >"$FAKE_BIN/psql" <<'FAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'psql' >>"$FAKE_LOG"
printf '\t%s' "$@" >>"$FAKE_LOG"
printf '\n' >>"$FAKE_LOG"

joined=" $* "
if [[ "$joined" == *" SHOW server_version_num; "* ]]; then
  printf '140023\n'
  exit 0
fi
if [[ "$joined" == *"SELECT count(*) FROM pg_catalog.pg_database"* ]]; then
  find "$FAKE_DB_DIR" -maxdepth 1 -type f | wc -l | tr -d ' '
  exit 0
fi
if [[ "$joined" == *"UNION ALL SELECT 'constraint'"* ]]; then
  printf 'catalog-snapshot\n'
  exit 0
fi
if [[ "$joined" == *"001_memoryai_core.sql"* && "${FAKE_FIXTURE_FAILURE:-0}" == "1" ]]; then
  printf 'ERROR: fixture failure\n' >&2
  exit 42
fi
if [[ "$joined" == *"006_auth_verification_challenges.sql"* ]]; then
  case "${FAKE_006_MODE:-reject}" in
    reject)
      printf 'ERROR: 006 challenge_id check failed: type must be uuid\n' >&2
      exit 1
      ;;
    mismatch)
      printf 'ERROR: unrelated database failure\n' >&2
      exit 1
      ;;
    success)
      exit 0
      ;;
    self-term)
      printf 'migration-started\n' >>"$FAKE_LOG"
      pid="$PPID"
      target=""
      while [[ "$pid" =~ ^[0-9]+$ && "$pid" -gt 1 && -r "/proc/$pid/stat" ]]; do
        command_line="$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null || true)"
        [[ "$command_line" == *"run-006-auth-pg14-matrix.sh"* ]] && target="$pid"
        pid="$(awk '{ print $4 }' "/proc/$pid/stat")"
      done
      [[ -n "$target" ]] || { printf 'ERROR: runner ancestor not found\n' >&2; exit 99; }
      kill -TERM "$target"
      sleep 0.2
      exit 143
      ;;
  esac
fi
exit 0
FAKE

chmod +x "$FAKE_BIN/createdb" "$FAKE_BIN/dropdb" "$FAKE_BIN/psql"

fail_test() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_contains() {
  local file="$1" text="$2"
  grep -Fq -- "$text" "$file" || fail_test "$file does not contain $text"
}

assert_not_contains() {
  local file="$1" text="$2"
  ! grep -Fq -- "$text" "$file" || fail_test "$file unexpectedly contains $text"
}

run_fake() {
  local state_file="$1" output_file="$2"
  shift 2
  env \
    PSQL="$FAKE_BIN/psql" \
    CREATEDB="$FAKE_BIN/createdb" \
    DROPDB="$FAKE_BIN/dropdb" \
    FAKE_LOG="$FAKE_LOG" \
    FAKE_DB_DIR="$FAKE_DB_DIR" \
    MEMORYAI_AUTH_TEST_ALLOW=I_UNDERSTAND_LOCAL_PG14 \
    MEMORYAI_AUTH_TEST_ADMIN_DB=postgres \
    MATRIX_RUN_ID="test_$RANDOM" \
    MATRIX_STATE_FILE="$state_file" \
    MATRIX_ONLY_SCENARIO=challenge_id_type \
    PGHOST=127.0.0.1 \
    "$@" "$RUNNER" >"$output_file" 2>&1
}

list_output="$TMP_ROOT/list.tsv"
"$RUNNER" --list >"$list_output"
[[ "$(wc -l <"$list_output" | tr -d ' ')" == "79" ]] || fail_test "--list must contain exactly 79 scenarios"
[[ "$(cut -f1 "$list_output" | sort -u | wc -l | tr -d ' ')" == "79" ]] || fail_test "--list scenario names must be unique"
awk -F '\t' 'NF != 3 { exit 1 }' "$list_output" || fail_test "--list rows must have name, category, and expected result"

: >"$FAKE_LOG"
dry_output="$TMP_ROOT/dry-run.tsv"
env PSQL="$FAKE_BIN/psql" CREATEDB="$FAKE_BIN/createdb" DROPDB="$FAKE_BIN/dropdb" \
  FAKE_LOG="$FAKE_LOG" FAKE_DB_DIR="$FAKE_DB_DIR" "$RUNNER" --dry-run >"$dry_output"
[[ "$(wc -l <"$dry_output" | tr -d ' ')" == "79" ]] || fail_test "--dry-run must plan exactly 79 scenarios"
[[ ! -s "$FAKE_LOG" ]] || fail_test "--dry-run called a database command"
grep -Eq $'^PLAN\t[^\t]+\t[^\t]+\t[^\t]+\tcreate:memoryai_auth_negative_' "$dry_output" || fail_test "--dry-run plan is incomplete"

: >"$FAKE_LOG"
state="$TMP_ROOT/reject.state"
output="$TMP_ROOT/reject.out"
run_fake "$state" "$output" FAKE_006_MODE=reject || fail_test "an expected rejection stopped the matrix"
for status in STARTED SCENARIO_STARTED EXPECTED_REJECTION_PASS CLEANUP_PASS COMPLETE; do
  assert_contains "$state" "$status"
done
assert_contains "$FAKE_LOG" "createdb"
assert_contains "$FAKE_LOG" "dropdb"

: >"$FAKE_LOG"
state="$TMP_ROOT/success.state"
output="$TMP_ROOT/success.out"
if run_fake "$state" "$output" FAKE_006_MODE=success; then
  fail_test "unexpected 006 success did not stop the matrix"
fi
assert_contains "$state" "FAILED_unexpected_success_70"
assert_not_contains "$state" "COMPLETE"
assert_contains "$FAKE_LOG" "dropdb"

: >"$FAKE_LOG"
state="$TMP_ROOT/mismatch.state"
output="$TMP_ROOT/mismatch.out"
if run_fake "$state" "$output" FAKE_006_MODE=mismatch; then
  fail_test "error-class mismatch did not stop the matrix"
fi
assert_contains "$state" "FAILED_error_mismatch_71"
assert_not_contains "$state" "COMPLETE"
assert_contains "$FAKE_LOG" "dropdb"

: >"$FAKE_LOG"
state="$TMP_ROOT/failure.state"
output="$TMP_ROOT/failure.out"
if run_fake "$state" "$output" FAKE_006_MODE=reject FAKE_FIXTURE_FAILURE=1; then
  fail_test "ordinary fixture failure unexpectedly succeeded"
fi
assert_contains "$state" "FAILED_"
assert_contains "$state" "CLEANUP_PASS"
assert_contains "$FAKE_LOG" "dropdb"

: >"$FAKE_LOG"
state="$TMP_ROOT/signal.state"
output="$TMP_ROOT/signal.out"
set +e
run_fake "$state" "$output" FAKE_006_MODE=self-term
signal_rc=$?
set -e
[[ "$signal_rc" -ne 0 ]] || fail_test "TERM unexpectedly returned success"
assert_contains "$state" "FAILED_signal_TERM_143"
assert_contains "$state" "CLEANUP_PASS"
assert_contains "$FAKE_LOG" "dropdb"

printf 'run-006-auth-pg14-matrix fake CLI tests: PASS\n'
