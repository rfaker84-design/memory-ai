#!/usr/bin/env bash
set -Eeuo pipefail

readonly TEST_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly RUNNER="$TEST_SCRIPT_DIR/run-006-auth-pg14-matrix.sh"
readonly TMP_ROOT="$(mktemp -d)"
cleanup_test() { rm -rf -- "$TMP_ROOT"; }
trap cleanup_test EXIT INT TERM

fail_test() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
assert_contains() { grep -Fq -- "$2" "$1" || fail_test "$1 does not contain $2"; }
assert_rc() { [[ "$1" == "$2" ]] || fail_test "expected rc $2, got $1: $3"; }

# Formal --list uses an unoverrideable kernel UUID nonce and performs no runtime writes.
list_one="$TMP_ROOT/list-one.tsv"
list_two="$TMP_ROOT/list-two.tsv"
MATRIX_RUN_ID=same-run "$RUNNER" --list >"$list_one"
MATRIX_RUN_ID=same-run "$RUNNER" --list >"$list_two"
for list in "$list_one" "$list_two"; do
  [[ "$(wc -l <"$list" | tr -d ' ')" == "79" ]] || fail_test "--list count is not 79"
  [[ "$(cut -f1 "$list" | sort -u | wc -l | tr -d ' ')" == "79" ]] || fail_test "scenario names are not unique"
  [[ "$(cut -f4 "$list" | sort -u | wc -l | tr -d ' ')" == "79" ]] || fail_test "database names are not unique"
  awk -F '\t' 'NF != 6 || length($4) != 58 || $4 !~ /^memoryai_auth_negative_[0-9a-f]{32}_[0-9]{2}$/ { exit 1 }' "$list" || fail_test "database name format failed"
done
comm -12 <(cut -f4 "$list_one" | sort) <(cut -f4 "$list_two" | sort) >"$TMP_ROOT/formal-overlap"
[[ ! -s "$TMP_ROOT/formal-overlap" ]] || fail_test "same RUN_ID formal invocations shared database names"

# Source-time nonce injection is available only by replacing the function in a test shell.
emit_injected_names() {
  local nonce="$1" destination="$2"
  (
    # shellcheck source=run-006-auth-pg14-matrix.sh
    source "$RUNNER"
    RUN_ID="same-injected-run"
    generate_run_nonce() { RUN_NONCE="$nonce"; }
    configure_run_identity
    list_scenarios
  ) >"$destination"
}
emit_injected_names 11111111111111111111111111111111 "$TMP_ROOT/injected-one.tsv"
emit_injected_names 22222222222222222222222222222222 "$TMP_ROOT/injected-two.tsv"
comm -12 <(cut -f4 "$TMP_ROOT/injected-one.tsv" | sort) <(cut -f4 "$TMP_ROOT/injected-two.tsv" | sort) >"$TMP_ROOT/injected-overlap"
[[ ! -s "$TMP_ROOT/injected-overlap" ]] || fail_test "injected nonce database sets overlap"

for nonce_variable in MATRIX_NONCE RUN_NONCE; do
  set +e
  env "$nonce_variable=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "$RUNNER" --list >/dev/null 2>&1
  legacy_rc=$?
  set -e
  assert_rc "$legacy_rc" 64 "formal $nonce_variable injection must fail closed"
done

dry_root="$TMP_ROOT/dry-runtime-must-not-exist"
dry_output="$TMP_ROOT/dry.tsv"
dry_bin="$TMP_ROOT/dry-bin"
dry_db_log="$TMP_ROOT/dry-db.log"
mkdir "$dry_bin"
: >"$dry_db_log"
for command_name in psql createdb dropdb mktemp rm; do
  cat >"$dry_bin/$command_name" <<'DRY_COMMAND'
#!/usr/bin/env bash
printf '%s\n' "$0 $*" >>"$DRY_DB_LOG"
exit 99
DRY_COMMAND
  chmod +x "$dry_bin/$command_name"
done
DRY_DB_LOG="$dry_db_log" PATH="$dry_bin:$PATH" "$RUNNER" --dry-run >"$dry_output"
[[ "$(wc -l <"$dry_output" | tr -d ' ')" == "79" ]] || fail_test "--dry-run count is not 79"
[[ ! -e "$dry_root" ]] || fail_test "--dry-run created a runtime directory"
[[ ! -s "$dry_db_log" ]] || fail_test "--dry-run invoked a database command"

# Load definitions without executing main or installing traps.
# shellcheck source=run-006-auth-pg14-matrix.sh
trap_before_source="$(trap -p EXIT)"
source "$RUNNER"
[[ "$(trap -p EXIT)" == "$trap_before_source" ]] || fail_test "sourcing the runner changed EXIT traps"
ORIGINAL_RECORD_STATE="$(declare -f record_state)"
ORIGINAL_RUN_006_COMMAND="$(declare -f run_006_command)"
RUN_ID="source-test-run"
generate_run_nonce() { RUN_NONCE=33333333333333333333333333333333; }
configure_run_identity
validate_all_database_names
TEST_WORK="$TMP_ROOT/rejection-work"
mkdir "$TEST_WORK"
WORK_DIR="$TEST_WORK"

# Exact ERROR-record matching and SQL/CONTEXT pollution rejection.
REJECTION_MODE=exact
run_006_command() {
  local database="$1" stdout_file="$2" stderr_file="$3"
  : >"$stdout_file"
  case "$REJECTION_MODE" in
    exact)
      printf 'ERROR: 006 challenge_id check failed: atttypid must be uuid, got 25\n' >"$stderr_file" ;;
    echoed_sql_other_error)
      printf 'CREATE challenge_id atttypid must be uuid;\nERROR: 006 other_field default is missing\n' >"$stderr_file" ;;
    object_error_category_sql)
      printf 'SQL atttypid must be uuid\nERROR: 006 challenge_id default is missing\n' >"$stderr_file" ;;
    category_error_object_context)
      printf 'ERROR: 006 other_field atttypid must be uuid\nCONTEXT: challenge_id\n' >"$stderr_file" ;;
    multiple_errors)
      printf 'ERROR: 006 challenge_id atttypid must be uuid\nERROR: 006 challenge_id atttypid must be uuid\n' >"$stderr_file" ;;
    psql_error)
      printf 'psql: error: could not connect\nERROR: 006 challenge_id atttypid must be uuid\n' >"$stderr_file" ;;
  esac
  return 1
}
exact_db="${SCENARIO_DATABASES[challenge_id_type]}"
expect_006_rejection "$exact_db" challenge_id_type
for mode in echoed_sql_other_error object_error_category_sql category_error_object_context multiple_errors psql_error; do
  REJECTION_MODE="$mode"
  set +e
  ( expect_006_rejection "$exact_db" challenge_id_type ) >/dev/null 2>&1
  rejection_rc=$?
  set -e
  [[ "$rejection_rc" -ne 0 ]] || fail_test "pollution mode $mode incorrectly passed"
done

eval "$ORIGINAL_RUN_006_COMMAND"

# The command boundary itself is capped; the formal lock path keeps its fixed 8-second value.
grep -Fq 'external_timeout=8' "$RUNNER" || fail_test "formal lock external timeout is not fixed at 8 seconds"
timeout_bin="$TMP_ROOT/timeout-bin"
mkdir "$timeout_bin"
cat >"$timeout_bin/psql" <<'FAKE_TIMEOUT'
#!/usr/bin/env bash
sleep 5
FAKE_TIMEOUT
chmod +x "$timeout_bin/psql"
ORIGINAL_PATH="$PATH"
PATH="$timeout_bin:$PATH"
set +e
run_006_command "$exact_db" "$TMP_ROOT/timeout.stdout" "$TMP_ROOT/timeout.stderr" 1
external_timeout_rc=$?
set -e
PATH="$ORIGINAL_PATH"
assert_rc "$external_timeout_rc" 124 "external timeout command boundary"

# cleanup_or_fail returns exactly 75 for each failure class.
CLEANUP_STATE="$TMP_ROOT/cleanup.state"
record_state() { printf '%s\n' "$1" >>"$CLEANUP_STATE"; }
CLEANUP_MODE=success
DROP_SUCCEEDED=0
PREEXISTING_NAMES=0
admin_psql() {
  local joined=" $* " database
  if [[ "$joined" == *"pg_terminate_backend"* ]]; then
    [[ "$CLEANUP_MODE" == terminate ]] && return 91
    return 0
  fi
  if [[ "$joined" == *"FROM pg_catalog.pg_stat_activity WHERE datname"* ]]; then
    [[ "$CLEANUP_MODE" == connections ]] && printf '1\n' || printf '0\n'
    return 0
  fi
  if [[ "$joined" == *"ANY(pg_catalog.string_to_array"* ]]; then printf '%s\n' "$PREEXISTING_NAMES"; return 0; fi
  if [[ "$joined" == *"FROM pg_catalog.pg_database WHERE datname ="* ]]; then
    if [[ "$CLEANUP_MODE" == exists || "$CLEANUP_MODE" == dropdb ]]; then printf '1\n'; else printf '0\n'; fi
    return 0
  fi
  if [[ "$joined" == *"FROM pg_catalog.pg_database WHERE datname LIKE"* ]]; then printf '0\n'; return 0; fi
  printf '0\n'
}
drop_database_command() {
  [[ "$CLEANUP_MODE" == dropdb ]] && return 92
  DROP_SUCCEEDED=1
  return 0
}

cleanup_db="${SCENARIO_DATABASES[challenge_id_nullable]}"
for mode in terminate dropdb exists connections; do
  : >"$CLEANUP_STATE"
  CLEANUP_MODE="$mode"
  CREATED_DATABASES=("$cleanup_db")
  if cleanup_or_fail "$cleanup_db"; then cleanup_rc=0; else cleanup_rc=$?; fi
  assert_rc "$cleanup_rc" 75 "$mode cleanup failure"
  assert_contains "$CLEANUP_STATE" "FAILED_cleanup_"
done

PREEXISTING_NAMES=1
set +e
( assert_all_database_names_absent ) >/dev/null 2>&1
preexisting_names_rc=$?
set -e
assert_rc "$preexisting_names_rc" 74 "pre-existing matrix database names"
PREEXISTING_NAMES=0

create_database_command() { return 17; }
CREATED_DATABASES=()
set +e
( create_database "$cleanup_db" ) >/dev/null 2>&1
createdb_collision_rc=$?
set -e
assert_rc "$createdb_collision_rc" 84 "createdb atomic collision"
[[ "${#CREATED_DATABASES[@]}" == "0" ]] || fail_test "failed createdb entered the created database set"

# A pre-existing business failure remains authoritative when cleanup also fails.
: >"$CLEANUP_STATE"
CLEANUP_MODE=dropdb
CREATED_DATABASES=("$cleanup_db")
set +e
(
  RUN_ACTIVE=1
  remove_work_directory() { return 0; }
  on_exit 70
) >/dev/null 2>&1
business_cleanup_rc=$?
set -e
assert_rc "$business_cleanup_rc" 70 "business rc must survive cleanup failure"
assert_contains "$CLEANUP_STATE" "CLEANUP_FAILED_RC_75"

# Full dispatcher: actual scenario functions execute; only external dependencies are replaced.
DISPATCH_STATE="$TMP_ROOT/dispatch.state"
DISPATCH_WORK="$TMP_ROOT/dispatch-work"
HOLDER_MARKER="$TMP_ROOT/holder.locked"
mkdir "$DISPATCH_WORK"
WORK_DIR="$DISPATCH_WORK"
CREATED_DATABASES=()
CREATE_COUNT=0
CLEANUP_COUNT=0
BEHAVIOR_TOTAL=0
BEHAVIOR_VALID=0
BEHAVIOR_INVALID=0
record_state() { printf '%s\n' "$1" >>"$DISPATCH_STATE"; }
create_database() { validate_test_database_name "$1"; CREATED_DATABASES+=("$1"); CREATE_COUNT=$((CREATE_COUNT + 1)); }
apply_fixture_001_005() { :; }
apply_006() { :; }
run_sql() { :; }
catalog_snapshot() { printf 'catalog-snapshot\n' >"$2"; }
expect_006_rejection() {
  [[ "$2" == lock_timeout ]] && sleep 2
  return 0
}
cleanup_or_fail() { remove_created_database "$1"; CLEANUP_COUNT=$((CLEANUP_COUNT + 1)); return 0; }
database_psql() {
  local joined=" $* "
  if [[ "$joined" == *"pg_sleep(30)"* ]]; then
    trap 'rm -f -- "$HOLDER_MARKER"; exit 0' TERM INT EXIT
    : >"$HOLDER_MARKER"
    sleep 4
    return 0
  fi
  if [[ "$joined" == *"FROM pg_catalog.pg_locks"* ]]; then [[ -e "$HOLDER_MARKER" ]] && printf '1\n' || printf '0\n'; return 0; fi
  if [[ "$joined" == *"WHERE application_name"* ]]; then printf '0\n'; return 0; fi
  return 0
}
run_behavior_insert() {
  local label="$2" expectation="$3"
  BEHAVIOR_TOTAL=$((BEHAVIOR_TOTAL + 1))
  if [[ "$expectation" == PASS ]]; then BEHAVIOR_VALID=$((BEHAVIOR_VALID + 1)); else BEHAVIOR_INVALID=$((BEHAVIOR_INVALID + 1)); fi
  record_state "BEHAVIOR_CASE_CALLED $label $expectation"
}

: >"$DISPATCH_STATE"
dispatch_all_scenarios
[[ "$(grep -c '^SCENARIO_STARTED ' "$DISPATCH_STATE")" == "79" ]] || fail_test "not all 79 scenario functions started"
[[ "$(grep -c '^EXPECTED_REJECTION_PASS ' "$DISPATCH_STATE")" == "77" ]] || fail_test "expected rejection count is not 77"
[[ "$(grep -c '^BEHAVIOR_PASS ' "$DISPATCH_STATE")" == "1" ]] || fail_test "BEHAVIOR_PASS count is not 1"
[[ "$(grep -c '^FINAL_CATALOG_PASS ' "$DISPATCH_STATE")" == "1" ]] || fail_test "FINAL_CATALOG_PASS count is not 1"
[[ "$CREATE_COUNT" == "79" && "$CLEANUP_COUNT" == "79" ]] || fail_test "dispatcher create/cleanup count mismatch"
[[ "$BEHAVIOR_TOTAL" == "33" && "$BEHAVIOR_VALID" == "12" && "$BEHAVIOR_INVALID" == "21" ]] || \
  fail_test "behavior counts are not 33/12/21"
[[ "$(grep -c '^BEHAVIOR_CASE_CALLED ' "$DISPATCH_STATE")" == "33" ]] || fail_test "not all behavior cases executed"
[[ ! -e "$HOLDER_MARKER" ]] || fail_test "lock holder marker remained"

# INT/TERM preserve their codes while EXIT cleanup runs; a clean EXIT records COMPLETE.
SIGNAL_STATE="$TMP_ROOT/signal.state"
record_state() { printf '%s\n' "$1" >>"$SIGNAL_STATE"; }
for signal_spec in INT:130 TERM:143; do
  signal_name="${signal_spec%%:*}"
  signal_code="${signal_spec##*:}"
  : >"$SIGNAL_STATE"
  CLEANUP_MODE=success
  set +e
  (
    install_runtime_traps
    RUN_ACTIVE=1
    CREATED_DATABASES=("$cleanup_db")
    remove_work_directory() { return 0; }
    on_signal "$signal_name" "$signal_code"
  ) >/dev/null 2>&1
  signal_rc=$?
  set -e
  assert_rc "$signal_rc" "$signal_code" "$signal_name exit code"
  assert_contains "$SIGNAL_STATE" "FAILED_signal_${signal_name}_${signal_code}"
  assert_contains "$SIGNAL_STATE" "CLEANUP_PASS"
done

: >"$SIGNAL_STATE"
set +e
(
  install_runtime_traps
  RUN_ACTIVE=1
  CREATED_DATABASES=()
  remove_work_directory() { return 0; }
  exit 0
) >/dev/null 2>&1
clean_exit_rc=$?
set -e
assert_rc "$clean_exit_rc" 0 "clean EXIT"
assert_contains "$SIGNAL_STATE" "COMPLETE"

# State-path attacks use fresh sourced subshells and never write the link target.
state_attack_root="$TMP_ROOT/state-attacks"
mkdir "$state_attack_root"
mkdir "$state_attack_root/real-dir"
ln -s "$state_attack_root/real-dir" "$state_attack_root/link-dir"
set +e
(
  RUN_NONCE=44444444444444444444444444444444
  initialize_state_file "$state_attack_root/link-dir" "$(id -u)"
) >/dev/null 2>&1
state_dir_rc=$?
set -e
assert_rc "$state_dir_rc" 76 "symlink state directory"
[[ -z "$(find "$state_attack_root/real-dir" -mindepth 1 -print -quit)" ]] || fail_test "symlink directory target was written"

preexisting="$state_attack_root/preexisting.state"
printf 'sentinel\n' >"$preexisting"
set +e
(
  RUN_NONCE=55555555555555555555555555555555
  validate_state_directory() { return 0; }
  create_state_file() { printf '%s\n' "$preexisting"; }
  initialize_state_file "$state_attack_root" "$(id -u)"
) >/dev/null 2>&1
preexisting_rc=$?
set -e
assert_rc "$preexisting_rc" 76 "pre-existing state target"
[[ "$(<"$preexisting")" == sentinel ]] || fail_test "pre-existing state target was modified"

replacement_target="$state_attack_root/replacement-target"
printf 'untouched\n' >"$replacement_target"
set +e
(
  eval "$ORIGINAL_RECORD_STATE"
  STATE_FILE="$state_attack_root/replace.state"
  printf 'original\n' >"$STATE_FILE"
  STATE_DEVICE_INODE="$(stat -c '%d:%i' "$STATE_FILE")"
  RUNTIME_READY=1
  rm -f -- "$STATE_FILE"
  ln -s "$replacement_target" "$STATE_FILE"
  record_state attack
) >/dev/null 2>&1
replacement_rc=$?
set -e
assert_rc "$replacement_rc" 76 "state file symlink replacement"
[[ "$(<"$replacement_target")" == untouched ]] || fail_test "replacement symlink target was written"

printf 'run-006-auth-pg14-matrix source-injected tests: PASS\n'
