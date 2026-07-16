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
ORIGINAL_PSQL_COMMAND="$(declare -f psql_command)"
ORIGINAL_RUN_EXTERNAL_TIMEOUT="$(declare -f run_external_timeout)"
RUN_ID="source-test-run"
generate_run_nonce() { RUN_NONCE=33333333333333333333333333333333; }
configure_run_identity
validate_all_database_names
validate_oracle_contracts
[[ "$(rejection_contract lock_timeout)" == $'-\tcanceling statement due to lock timeout\tcategory_only' ]] || \
  fail_test "lock timeout does not use its dedicated category-only ERROR contract"
TEST_WORK="$TMP_ROOT/rejection-work"
mkdir "$TEST_WORK"
WORK_DIR="$TEST_WORK"

# Independent test oracles.  These do not call the runner's contract helpers;
# a drift in either the formal contract or parser therefore fails the fake run.
declare -A TEST_REJECTION_ERRORS=()
TEST_REJECTION_ERRORS[challenge_id_type]='ERROR: 006 challenge_id atttypid must be uuid'
TEST_REJECTION_ERRORS[challenge_id_nullable]='ERROR: 006 challenge_id attnotnull must be true'
TEST_REJECTION_ERRORS[challenge_id_missing_default]='ERROR: 006 challenge_id default is missing'
TEST_REJECTION_ERRORS[challenge_id_wrong_default]='ERROR: 006 challenge_id default must directly call pg_catalog.gen_random_uuid()'
TEST_REJECTION_ERRORS[challenge_id_missing_primary_key]='ERROR: 006 challenge_id primary key count must be 1'
TEST_REJECTION_ERRORS[challenge_id_composite_primary_key]='ERROR: 006 challenge_id primary key conkey must contain challenge_id only'
declare -A TEST_CHECK_ERROR_CATEGORIES=(
  [wrong_relation]='has wrong relation'
  [duplicate_name]='has duplicate names'
  [wrong_conkey]='has wrong conkey'
  [not_valid]='is not validated'
  [no_inherit]='unexpectedly uses NO INHERIT'
  [wrong_expression]='has wrong normalized expression'
)
declare -a TEST_CHECK_OBJECTS=(
  ck_auth_challenge_phone_hash ck_auth_challenge_code_digest ck_auth_challenge_ip_hash
  ck_auth_challenge_purpose ck_auth_challenge_attempts ck_auth_challenge_timing
  ck_auth_challenge_consumed_at ck_auth_challenge_provider_request_id
)
for test_object in "${TEST_CHECK_OBJECTS[@]}"; do
  for test_variant in wrong_relation duplicate_name wrong_conkey not_valid no_inherit wrong_expression; do
    TEST_REJECTION_ERRORS["${test_object}__${test_variant}"]="ERROR: 006 ${test_object} ${TEST_CHECK_ERROR_CATEGORIES[$test_variant]}"
  done
done
declare -A TEST_INDEX_ERROR_CATEGORIES=(
  [wrong_relation]='has wrong relation'
  [wrong_key]='has wrong key columns'
  [wrong_sort]='has wrong sort options'
  [unique]='is unexpectedly unique'
  [access_method]='has wrong access method'
  [predicate]='unexpectedly has a predicate'
  [expression]='unexpectedly has an expression'
)
declare -a TEST_INDEX_OBJECTS=(
  idx_auth_challenges_phone_created idx_auth_challenges_ip_created idx_auth_challenges_expires_at
)
for test_object in "${TEST_INDEX_OBJECTS[@]}"; do
  for test_variant in wrong_relation wrong_key wrong_sort unique access_method predicate expression; do
    TEST_REJECTION_ERRORS["${test_object}__${test_variant}"]="ERROR: 006 ${test_object} ${TEST_INDEX_ERROR_CATEGORIES[$test_variant]}"
  done
done
TEST_REJECTION_ERRORS[lock_timeout]='ERROR: canceling statement due to lock timeout'
TEST_REJECTION_ERRORS[transaction_rollback]='ERROR: 006 ck_auth_challenge_provider_request_id has wrong relation'
[[ "${#TEST_REJECTION_ERRORS[@]}" == 77 ]] || fail_test "independent rejection oracle count is not 77"

declare -A TEST_BEHAVIOR_RESULTS=(
  [phone_hash_len63]='ERROR: insert ck_auth_challenge_phone_hash violates check constraint'
  [phone_hash_len64]=PASS
  [phone_hash_len65]='ERROR: insert character(64) value too long for type'
  [phone_hash_nonhex]='ERROR: insert ck_auth_challenge_phone_hash violates check constraint'
  [phone_hash_uppercase]='ERROR: insert ck_auth_challenge_phone_hash violates check constraint'
  [code_digest_len63]='ERROR: insert ck_auth_challenge_code_digest violates check constraint'
  [code_digest_len64]=PASS
  [code_digest_len65]='ERROR: insert character(64) value too long for type'
  [code_digest_nonhex]='ERROR: insert ck_auth_challenge_code_digest violates check constraint'
  [code_digest_uppercase]='ERROR: insert ck_auth_challenge_code_digest violates check constraint'
  [request_ip_hash_len63]='ERROR: insert ck_auth_challenge_ip_hash violates check constraint'
  [request_ip_hash_len64]=PASS
  [request_ip_hash_len65]='ERROR: insert character(64) value too long for type'
  [request_ip_hash_nonhex]='ERROR: insert ck_auth_challenge_ip_hash violates check constraint'
  [request_ip_hash_uppercase]='ERROR: insert ck_auth_challenge_ip_hash violates check constraint'
  [purpose_sign_in]=PASS
  [purpose_other]='ERROR: insert ck_auth_challenge_purpose violates check constraint'
  [attempts_negative]='ERROR: insert ck_auth_challenge_attempts violates check constraint'
  [max_attempts_zero]='ERROR: insert ck_auth_challenge_attempts violates check constraint'
  [attempts_over_max]='ERROR: insert ck_auth_challenge_attempts violates check constraint'
  [attempts_zero]=PASS
  [attempts_equal_max]=PASS
  [timing_resend_equal_created]='ERROR: insert ck_auth_challenge_timing violates check constraint'
  [timing_expires_equal_resend]='ERROR: insert ck_auth_challenge_timing violates check constraint'
  [timing_strictly_increasing]=PASS
  [consumed_null]=PASS
  [consumed_equal_created]=PASS
  [consumed_before_created]='ERROR: insert ck_auth_challenge_consumed_at violates check constraint'
  [provider_null]=PASS
  [provider_len1]=PASS
  [provider_len128]=PASS
  [provider_empty]='ERROR: insert ck_auth_challenge_provider_request_id violates check constraint'
  [provider_len129]='ERROR: insert ck_auth_challenge_provider_request_id violates check constraint'
)
[[ "${#TEST_BEHAVIOR_RESULTS[@]}" == 33 ]] || fail_test "independent behavior oracle count is not 33"

# Exact ERROR-record matching and SQL/CONTEXT pollution rejection.
REJECTION_MODE=exact
psql_command() {
  case "$REJECTION_MODE" in
    exact)
      printf 'ERROR: 006 challenge_id check failed: atttypid must be uuid, got 25\n' >&2 ;;
    echoed_sql_other_error)
      printf 'CREATE challenge_id atttypid must be uuid;\nERROR: 006 other_field default is missing\n' >&2 ;;
    object_error_category_sql)
      printf 'SQL atttypid must be uuid\nERROR: 006 challenge_id default is missing\n' >&2 ;;
    category_error_object_context)
      printf 'ERROR: 006 other_field atttypid must be uuid\nCONTEXT: challenge_id\n' >&2 ;;
    multiple_errors)
      printf 'ERROR: 006 challenge_id atttypid must be uuid\nERROR: 006 challenge_id atttypid must be uuid\n' >&2 ;;
    psql_error)
      printf 'psql: error: could not connect\nERROR: 006 challenge_id atttypid must be uuid\n' >&2 ;;
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

eval "$ORIGINAL_PSQL_COMMAND"

# All 77 rejection scenarios execute the formal run_006_command wrapper and
# exact ERROR parser.  Only the command transport is source-injected.
ORACLE_CALLS=0
psql_command() {
  [[ -n "${TEST_REJECTION_ERRORS[$CURRENT_REJECTION_ORACLE]:-}" ]] || return 97
  printf '%s\n' "${TEST_REJECTION_ERRORS[$CURRENT_REJECTION_ORACLE]}" >&2
  ORACLE_CALLS=$((ORACLE_CALLS + 1))
  return 1
}
run_external_timeout() {
  local timeout_seconds="$1"
  shift
  [[ "$timeout_seconds" == 8 ]] || return 98
  psql_command "${@:2}"
}
for oracle_row in "${REJECTION_ORACLE_ROWS[@]}"; do
  IFS=$'\t' read -r oracle_scenario _oracle_object _oracle_category _oracle_mode <<<"$oracle_row"
  oracle_db="${SCENARIO_DATABASES[$oracle_scenario]}"
  if [[ "$oracle_scenario" == lock_timeout ]]; then
    expect_006_rejection "$oracle_db" "$oracle_scenario" 8
  else
    expect_006_rejection "$oracle_db" "$oracle_scenario"
  fi
done
[[ "$ORACLE_CALLS" == 77 ]] || fail_test "formal parser did not execute all 77 rejection oracles"

eval "$ORIGINAL_PSQL_COMMAND"
eval "$ORIGINAL_RUN_EXTERNAL_TIMEOUT"

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
DISPATCH_REJECTION_TOTAL=0
record_state() { printf '%s\n' "$1" >>"$DISPATCH_STATE"; }
create_database() { validate_test_database_name "$1"; CREATED_DATABASES+=("$1"); CREATE_COUNT=$((CREATE_COUNT + 1)); }
apply_fixture_001_005() { :; }
apply_006() { :; }
run_sql() { :; }
catalog_snapshot() { printf 'catalog-snapshot\n' >"$2"; }
cleanup_or_fail() { remove_created_database "$1"; CLEANUP_COUNT=$((CLEANUP_COUNT + 1)); return 0; }
psql_command() {
  local joined=" $* "
  if [[ "$joined" == *"pg_sleep(30)"* ]]; then
    trap 'rm -f -- "$HOLDER_MARKER"; exit 0' TERM INT EXIT
    : >"$HOLDER_MARKER"
    sleep 4
    return 0
  fi
  if [[ "$joined" == *"FROM pg_catalog.pg_locks"* ]]; then [[ -e "$HOLDER_MARKER" ]] && printf '1\n' || printf '0\n'; return 0; fi
  if [[ "$joined" == *"WHERE application_name"* ]]; then printf '0\n'; return 0; fi
  if [[ -n "$CURRENT_REJECTION_ORACLE" ]]; then
    [[ -n "${TEST_REJECTION_ERRORS[$CURRENT_REJECTION_ORACLE]:-}" ]] || return 97
    printf '%s\n' "${TEST_REJECTION_ERRORS[$CURRENT_REJECTION_ORACLE]}" >&2
    DISPATCH_REJECTION_TOTAL=$((DISPATCH_REJECTION_TOTAL + 1))
    return 1
  fi
  if [[ -n "$CURRENT_BEHAVIOR_ORACLE" ]]; then
    local behavior_result
    behavior_result="${TEST_BEHAVIOR_RESULTS[$CURRENT_BEHAVIOR_ORACLE]:-}"
    [[ -n "$behavior_result" ]] || return 96
    BEHAVIOR_TOTAL=$((BEHAVIOR_TOTAL + 1))
    if [[ "$behavior_result" == PASS ]]; then
      BEHAVIOR_VALID=$((BEHAVIOR_VALID + 1))
      record_state "BEHAVIOR_CASE_CALLED $CURRENT_BEHAVIOR_ORACLE PASS"
      return 0
    fi
    BEHAVIOR_INVALID=$((BEHAVIOR_INVALID + 1))
    record_state "BEHAVIOR_CASE_CALLED $CURRENT_BEHAVIOR_ORACLE REJECT"
    printf '%s\n' "$behavior_result" >&2
    return 1
  fi
  return 0
}
run_external_timeout() {
  local timeout_seconds="$1"
  shift
  [[ "$timeout_seconds" == 8 ]] || return 98
  sleep 2
  psql_command "${@:2}"
}

: >"$DISPATCH_STATE"
dispatch_all_scenarios
[[ "$(grep -c '^SCENARIO_STARTED ' "$DISPATCH_STATE")" == "79" ]] || fail_test "not all 79 scenario functions started"
[[ "$(grep -c '^EXPECTED_REJECTION_PASS ' "$DISPATCH_STATE")" == "77" ]] || fail_test "expected rejection count is not 77"
[[ "$DISPATCH_REJECTION_TOTAL" == "77" ]] || fail_test "not all 77 rejection oracles passed through the formal parser"
[[ "$(grep -c '^BEHAVIOR_PASS ' "$DISPATCH_STATE")" == "1" ]] || fail_test "BEHAVIOR_PASS count is not 1"
[[ "$(grep -c '^FINAL_CATALOG_PASS ' "$DISPATCH_STATE")" == "1" ]] || fail_test "FINAL_CATALOG_PASS count is not 1"
[[ "$CREATE_COUNT" == "79" && "$CLEANUP_COUNT" == "79" ]] || fail_test "dispatcher create/cleanup count mismatch"
[[ "$BEHAVIOR_TOTAL" == "33" && "$BEHAVIOR_VALID" == "12" && "$BEHAVIOR_INVALID" == "21" ]] || \
  fail_test "behavior counts are not 33/12/21"
[[ "$(grep -c '^BEHAVIOR_CASE_CALLED ' "$DISPATCH_STATE")" == "33" ]] || fail_test "not all behavior cases executed"
[[ ! -e "$HOLDER_MARKER" ]] || fail_test "lock holder marker remained"

# A test-side oracle drift must be caught by the formal behavior parser.
saved_purpose_other="${TEST_BEHAVIOR_RESULTS[purpose_other]}"
TEST_BEHAVIOR_RESULTS[purpose_other]='ERROR: insert different_constraint violates check constraint'
set +e
(
  run_behavior_insert "${SCENARIO_DATABASES[constraint_behavior]}" purpose_other ck_auth_challenge_purpose \
    "repeat('a',64)" "repeat('b',64)" "'other'" \
    "TIMESTAMPTZ '2026-01-01 00:00:00+00'" "TIMESTAMPTZ '2026-01-01 00:01:00+00'" \
    "TIMESTAMPTZ '2026-01-01 00:05:00+00'" 0 5 NULL "repeat('c',64)" NULL
) >/dev/null 2>&1
behavior_oracle_drift_rc=$?
set -e
TEST_BEHAVIOR_RESULTS[purpose_other]="$saved_purpose_other"
[[ "$behavior_oracle_drift_rc" -ne 0 ]] || fail_test "behavior parser accepted an independent oracle mismatch"

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
