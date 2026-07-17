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
ORIGINAL_EXECUTE_POSTGRES_COMMAND="$(declare -f execute_postgres_command)"
ORIGINAL_RUN_EXTERNAL_TIMEOUT="$(declare -f run_external_timeout)"
ORIGINAL_STARTUP_PROBE_FILE_OWNER="$(declare -f startup_probe_file_owner)"
ORIGINAL_STARTUP_PROBE_FILE_MODE="$(declare -f startup_probe_file_mode)"
RUN_ID="source-test-run"
generate_run_nonce() { RUN_NONCE=33333333333333333333333333333333; }
configure_run_identity
validate_all_database_names
validate_oracle_contracts
(
  NO_IO_LOG="$TMP_ROOT/list-dry-source-io.log"
  : >"$NO_IO_LOG"
  execute_postgres_command() { printf 'postgres-transport\n' >>"$NO_IO_LOG"; return 99; }
  run_external_timeout() { printf 'external-timeout\n' >>"$NO_IO_LOG"; return 99; }
  initialize_runtime() { printf 'runtime\n' >>"$NO_IO_LOG"; return 99; }
  initialize_state_file() { printf 'state\n' >>"$NO_IO_LOG"; return 99; }
  create_state_file() { printf 'state-file\n' >>"$NO_IO_LOG"; return 99; }
  create_startup_probe_file() { printf 'startup-probe-file\n' >>"$NO_IO_LOG"; return 99; }
  create_database_command() { printf 'createdb\n' >>"$NO_IO_LOG"; return 99; }
  drop_database_command() { printf 'dropdb\n' >>"$NO_IO_LOG"; return 99; }
  remove_work_directory() { printf 'remove-runtime\n' >>"$NO_IO_LOG"; return 99; }
  record_state() { printf 'state-write\n' >>"$NO_IO_LOG"; return 99; }
  unset DATABASE_URL PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGHOSTADDR PGDATABASE
  list_scenarios >/dev/null
  dry_run >/dev/null
  [[ ! -s "$NO_IO_LOG" ]] || fail_test "--list/--dry-run invoked runtime, state, database, timeout, or cleanup I/O"
)
[[ "$(rejection_contract lock_timeout)" == $'-\tcanceling statement due to lock timeout\tcategory_only' ]] || \
  fail_test "lock timeout does not use its dedicated category-only ERROR contract"
TEST_WORK="$TMP_ROOT/rejection-work"
mkdir "$TEST_WORK"
WORK_DIR="$TEST_WORK"

POSTGRES_EXECUTABLE=""
declare -a POSTGRES_CLI_ARGS=()
POSTGRES_BOUNDARY_CALLS=0
capture_postgres_boundary() {
  local -a boundary_arguments=("$@")
  [[ "${#boundary_arguments[@]}" -ge 12 ]] || fail_test "postgres boundary command is too short"
  [[ "${boundary_arguments[0]}" == /usr/sbin/runuser ]] || fail_test "postgres boundary did not use fixed runuser"
  [[ "${boundary_arguments[1]}" == --user && "${boundary_arguments[2]}" == postgres && "${boundary_arguments[3]}" == -- ]] || \
    fail_test "postgres boundary did not select the postgres OS user"
  [[ "${boundary_arguments[4]}" == /usr/bin/env && "${boundary_arguments[5]}" == -i ]] || \
    fail_test "postgres boundary did not clear the environment"
  [[ "${boundary_arguments[6]}" == HOME=/nonexistent ]] || fail_test "postgres child HOME changed"
  [[ "${boundary_arguments[7]}" == PATH=/usr/bin:/bin ]] || fail_test "postgres child PATH changed"
  [[ "${boundary_arguments[8]}" == PGHOST=/var/run/postgresql ]] || fail_test "postgres child socket changed"
  [[ "${boundary_arguments[9]}" == PGPORT=5432 ]] || fail_test "postgres child port changed"
  [[ "${boundary_arguments[10]}" == PGUSER=postgres ]] || fail_test "postgres child database user changed"
  POSTGRES_EXECUTABLE="${boundary_arguments[11]}"
  POSTGRES_CLI_ARGS=("${boundary_arguments[@]:12}")
  case "$POSTGRES_EXECUTABLE" in
    /usr/bin/psql|/usr/bin/createdb|/usr/bin/dropdb|/usr/bin/test) ;;
    *) fail_test "unapproved postgres child executable: $POSTGRES_EXECUTABLE" ;;
  esac
  for forbidden in DATABASE_URL PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGHOSTADDR PGDATABASE; do
    [[ " ${boundary_arguments[*]} " != *" ${forbidden}="* ]] || fail_test "postgres child leaked $forbidden"
  done
  POSTGRES_BOUNDARY_CALLS=$((POSTGRES_BOUNDARY_CALLS + 1))
}

declare -A TEST_SCRIPT_SQLS=(
  [terminate]="SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE datname = :'matrix_db' AND pid <> pg_catalog.pg_backend_pid();"
  [connection_count]="SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname = :'matrix_db';"
  [database_exists]="SELECT count(*) FROM pg_catalog.pg_database WHERE datname = :'matrix_db';"
  [residual_count]="SELECT count(*) FROM pg_catalog.pg_database WHERE datname LIKE :'matrix_prefix';"
  [preexisting_count]="SELECT count(*) FROM pg_catalog.pg_database WHERE datname = ANY(pg_catalog.string_to_array(:'matrix_names', ','));"
  [lock_holder]=$'SELECT pg_catalog.set_config(\'application_name\', :\'lock_app\', false);\nBEGIN;\nLOCK TABLE public.auth_verification_challenges IN ACCESS EXCLUSIVE MODE;\nSELECT pg_catalog.pg_sleep(30);'
  [lock_granted]="SELECT count(*) FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid WHERE a.application_name=:'lock_app' AND l.relation='public.auth_verification_challenges'::regclass AND l.mode='AccessExclusiveLock' AND l.granted;"
  [lock_connections]="SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name=:'lock_app';"
)

script_operation_for_sql() {
  local sql="$1" operation match_count=0 matched_operation=""
  for operation in "${!TEST_SCRIPT_SQLS[@]}"; do
    if [[ "$sql" == "${TEST_SCRIPT_SQLS[$operation]}" ]]; then
      match_count=$((match_count + 1))
      matched_operation="$operation"
    fi
  done
  [[ "$match_count" -eq 1 ]] || return 95
  printf '%s\n' "$matched_operation"
}

capture_and_validate_script_transport() {
  local stdin_file="$1" argument next_argument token_name="" set_argument="" index sql operation database=""
  local file_count=0 command_count=0 set_count=0 on_error_stop_count=0 token_count=0
  local database_count=0 x_count=0 no_psqlrc_count=0 verbosity_variable_count=0
  [[ -f "$stdin_file" && ! -L "$stdin_file" ]] || return 95
  sql="$(<"$stdin_file")"
  operation="$(script_operation_for_sql "$sql")" || return 95
  for ((index=0; index<${#POSTGRES_CLI_ARGS[@]}; index++)); do
    argument="${POSTGRES_CLI_ARGS[$index]}"
    next_argument="${POSTGRES_CLI_ARGS[$((index + 1))]:-}"
    case "$argument" in
      -X) x_count=$((x_count + 1)) ;;
      --no-psqlrc) no_psqlrc_count=$((no_psqlrc_count + 1)) ;;
      --file=-) file_count=$((file_count + 1)) ;;
      -c|--command|--command=*) command_count=$((command_count + 1)) ;;
      --set=*) set_count=$((set_count + 1)); set_argument="$argument" ;;
      -v)
        [[ "$next_argument" == ON_ERROR_STOP=1 ]] || return 95
        on_error_stop_count=$((on_error_stop_count + 1)) ;;
      -d)
        [[ -n "$next_argument" ]] || return 95
        database_count=$((database_count + 1))
        database="$next_argument" ;;
      VERBOSITY=*|-vVERBOSITY=*|--set=VERBOSITY=*)
        verbosity_variable_count=$((verbosity_variable_count + 1)) ;;
    esac
  done
  [[ "$file_count" -eq 1 && "$command_count" -eq 0 && "$set_count" -eq 1 && \
     "$on_error_stop_count" -eq 1 && "$database_count" -eq 1 && "$x_count" -eq 1 && \
     "$no_psqlrc_count" -eq 1 && "$verbosity_variable_count" -eq 0 ]] || return 95
  for candidate_name in matrix_db matrix_prefix matrix_names lock_app; do
    if [[ "$sql" == *":'$candidate_name'"* ]]; then
      token_count=$((token_count + 1))
      token_name="$candidate_name"
    fi
  done
  [[ "$token_count" -eq 1 && "$set_argument" == "--set=${token_name}="* && "$set_argument" != "--set=${token_name}=" ]] || return 95
  case "$operation" in
    terminate|connection_count|database_exists)
      [[ "$database" == postgres && "$token_name" == matrix_db ]] || return 95
      validate_test_database_name "${set_argument#--set=matrix_db=}" || return 95 ;;
    residual_count)
      [[ "$database" == postgres && "$set_argument" == "--set=matrix_prefix=${RUN_DB_PREFIX}%" ]] || return 95 ;;
    preexisting_count)
      [[ "$database" == postgres && "$token_name" == matrix_names ]] || return 95
      validate_matrix_database_list "${set_argument#--set=matrix_names=}" || return 95 ;;
    lock_holder|lock_granted|lock_connections)
      validate_test_database_name "$database" || return 95
      [[ "$set_argument" == "--set=lock_app=memoryai_auth_matrix_lock_${RUN_NONCE}" ]] || return 95 ;;
    *) return 95 ;;
  esac
  if [[ -n "${SCRIPT_TRANSPORT_LOG:-}" ]]; then
    printf '%s\t%s\t%s\n' "$operation" "$database" "$set_argument" >>"$SCRIPT_TRANSPORT_LOG"
  fi
  TEST_SCRIPT_OPERATION="$operation"
  TEST_SCRIPT_SET_ARGUMENT="$set_argument"
}

# Formal mode keeps root orchestration while rejecting every non-fixed database
# transport input before any runtime directory or database command is created.
ORIGINAL_FIXED_EXECUTABLE_AVAILABLE="$(declare -f fixed_executable_available)"
ORIGINAL_ORCHESTRATOR_UID="$(declare -f orchestrator_uid)"
ORIGINAL_DATABASE_OS_USER_EXISTS="$(declare -f database_os_user_exists)"
fixed_executable_available() { return 0; }
orchestrator_uid() { printf '1000\n'; }
set +e
( validate_orchestrator_identity ) >/dev/null 2>&1
non_root_rc=$?
set -e
assert_rc "$non_root_rc" 76 "non-root orchestrator"
orchestrator_uid() { printf '0\n'; }
validate_orchestrator_identity

for rejected_host in '' localhost 127.0.0.1 ::1 /tmp /run/postgresql /var/run/postgresql/; do
  set +e
  (
    MEMORYAI_AUTH_TEST_ALLOW=I_UNDERSTAND_LOCAL_PG14
    PGHOST="$rejected_host"
    unset PGPORT PGUSER DATABASE_URL PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGHOSTADDR PGDATABASE
    validate_connection_inputs
  ) >/dev/null 2>&1
  rejected_host_rc=$?
  set -e
  assert_rc "$rejected_host_rc" 64 "rejected PGHOST $rejected_host"
done
(
  MEMORYAI_AUTH_TEST_ALLOW=I_UNDERSTAND_LOCAL_PG14
  PGHOST=/var/run/postgresql
  unset PGPORT PGUSER DATABASE_URL PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGHOSTADDR PGDATABASE
  validate_connection_inputs
)
for forbidden_variable in DATABASE_URL PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGHOSTADDR PGDATABASE; do
  set +e
  (
    MEMORYAI_AUTH_TEST_ALLOW=I_UNDERSTAND_LOCAL_PG14
    PGHOST=/var/run/postgresql
    unset PGPORT PGUSER DATABASE_URL PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGHOSTADDR PGDATABASE
    printf -v "$forbidden_variable" '%s' forbidden
    export "$forbidden_variable"
    validate_connection_inputs
  ) >/dev/null 2>&1
  forbidden_input_rc=$?
  set -e
  assert_rc "$forbidden_input_rc" 64 "forbidden connection input $forbidden_variable"
done
for empty_forbidden_variable in DATABASE_URL PGPASSWORD; do
  set +e
  (
    MEMORYAI_AUTH_TEST_ALLOW=I_UNDERSTAND_LOCAL_PG14
    PGHOST=/var/run/postgresql
    unset PGPORT PGUSER DATABASE_URL PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGHOSTADDR PGDATABASE
    printf -v "$empty_forbidden_variable" '%s' ''
    export "$empty_forbidden_variable"
    validate_connection_inputs
  ) >/dev/null 2>&1
  empty_forbidden_rc=$?
  set -e
  assert_rc "$empty_forbidden_rc" 64 "empty forbidden connection input $empty_forbidden_variable"
done
for fixed_input in PGPORT:5433 PGUSER:root; do
  set +e
  (
    MEMORYAI_AUTH_TEST_ALLOW=I_UNDERSTAND_LOCAL_PG14
    PGHOST=/var/run/postgresql
    unset PGPORT PGUSER DATABASE_URL PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGHOSTADDR PGDATABASE
    printf -v "${fixed_input%%:*}" '%s' "${fixed_input##*:}"
    export "${fixed_input%%:*}"
    validate_connection_inputs
  ) >/dev/null 2>&1
  fixed_input_rc=$?
  set -e
  assert_rc "$fixed_input_rc" 64 "wrong fixed connection input $fixed_input"
done

MISSING_FIXED_EXECUTABLE=""
fixed_executable_available() { [[ "$1" != "$MISSING_FIXED_EXECUTABLE" ]]; }
database_os_user_exists() { return 0; }
for missing_binary in /usr/sbin/runuser /usr/bin/env /usr/bin/psql /usr/bin/createdb /usr/bin/dropdb /usr/bin/timeout /usr/bin/id /usr/bin/test; do
  MISSING_FIXED_EXECUTABLE="$missing_binary"
  set +e
  ( validate_fixed_database_runtime ) >/dev/null 2>&1
  missing_binary_rc=$?
  set -e
  assert_rc "$missing_binary_rc" 69 "missing fixed binary $missing_binary"
done
MISSING_FIXED_EXECUTABLE=""
database_os_user_exists() { return 1; }
set +e
( validate_fixed_database_runtime ) >/dev/null 2>&1
missing_postgres_user_rc=$?
set -e
assert_rc "$missing_postgres_user_rc" 69 "missing postgres OS user"
eval "$ORIGINAL_FIXED_EXECUTABLE_AVAILABLE"
eval "$ORIGINAL_ORCHESTRATOR_UID"
eval "$ORIGINAL_DATABASE_OS_USER_EXISTS"

IDENTITY_EVIDENCE='140023|postgres|postgres|postgres|unix_socket'
IDENTITY_STDERR=''
IDENTITY_TRANSPORT_RC=0
IDENTITY_BOUNDARY_LOG="$TMP_ROOT/identity-boundary.log"
IDENTITY_OWNER_LOG="$TMP_ROOT/identity-owner-checks.log"
IDENTITY_MODE_LOG="$TMP_ROOT/identity-mode-checks.log"
: >"$IDENTITY_BOUNDARY_LOG"
: >"$IDENTITY_OWNER_LOG"
: >"$IDENTITY_MODE_LOG"
startup_probe_file_owner() {
  printf '%s\n' "$1" >>"$IDENTITY_OWNER_LOG"
  printf '0\n'
}
startup_probe_file_mode() {
  printf '%s\n' "$1" >>"$IDENTITY_MODE_LOG"
  printf '600\n'
}
execute_postgres_command() {
  local identity_joined identity_sql="" identity_command_count=0 identity_index identity_token
  capture_postgres_boundary "$@"
  [[ "$POSTGRES_EXECUTABLE" == /usr/bin/psql ]] || return 97
  identity_joined=" ${POSTGRES_CLI_ARGS[*]} "
  [[ "$identity_joined" == *" -X "* && "$identity_joined" == *" --no-psqlrc "* && \
     "$identity_joined" == *" -d postgres "* && "$identity_joined" == *" -At "* ]] || return 97
  for ((identity_index=0; identity_index<${#POSTGRES_CLI_ARGS[@]}; identity_index++)); do
    if [[ "${POSTGRES_CLI_ARGS[$identity_index]}" == -c ]]; then
      identity_command_count=$((identity_command_count + 1))
      [[ $((identity_index + 1)) -lt ${#POSTGRES_CLI_ARGS[@]} ]] || return 97
      identity_sql="${POSTGRES_CLI_ARGS[$((identity_index + 1))]}"
    fi
  done
  [[ "$identity_command_count" -eq 1 ]] || return 97
  for identity_token in \
    "current_setting('server_version_num')" "current_database()" session_user current_user \
    "CASE WHEN pg_catalog.inet_client_addr() IS NULL THEN 'unix_socket' ELSE 'tcp' END"; do
    [[ "$identity_sql" == *"$identity_token"* ]] || return 97
  done
  printf 'identity\n' >>"$IDENTITY_BOUNDARY_LOG"
  printf '%s\n' "$IDENTITY_EVIDENCE"
  printf '%s' "$IDENTITY_STDERR" >&2
  [[ "$IDENTITY_TRANSPORT_RC" -eq 0 ]] || return "$IDENTITY_TRANSPORT_RC"
}

run_identity_probe_case() {
  local label="$1" evidence="$2" stderr_payload="$3" transport_rc="$4" expected_rc="$5"
  local case_dir="$TMP_ROOT/identity-case-$label" state_log="$TMP_ROOT/identity-case-$label.state" actual_rc file
  local -a probe_files=()
  mkdir "$case_dir"
  chmod 700 "$case_dir"
  : >"$state_log"
  set +e
  (
    WORK_DIR="$case_dir"
    FAILED_RECORDED=0
    CURRENT_STAGE=startup
    IDENTITY_EVIDENCE="$evidence"
    IDENTITY_STDERR="$stderr_payload"
    IDENTITY_TRANSPORT_RC="$transport_rc"
    record_state() { printf '%s\n' "$1" >>"$state_log"; }
    verify_postgresql_identity
  ) >/dev/null 2>"$TMP_ROOT/identity-case-$label.log"
  actual_rc=$?
  set -e
  assert_rc "$actual_rc" "$expected_rc" "startup identity case $label"

  while IFS= read -r file; do probe_files+=("$file"); done < <(find "$case_dir" -maxdepth 1 -type f -print | sort)
  [[ "${#probe_files[@]}" -eq 2 ]] || fail_test "$label did not create exactly two startup probe files"
  for file in "${probe_files[@]}"; do
    [[ "$(cd "$(dirname "$file")" && pwd -P)" == "$(cd "$case_dir" && pwd -P)" ]] || fail_test "$label probe escaped WORK_DIR"
    [[ -f "$file" && ! -L "$file" ]] || fail_test "$label probe is not a regular non-symlink file"
    grep -Fxq -- "$file" "$IDENTITY_OWNER_LOG" || fail_test "$label probe did not execute the root-owner check"
    grep -Fxq -- "$file" "$IDENTITY_MODE_LOG" || fail_test "$label probe did not execute the 0600 mode check"
    case "${file##*/}" in
      postgresql-startup-identity.stdout.*|postgresql-startup-identity.stderr.*) ;;
      *) fail_test "$label used an uncontrolled startup probe filename" ;;
    esac
  done
  if [[ "$expected_rc" == "$STARTUP_VALIDATION_RC" ]]; then
    assert_contains "$state_log" "FAILED_startup_stderr_${STARTUP_VALIDATION_RC} bytes=${#stderr_payload}"
    [[ "$(wc -l <"$state_log" | tr -d ' ')" == "1" ]] || fail_test "$label recorded more than the safe pollution state"
    [[ "$(<"$state_log")" != *WARNING* && "$(<"$state_log")" != *NOTICE* ]] || \
      fail_test "$label leaked startup stderr content into state"
    if [[ -n "$stderr_payload" && "$stderr_payload" != $'\n' && "$stderr_payload" != ' ' ]]; then
      ! grep -Fq -- "$stderr_payload" "$TMP_ROOT/identity-case-$label.log" || \
        fail_test "$label leaked startup stderr content into the normal log"
    fi
  elif [[ "$transport_rc" -ne 0 ]]; then
    [[ ! -s "$state_log" ]] || fail_test "$label validated stderr after a transport failure"
  fi
  rm -rf -- "$case_dir"
}

run_identity_probe_case valid '140023|postgres|postgres|postgres|unix_socket' '' 0 0
run_identity_probe_case warning '140023|postgres|postgres|postgres|unix_socket' 'WARNING: fake startup warning' 0 "$STARTUP_VALIDATION_RC"
run_identity_probe_case notice '140023|postgres|postgres|postgres|unix_socket' 'NOTICE: fake startup notice' 0 "$STARTUP_VALIDATION_RC"
run_identity_probe_case newline '140023|postgres|postgres|postgres|unix_socket' $'\n' 0 "$STARTUP_VALIDATION_RC"
run_identity_probe_case space '140023|postgres|postgres|postgres|unix_socket' ' ' 0 "$STARTUP_VALIDATION_RC"
run_identity_probe_case transport42 '140023|postgres|postgres|postgres|unix_socket' 'WARNING: must not override transport failure' 42 42
run_identity_probe_case invalid_stdout '140022|postgres|postgres|postgres|unix_socket' '' 0 65

for bad_identity in \
  '140023|memoryai|postgres|postgres|unix_socket' \
  '140023|postgres|other|postgres|unix_socket' \
  '140023|postgres|postgres|other|unix_socket' \
  '140023|postgres|postgres|postgres|tcp' \
  '140023|postgres|postgres|postgres|t' \
  '140023|postgres|postgres|postgres|true' \
  '140023|postgres|postgres|postgres|false' \
  '140023|postgres|postgres|postgres|UNIX_SOCKET' \
  '140023|postgres|postgres|postgres|unix_socket ' \
  $'140023|postgres|postgres|postgres|unix_socket\n140023|postgres|postgres|postgres|unix_socket' \
  '140023|postgres|postgres|postgres|unix_socket|extra' \
  '140023|postgres|postgres|postgres|unix_socket|' \
  '140023|postgres|postgres|postgres|' \
  '140023||postgres|postgres|unix_socket' \
  ''; do
  bad_identity_label="shape_$(printf '%s' "$bad_identity" | cksum | cut -d' ' -f1)"
  run_identity_probe_case "$bad_identity_label" "$bad_identity" '' 0 65
done

[[ "$(wc -l <"$IDENTITY_BOUNDARY_LOG" | tr -d ' ')" -ge 16 ]] || \
  fail_test "startup identity cases did not cross the postgres boundary"

# Probe captures stay inside WORK_DIR and disappear with that directory on
# every normal or signal-driven exit path.
for cleanup_spec in EXIT:0 INT:130 TERM:143; do
  cleanup_kind="${cleanup_spec%%:*}"
  cleanup_expected_rc="${cleanup_spec##*:}"
  cleanup_parent="$TMP_ROOT/startup-probe-cleanup-$cleanup_kind"
  cleanup_dir="$cleanup_parent/memoryai-auth-pg14-matrix.${RUN_NONCE}.capture"
  mkdir -p "$cleanup_dir"
  chmod 700 "$cleanup_dir"
  set +e
  (
    WORK_DIR="$cleanup_dir"
    WORK_DIR_CREATED=1
    RUN_ACTIVE=0
    RUNTIME_READY=0
    FAILED_RECORDED=0
    IDENTITY_EVIDENCE='140023|postgres|postgres|postgres|unix_socket'
    IDENTITY_STDERR=''
    IDENTITY_TRANSPORT_RC=0
    remove_work_directory() {
      [[ "$WORK_DIR" == "$cleanup_dir" && -d "$WORK_DIR" && ! -L "$WORK_DIR" ]] || return 1
      rm -rf -- "$WORK_DIR"
      [[ ! -e "$WORK_DIR" ]]
    }
    install_runtime_traps
    verify_postgresql_identity
    [[ "$(find "$WORK_DIR" -maxdepth 1 -type f -name 'postgresql-startup-identity.*' | wc -l | tr -d ' ')" == "2" ]] || exit 99
    case "$cleanup_kind" in
      EXIT) exit 0 ;;
      INT) on_signal INT 130 ;;
      TERM) on_signal TERM 143 ;;
    esac
  ) >/dev/null 2>&1
  cleanup_signal_rc=$?
  set -e
  assert_rc "$cleanup_signal_rc" "$cleanup_expected_rc" "$cleanup_kind startup probe cleanup"
  [[ ! -e "$cleanup_dir" ]] || fail_test "$cleanup_kind left startup probe files behind"
done

# A polluted startup probe stops run_matrix before scenario dispatch or any
# database creation, while state receives only the stage and byte count.
POLLUTION_WORK="$TMP_ROOT/startup-pollution-run"
POLLUTION_STATE="$TMP_ROOT/startup-pollution.state"
POLLUTION_DATABASE_MARKER="$TMP_ROOT/startup-pollution.database"
mkdir "$POLLUTION_WORK"
chmod 700 "$POLLUTION_WORK"
: >"$POLLUTION_STATE"
rm -f -- "$POLLUTION_DATABASE_MARKER"
set +e
(
  IDENTITY_EVIDENCE='140023|postgres|postgres|postgres|unix_socket'
  IDENTITY_STDERR='WARNING: startup pollution must remain private'
  IDENTITY_TRANSPORT_RC=0
  FAILED_RECORDED=0
  CURRENT_STAGE=startup
  validate_static_inputs() { :; }
  validate_all_database_names() { :; }
  validate_orchestrator_identity() { :; }
  validate_inputs() { :; }
  initialize_runtime() { WORK_DIR="$POLLUTION_WORK"; WORK_DIR_CREATED=1; RUNTIME_READY=0; }
  record_state() { printf '%s\n' "$1" >>"$POLLUTION_STATE"; }
  record_database_mappings() { :; }
  assert_all_database_names_absent() { :; }
  assert_no_residual_databases() { :; }
  create_database_command() { printf 'createdb\n' >>"$POLLUTION_DATABASE_MARKER"; }
  dispatch_all_scenarios() {
    record_state 'SCENARIO_STARTED should-not-run'
    printf 'dispatch\n' >>"$POLLUTION_DATABASE_MARKER"
  }
  run_matrix
) >/dev/null 2>"$TMP_ROOT/startup-pollution.log"
pollution_run_rc=$?
set -e
assert_rc "$pollution_run_rc" "$STARTUP_VALIDATION_RC" "polluted startup run_matrix"
assert_contains "$POLLUTION_STATE" "FAILED_startup_stderr_${STARTUP_VALIDATION_RC} bytes=46"
! grep -Fq 'SCENARIO_STARTED' "$POLLUTION_STATE" || fail_test "stderr pollution entered a scenario"
[[ ! -e "$POLLUTION_DATABASE_MARKER" ]] || fail_test "stderr pollution reached database creation or dispatch"
[[ "$(find "$POLLUTION_WORK" -maxdepth 1 -type f -name 'postgresql-startup-identity.*' | wc -l | tr -d ' ')" == "2" ]] || \
  fail_test "polluted startup did not use two capture files"
! grep -Fq 'startup pollution must remain private' "$POLLUTION_STATE" || fail_test "pollution content leaked into persistent state"
! grep -Fq 'startup pollution must remain private' "$TMP_ROOT/startup-pollution.log" || fail_test "pollution content leaked into the normal log"
rm -rf -- "$POLLUTION_WORK"

IDENTITY_EVIDENCE='140023|postgres|postgres|postgres|unix_socket'
IDENTITY_STDERR=''
IDENTITY_TRANSPORT_RC=0
execute_postgres_command() {
  capture_postgres_boundary "$@"
  [[ "$POSTGRES_EXECUTABLE" == /usr/bin/test && "${POSTGRES_CLI_ARGS[*]}" == "-r /staging/006.sql" ]]
}
postgres_file_readable /staging/006.sql || fail_test "staging readability did not use the postgres boundary"
eval "$ORIGINAL_EXECUTE_POSTGRES_COMMAND"
eval "$ORIGINAL_STARTUP_PROBE_FILE_OWNER"
eval "$ORIGINAL_STARTUP_PROBE_FILE_MODE"

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

# Independent label -> SQL boundary oracle.  Every row freezes all twelve
# inserted values, so a target drift or an unrelated boundary-changing value
# cannot be hidden behind an otherwise correct constraint name.
declare -a TEST_BEHAVIOR_SQL_ROWS=(
  $'phone_hash_len63\trepeat(\'a\',63)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'phone_hash_len64\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'phone_hash_len65\trepeat(\'a\',65)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'phone_hash_nonhex\trepeat(\'g\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'phone_hash_uppercase\trepeat(\'A\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'code_digest_len63\trepeat(\'a\',64)\trepeat(\'a\',63)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'code_digest_len64\trepeat(\'a\',64)\trepeat(\'a\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'code_digest_len65\trepeat(\'a\',64)\trepeat(\'a\',65)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'code_digest_nonhex\trepeat(\'a\',64)\trepeat(\'g\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'code_digest_uppercase\trepeat(\'a\',64)\trepeat(\'A\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'request_ip_hash_len63\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'a\',63)\tNULL'
  $'request_ip_hash_len64\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'a\',64)\tNULL'
  $'request_ip_hash_len65\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'a\',65)\tNULL'
  $'request_ip_hash_nonhex\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'g\',64)\tNULL'
  $'request_ip_hash_uppercase\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'A\',64)\tNULL'
  $'purpose_sign_in\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'purpose_other\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'other\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'attempts_negative\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t-1\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'max_attempts_zero\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t0\tNULL\trepeat(\'c\',64)\tNULL'
  $'attempts_over_max\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t6\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'attempts_zero\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'attempts_equal_max\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t5\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'timing_resend_equal_created\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'timing_expires_equal_resend\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'timing_strictly_increasing\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'consumed_null\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'consumed_equal_created\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\trepeat(\'c\',64)\tNULL'
  $'consumed_before_created\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tTIMESTAMPTZ \'2025-12-31 23:59:59+00\'\trepeat(\'c\',64)\tNULL'
  $'provider_null\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\tNULL'
  $'provider_len1\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\t\'x\''
  $'provider_len128\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\trepeat(\'x\',128)'
  $'provider_empty\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\t\'\''
  $'provider_len129\trepeat(\'a\',64)\trepeat(\'b\',64)\t\'sign_in\'\tTIMESTAMPTZ \'2026-01-01 00:00:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:01:00+00\'\tTIMESTAMPTZ \'2026-01-01 00:05:00+00\'\t0\t5\tNULL\trepeat(\'c\',64)\trepeat(\'x\',129)'
)
[[ "${#TEST_BEHAVIOR_SQL_ROWS[@]}" == 33 ]] || fail_test "independent behavior SQL oracle count is not 33"

TEST_EXTRACTED_SQL=""
extract_unique_command_sql() {
  local -a arguments=("$@")
  local index command_count=0
  TEST_EXTRACTED_SQL=""
  for ((index=0; index<${#arguments[@]}; index++)); do
    if [[ "${arguments[$index]}" == "-c" ]]; then
      command_count=$((command_count + 1))
      [[ $((index + 1)) -lt ${#arguments[@]} ]] || return 93
      TEST_EXTRACTED_SQL="${arguments[$((index + 1))]}"
    fi
  done
  [[ "$command_count" -eq 1 && -n "$TEST_EXTRACTED_SQL" ]] || return 93
}

expected_behavior_sql() {
  local oracle_wanted_label="$1" oracle_row oracle_row_label oracle_phone oracle_code oracle_purpose oracle_created
  local oracle_resend oracle_expires oracle_attempts oracle_max_attempts oracle_consumed oracle_ip oracle_provider oracle_matches=0
  for oracle_row in "${TEST_BEHAVIOR_SQL_ROWS[@]}"; do
    IFS=$'\t' read -r oracle_row_label oracle_phone oracle_code oracle_purpose oracle_created oracle_resend oracle_expires \
      oracle_attempts oracle_max_attempts oracle_consumed oracle_ip oracle_provider <<<"$oracle_row"
    if [[ "$oracle_row_label" == "$oracle_wanted_label" ]]; then
      oracle_matches=$((oracle_matches + 1))
      printf 'INSERT INTO public.auth_verification_challenges (\n    phone_hash,code_digest,purpose,created_at,updated_at,resend_after,expires_at,\n    attempts,max_attempts,consumed_at,request_ip_hash,provider_request_id\n  ) VALUES (%s,%s,%s,%s,%s,%s,%s,\n    %s,%s,%s,%s,%s);' \
        "$oracle_phone" "$oracle_code" "$oracle_purpose" "$oracle_created" "$oracle_created" "$oracle_resend" "$oracle_expires" \
        "$oracle_attempts" "$oracle_max_attempts" "$oracle_consumed" "$oracle_ip" "$oracle_provider"
    fi
  done
  [[ "$oracle_matches" -eq 1 ]]
}

verify_behavior_sql_oracle() {
  local oracle_verify_label="$1" oracle_actual_sql="$2" oracle_expected_sql
  oracle_expected_sql="$(expected_behavior_sql "$oracle_verify_label")" || return 94
  oracle_actual_sql="${oracle_actual_sql//$'\r\n'/$'\n'}"
  oracle_expected_sql="${oracle_expected_sql//$'\r\n'/$'\n'}"
  [[ "$oracle_actual_sql" == "$oracle_expected_sql" ]] || return 94
}

# Exact ERROR-record matching and SQL/CONTEXT pollution rejection.
REJECTION_MODE=exact
execute_postgres_command() {
  capture_postgres_boundary "$@"
  [[ "$POSTGRES_EXECUTABLE" == /usr/bin/psql ]] || return 97
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

eval "$ORIGINAL_EXECUTE_POSTGRES_COMMAND"

# All 77 rejection scenarios execute the formal run_006_command wrapper and
# exact ERROR parser.  Only the command transport is source-injected.
ORACLE_CALLS=0
execute_postgres_command() {
  capture_postgres_boundary "$@"
  [[ "$POSTGRES_EXECUTABLE" == /usr/bin/psql ]] || return 97
  [[ -n "${TEST_REJECTION_ERRORS[$CURRENT_REJECTION_ORACLE]:-}" ]] || return 97
  printf '%s\n' "${TEST_REJECTION_ERRORS[$CURRENT_REJECTION_ORACLE]}" >&2
  ORACLE_CALLS=$((ORACLE_CALLS + 1))
  return 1
}
run_external_timeout() {
  local timeout_seconds="$1"
  shift
  [[ "$timeout_seconds" == 8 ]] || return 98
  execute_postgres_command "$@"
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

eval "$ORIGINAL_EXECUTE_POSTGRES_COMMAND"
eval "$ORIGINAL_RUN_EXTERNAL_TIMEOUT"

# The command boundary itself is capped; the formal lock path keeps its fixed 8-second value.
grep -Fq 'external_timeout=8' "$RUNNER" || fail_test "formal lock external timeout is not fixed at 8 seconds"
run_external_timeout() {
  local timeout_seconds="$1"
  shift
  [[ "$timeout_seconds" == 1 ]] || return 98
  capture_postgres_boundary "$@"
  [[ "$POSTGRES_EXECUTABLE" == /usr/bin/psql ]] || return 97
  return 124
}
set +e
run_006_command "$exact_db" "$TMP_ROOT/timeout.stdout" "$TMP_ROOT/timeout.stderr" 1
external_timeout_rc=$?
set -e
assert_rc "$external_timeout_rc" 124 "external timeout command boundary"
eval "$ORIGINAL_RUN_EXTERNAL_TIMEOUT"

# Every formal database wrapper, including cleanup, crosses the identical
# runuser + env -i boundary.  The fake transport records argv and stdin but
# never opens a socket.
BOUNDARY_LOG="$TMP_ROOT/postgres-boundary.log"
SCRIPT_TRANSPORT_LOG="$TMP_ROOT/psql-script-transport.log"
: >"$BOUNDARY_LOG"
: >"$SCRIPT_TRANSPORT_LOG"
SCRIPT_TRANSPORT_FORCED_RC=0
SCRIPT_RESIDUAL_OUTPUT=$'0\n'
SCRIPT_RESIDUAL_RC=0
SCRIPT_PREEXISTING_OUTPUT=$'0\n'
SCRIPT_PREEXISTING_RC=0
execute_postgres_command() {
  local joined argument next_argument command_sql="" script_file="" has_script=0 index
  capture_postgres_boundary "$@"
  joined=" ${POSTGRES_CLI_ARGS[*]} "
  printf '%s\t%s\n' "$POSTGRES_EXECUTABLE" "$joined" >>"$BOUNDARY_LOG"
  if [[ "$POSTGRES_EXECUTABLE" == /usr/bin/psql ]]; then
    for ((index=0; index<${#POSTGRES_CLI_ARGS[@]}; index++)); do
      argument="${POSTGRES_CLI_ARGS[$index]}"
      next_argument="${POSTGRES_CLI_ARGS[$((index + 1))]:-}"
      [[ "$argument" == --file=- ]] && has_script=$((has_script + 1))
      if [[ "$argument" == -c || "$argument" == --command ]]; then command_sql="$next_argument"; fi
      [[ "$argument" == --command=* ]] && command_sql="${argument#--command=}"
    done
    if [[ "$command_sql" =~ :\'[A-Za-z_][A-Za-z0-9_]*\'|:\"[A-Za-z_][A-Za-z0-9_]*\"|:\{\?[A-Za-z_][A-Za-z0-9_]*\} ]]; then
      printf 'ERROR: syntax error at or near ":"\n' >&2
      return 3
    fi
    if [[ "$has_script" -gt 0 ]]; then
      script_file="$(mktemp "$TMP_ROOT/psql-script-stdin.XXXXXXXX")"
      cat >"$script_file"
      capture_and_validate_script_transport "$script_file" || return $?
      [[ "$SCRIPT_TRANSPORT_FORCED_RC" -eq 0 ]] || return "$SCRIPT_TRANSPORT_FORCED_RC"
      case "$TEST_SCRIPT_OPERATION" in
        connection_count|database_exists|lock_connections) printf '0\n' ;;
        residual_count) printf '%s' "$SCRIPT_RESIDUAL_OUTPUT"; return "$SCRIPT_RESIDUAL_RC" ;;
        preexisting_count) printf '%s' "$SCRIPT_PREEXISTING_OUTPUT"; return "$SCRIPT_PREEXISTING_RC" ;;
        lock_granted) printf '1\n' ;;
      esac
    fi
    return 0
  fi
  return 0
}
record_state() { :; }
boundary_db="${SCENARIO_DATABASES[challenge_id_nullable]}"
create_database_command "$boundary_db"
drop_database_command "$boundary_db"
admin_psql -At -c 'SELECT 1;' >/dev/null
database_psql "$boundary_db" -At -c 'SELECT 1;' >/dev/null
CREATED_DATABASES=("$boundary_db")
cleanup_database "$boundary_db" || fail_test "formal cleanup boundary fake failed"
assert_no_residual_databases || fail_test "formal residual boundary fake failed"
assert_all_database_names_absent || fail_test "formal preexisting boundary fake failed"
grep -Fq $'/usr/bin/createdb\t' "$BOUNDARY_LOG" || fail_test "createdb bypassed the postgres boundary"
grep -Fq $'/usr/bin/dropdb\t' "$BOUNDARY_LOG" || fail_test "dropdb bypassed the postgres boundary"
grep -Fq $'/usr/bin/psql\t' "$BOUNDARY_LOG" || fail_test "psql bypassed the postgres boundary"
for required_transport in terminate connection_count database_exists residual_count preexisting_count; do
  [[ "$(grep -c "^${required_transport}"$'\t' "$SCRIPT_TRANSPORT_LOG")" -eq 1 ]] || \
    fail_test "$required_transport did not use the unique script transport"
done
grep -Fq $'terminate\tpostgres\t--set=matrix_db='"$boundary_db" "$SCRIPT_TRANSPORT_LOG" || \
  fail_test "cleanup terminate binding changed"
grep -Fq $'connection_count\tpostgres\t--set=matrix_db='"$boundary_db" "$SCRIPT_TRANSPORT_LOG" || \
  fail_test "cleanup connection binding changed"
grep -Fq $'database_exists\tpostgres\t--set=matrix_db='"$boundary_db" "$SCRIPT_TRANSPORT_LOG" || \
  fail_test "cleanup existence binding changed"
grep -Fq $'residual_count\tpostgres\t--set=matrix_prefix='"${RUN_DB_PREFIX}%" "$SCRIPT_TRANSPORT_LOG" || \
  fail_test "residual database binding changed"

# The real residual function explicitly preserves transport rc and accepts only
# the normalized scalar 0.  It is intentionally invoked under a conditional so
# this test reproduces the Bash errexit suppression that exposed the bug.
run_residual_output_case() {
  local label="$1" output="$2" transport_rc="$3" expected_rc="$4" actual_rc
  SCRIPT_RESIDUAL_OUTPUT="$output"
  SCRIPT_RESIDUAL_RC="$transport_rc"
  set +e
  if assert_no_residual_databases; then actual_rc=0; else actual_rc=$?; fi
  set -e
  assert_rc "$actual_rc" "$expected_rc" "residual output case $label"
}
residual_calls_before="$(grep -c '^residual_count'$'\t' "$SCRIPT_TRANSPORT_LOG")"
run_residual_output_case exact_zero $'0\n' 0 0
run_residual_output_case nonzero $'1\n' 0 1
run_residual_output_case empty '' 0 1
run_residual_output_case space $' \n' 0 1
run_residual_output_case trailing_space $'0 \n' 0 1
run_residual_output_case multiline $'0\n1\n' 0 1
run_residual_output_case double_zero $'00\n' 0 1
run_residual_output_case nonnumeric $'not-a-count\n' 0 1
run_residual_output_case zero_transport_failure $'0\n' 42 42
residual_calls_after="$(grep -c '^residual_count'$'\t' "$SCRIPT_TRANSPORT_LOG")"
[[ $((residual_calls_after - residual_calls_before)) -eq 9 ]] || \
  fail_test "residual output matrix did not execute the real query function nine times"
SCRIPT_RESIDUAL_OUTPUT=$'0\n'
SCRIPT_RESIDUAL_RC=0

# Reproduce the field failure: psql command transport sends the token literally,
# while the formal preexisting query sends the same SQL through --file=-.
matrix_names="$(printf '%s\n' "${SCENARIO_DATABASES[@]}" | sort | paste -sd, -)"
legacy_assert_all_database_names_absent() {
  local count rc
  set +e
  count="$(admin_psql -At "--set=matrix_names=$matrix_names" -c \
    "SELECT count(*) FROM pg_catalog.pg_database WHERE datname = ANY(pg_catalog.string_to_array(:'matrix_names', ','));" \
    2>"$TMP_ROOT/legacy-preexisting.stderr")"
  rc=$?
  set -e
  [[ "$rc" -eq 0 ]] || return 74
  [[ "$count" == 0 ]]
}
set +e
( legacy_assert_all_database_names_absent ) >/dev/null
legacy_preexisting_rc=$?
set -e
assert_rc "$legacy_preexisting_rc" 74 "legacy preexisting -c transport reproduction"
assert_contains "$TMP_ROOT/legacy-preexisting.stderr" 'syntax error at or near ":"'
assert_all_database_names_absent || fail_test "preexisting stdin transport did not replace psql variables"
[[ "$(grep -c '^preexisting_count'$'\t' "$SCRIPT_TRANSPORT_LOG")" -eq 2 ]] || \
  fail_test "preexisting query did not traverse --file=- twice"

# Both formal preflight queries map transport failures to 74 before dispatch.
# The real assert_all_database_names_absent and assert_no_residual_databases
# functions remain active; only non-database setup and dispatch are injected.
run_preflight_failure_case() {
  local label="$1" preexisting_rc="$2" residual_output="$3" residual_rc="$4" expected_rc=74 actual_rc
  local state_file="$TMP_ROOT/preflight-${label}.state" dispatch_file="$TMP_ROOT/preflight-${label}.dispatch"
  : >"$state_file"
  rm -f -- "$dispatch_file"
  SCRIPT_PREEXISTING_OUTPUT=$'0\n'
  SCRIPT_PREEXISTING_RC="$preexisting_rc"
  SCRIPT_RESIDUAL_OUTPUT="$residual_output"
  SCRIPT_RESIDUAL_RC="$residual_rc"
  set +e
  (
    validate_static_inputs() { :; }
    validate_all_database_names() { :; }
    validate_orchestrator_identity() { :; }
    validate_inputs() { :; }
    initialize_runtime() { :; }
    record_state() { printf '%s\n' "$1" >>"$state_file"; }
    record_database_mappings() { :; }
    verify_postgresql_identity() { :; }
    create_database_command() { printf 'CREATE_DATABASE forbidden\n' >"$dispatch_file"; return 99; }
    create_database() { printf 'CREATE_DATABASE forbidden\n' >"$dispatch_file"; return 99; }
    dispatch_all_scenarios() { printf 'SCENARIO_STARTED forbidden\nCREATE_DATABASE forbidden\n' >"$dispatch_file"; }
    run_matrix
  ) >/dev/null 2>&1
  actual_rc=$?
  set -e
  assert_rc "$actual_rc" "$expected_rc" "$label preflight failure"
  [[ ! -e "$dispatch_file" ]] || fail_test "$label preflight reached dispatch or database creation"
  ! grep -Fq 'SCENARIO_STARTED' "$state_file" || fail_test "$label preflight recorded SCENARIO_STARTED"
}
run_preflight_failure_case preexisting_transport 42 $'0\n' 0
run_preflight_failure_case residual_transport 0 $'0\n' 42
run_preflight_failure_case residual_nonzero 0 $'1\n' 0
SCRIPT_PREEXISTING_OUTPUT=$'0\n'
SCRIPT_PREEXISTING_RC=0
SCRIPT_RESIDUAL_OUTPUT=$'0\n'
SCRIPT_RESIDUAL_RC=0

# The public helpers fix binding names and arity.  The low-level fake rejects
# missing, duplicate, wrong-name, empty-value, and extra bindings.
transport_calls_before="$(wc -l <"$SCRIPT_TRANSPORT_LOG" | tr -d ' ')"
for invalid_helper in missing_admin extra_admin wrong_admin missing_database extra_database wrong_database cross_scope; do
  set +e
  case "$invalid_helper" in
    missing_admin) ( admin_psql_script terminate ) >/dev/null 2>&1 ;;
    extra_admin) ( admin_psql_script terminate "$boundary_db" extra ) >/dev/null 2>&1 ;;
    wrong_admin) ( admin_psql_script wrong "$boundary_db" ) >/dev/null 2>&1 ;;
    missing_database) ( database_psql_script "$boundary_db" lock_holder ) >/dev/null 2>&1 ;;
    extra_database) ( database_psql_script "$boundary_db" lock_holder "memoryai_auth_matrix_lock_${RUN_NONCE}" extra ) >/dev/null 2>&1 ;;
    wrong_database) ( database_psql_script "$boundary_db" wrong "memoryai_auth_matrix_lock_${RUN_NONCE}" ) >/dev/null 2>&1 ;;
    cross_scope) ( psql_script_command postgres lock_holder "memoryai_auth_matrix_lock_${RUN_NONCE}" ) >/dev/null 2>&1 ;;
  esac
  invalid_helper_rc=$?
  set -e
  assert_rc "$invalid_helper_rc" 64 "$invalid_helper helper contract"
done
[[ "$(wc -l <"$SCRIPT_TRANSPORT_LOG" | tr -d ' ')" == "$transport_calls_before" ]] || \
  fail_test "rejected helper input reached postgres transport"

run_malformed_script_transport() {
  local mode="$1"
  local -a binding_arguments=()
  case "$mode" in
    missing) binding_arguments=() ;;
    duplicate) binding_arguments=("--set=matrix_db=$boundary_db" "--set=matrix_db=$boundary_db") ;;
    wrong_name) binding_arguments=("--set=wrong_name=$boundary_db") ;;
    empty_value) binding_arguments=(--set=matrix_db=) ;;
    extra) binding_arguments=("--set=matrix_db=$boundary_db" "--set=matrix_prefix=${RUN_DB_PREFIX}%") ;;
  esac
  psql_command -X --no-psqlrc -v ON_ERROR_STOP=1 -d postgres \
    "${binding_arguments[@]}" --file=- <<'MALFORMED_SCRIPT_SQL'
SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE datname = :'matrix_db' AND pid <> pg_catalog.pg_backend_pid();
MALFORMED_SCRIPT_SQL
}
for malformed_mode in missing duplicate wrong_name empty_value extra; do
  set +e
  run_malformed_script_transport "$malformed_mode" >/dev/null 2>&1
  malformed_rc=$?
  set -e
  assert_rc "$malformed_rc" 95 "$malformed_mode script binding"
done

SCRIPT_TRANSPORT_FORCED_RC=42
set +e
admin_psql_script terminate "$boundary_db" >/dev/null <<'RAW_RC_SQL'
SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE datname = :'matrix_db' AND pid <> pg_catalog.pg_backend_pid();
RAW_RC_SQL
script_raw_rc=$?
set -e
assert_rc "$script_raw_rc" 42 "stdin psql transport rc"
SCRIPT_TRANSPORT_FORCED_RC=0
eval "$ORIGINAL_EXECUTE_POSTGRES_COMMAND"

# cleanup_or_fail returns exactly 75 for each failure class.
CLEANUP_STATE="$TMP_ROOT/cleanup.state"
record_state() { printf '%s\n' "$1" >>"$CLEANUP_STATE"; }
CLEANUP_MODE=success
DROP_SUCCEEDED=0
PREEXISTING_NAMES=0
CLEANUP_RESIDUAL_OUTPUT=$'0\n'
CLEANUP_RESIDUAL_RC=0
execute_postgres_command() {
  local script_file has_script=0 argument
  capture_postgres_boundary "$@"
  [[ "$POSTGRES_EXECUTABLE" == /usr/bin/psql ]] || return 97
  for argument in "${POSTGRES_CLI_ARGS[@]}"; do [[ "$argument" == --file=- ]] && has_script=$((has_script + 1)); done
  [[ "$has_script" -eq 1 ]] || return 95
  script_file="$(mktemp "$TMP_ROOT/cleanup-script-stdin.XXXXXXXX")"
  cat >"$script_file"
  capture_and_validate_script_transport "$script_file" || return $?
  case "$TEST_SCRIPT_OPERATION" in
    terminate)
      [[ "$CLEANUP_MODE" == terminate ]] && return 91
      return 0 ;;
    connection_count)
      [[ "$CLEANUP_MODE" == connections ]] && printf '1\n' || printf '0\n'
      return 0 ;;
    preexisting_count) printf '%s\n' "$PREEXISTING_NAMES"; return 0 ;;
    database_exists)
      if [[ "$CLEANUP_MODE" == exists || "$CLEANUP_MODE" == dropdb ]]; then printf '1\n'; else printf '0\n'; fi
      return 0 ;;
    residual_count) printf '%s' "$CLEANUP_RESIDUAL_OUTPUT"; return "$CLEANUP_RESIDUAL_RC" ;;
    *) return 95 ;;
  esac
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

# A residual query transport failure is a cleanup failure even when it printed
# zero.  Clean exits map to 75; an existing business rc remains authoritative.
for residual_exit_spec in 0:75 70:70; do
  residual_original_rc="${residual_exit_spec%%:*}"
  residual_expected_rc="${residual_exit_spec##*:}"
  : >"$CLEANUP_STATE"
  CLEANUP_MODE=success
  CLEANUP_RESIDUAL_OUTPUT=$'0\n'
  CLEANUP_RESIDUAL_RC=42
  CREATED_DATABASES=()
  CLEANUP_RECORDED=0
  set +e
  (
    RUN_ACTIVE=1
    remove_work_directory() { return 0; }
    on_exit "$residual_original_rc"
  ) >/dev/null 2>&1
  residual_cleanup_rc=$?
  set -e
  assert_rc "$residual_cleanup_rc" "$residual_expected_rc" "residual cleanup with original rc $residual_original_rc"
  assert_contains "$CLEANUP_STATE" "FAILED_cleanup_residual_1"
  assert_contains "$CLEANUP_STATE" "CLEANUP_FAILED_RC_75"
done
CLEANUP_RESIDUAL_OUTPUT=$'0\n'
CLEANUP_RESIDUAL_RC=0

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
BEHAVIOR_SQL_ORACLE_TOTAL=0
TEST_FORCE_BEHAVIOR_RESULT=""
DISPATCH_REJECTION_TOTAL=0
record_state() { printf '%s\n' "$1" >>"$DISPATCH_STATE"; }
create_database() { validate_test_database_name "$1"; CREATED_DATABASES+=("$1"); CREATE_COUNT=$((CREATE_COUNT + 1)); }
apply_fixture_001_005() { :; }
apply_006() { :; }
run_sql() { :; }
catalog_snapshot() { printf 'catalog-snapshot\n' >"$2"; }
cleanup_or_fail() { remove_created_database "$1"; CLEANUP_COUNT=$((CLEANUP_COUNT + 1)); return 0; }
execute_postgres_command() {
  local behavior_result argument script_file="" has_script=0
  capture_postgres_boundary "$@"
  [[ "$POSTGRES_EXECUTABLE" == /usr/bin/psql ]] || return 97
  for argument in "${POSTGRES_CLI_ARGS[@]}"; do [[ "$argument" == --file=- ]] && has_script=$((has_script + 1)); done
  if [[ "$has_script" -gt 0 ]]; then
    script_file="$(mktemp "$TMP_ROOT/dispatch-script-stdin.XXXXXXXX")"
    cat >"$script_file"
    capture_and_validate_script_transport "$script_file" || return $?
    case "$TEST_SCRIPT_OPERATION" in
      lock_holder)
        trap 'rm -f -- "$HOLDER_MARKER"; exit 0' TERM INT EXIT
        : >"$HOLDER_MARKER"
        sleep 4
        return 0 ;;
      lock_granted) [[ -e "$HOLDER_MARKER" ]] && printf '1\n' || printf '0\n'; return 0 ;;
      lock_connections) printf '0\n'; return 0 ;;
      terminate) return 0 ;;
      connection_count|database_exists|residual_count|preexisting_count) printf '0\n'; return 0 ;;
      *) return 95 ;;
    esac
  fi
  if [[ -n "$CURRENT_REJECTION_ORACLE" ]]; then
    [[ -n "${TEST_REJECTION_ERRORS[$CURRENT_REJECTION_ORACLE]:-}" ]] || return 97
    printf '%s\n' "${TEST_REJECTION_ERRORS[$CURRENT_REJECTION_ORACLE]}" >&2
    DISPATCH_REJECTION_TOTAL=$((DISPATCH_REJECTION_TOTAL + 1))
    return 1
  fi
  if [[ -n "$CURRENT_BEHAVIOR_ORACLE" ]]; then
    extract_unique_command_sql "${POSTGRES_CLI_ARGS[@]}" || return $?
    verify_behavior_sql_oracle "$CURRENT_BEHAVIOR_ORACLE" "$TEST_EXTRACTED_SQL" || return 94
    BEHAVIOR_SQL_ORACLE_TOTAL=$((BEHAVIOR_SQL_ORACLE_TOTAL + 1))
    behavior_result="${TEST_FORCE_BEHAVIOR_RESULT:-${TEST_BEHAVIOR_RESULTS[$CURRENT_BEHAVIOR_ORACLE]:-}}"
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
  execute_postgres_command "$@"
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
[[ "$BEHAVIOR_SQL_ORACLE_TOTAL" == "33" ]] || fail_test "not all 33 behavior -c SQL statements passed the independent oracle"
[[ "$(grep -c '^BEHAVIOR_CASE_CALLED ' "$DISPATCH_STATE")" == "33" ]] || fail_test "not all behavior cases executed"
[[ ! -e "$HOLDER_MARKER" ]] || fail_test "lock holder marker remained"
for lock_transport in lock_holder lock_granted lock_connections; do
  lock_transport_count="$(grep -c "^${lock_transport}"$'\t' "$SCRIPT_TRANSPORT_LOG")"
  if [[ "$lock_transport" == lock_holder ]]; then
    [[ "$lock_transport_count" -eq 1 ]] || fail_test "lock_holder did not use exactly one stdin script transport"
  else
    [[ "$lock_transport_count" -ge 1 && "$lock_transport_count" -le 50 ]] || \
      fail_test "$lock_transport poll count is outside 1-50"
  fi
  expected_lock_transport="${lock_transport}"$'\t'"${SCENARIO_DATABASES[lock_timeout]}"$'\t'"--set=lock_app=memoryai_auth_matrix_lock_${RUN_NONCE}"
  while IFS= read -r lock_transport_row; do
    [[ "$lock_transport_row" == "$expected_lock_transport" ]] || fail_test "$lock_transport binding changed"
  done < <(grep "^${lock_transport}"$'\t' "$SCRIPT_TRANSPORT_LOG")
done

# SQL drift probes call the same extraction and SQL-oracle functions as the
# complete fake dispatcher.  A SQL mismatch returns 94 without fabricating a
# constraint ERROR.
[[ "$(expected_behavior_sql attempts_negative)" != "$(expected_behavior_sql attempts_zero)" ]] || \
  fail_test "independent attempts SQL fixtures collapsed to the same boundary"
attempts_zero_drift_sql="$(expected_behavior_sql attempts_zero)"
hash_len64_drift_sql="$(expected_behavior_sql phone_hash_len64)"
timing_strict_drift_sql="$(expected_behavior_sql timing_strictly_increasing)"
consumed_equal_drift_sql="$(expected_behavior_sql consumed_equal_created)"
provider_len129_drift_sql="$(expected_behavior_sql provider_len129)"
wrong_column_sql="$(expected_behavior_sql phone_hash_len63)"
wrong_column_sql="${wrong_column_sql/phone_hash,code_digest/wrong_phone_hash,code_digest}"
wrong_unrelated_value_sql="$(expected_behavior_sql attempts_negative)"
wrong_unrelated_value_sql="$(printf '%s' "$wrong_unrelated_value_sql" | sed "0,/repeat('b',64)/s//repeat('b',63)/")"
missing_field_sql="$(expected_behavior_sql provider_len128)"
missing_field_sql="$(printf '%s' "$missing_field_sql" | sed -e 's/,provider_request_id$//' -e "s/,repeat('x',128));$/);/")"
[[ "$wrong_unrelated_value_sql" != "$(expected_behavior_sql attempts_negative)" ]] || fail_test "unrelated-value SQL drift fixture did not change"
[[ "$missing_field_sql" != "$(expected_behavior_sql provider_len128)" ]] || fail_test "missing-field SQL drift fixture did not change"
provider_space_sql="$(expected_behavior_sql provider_len1)"
provider_space_sql="$(printf '%s' "$provider_space_sql" | sed "s/'x');$/'x ');/")"
time_literal_space_sql="$(expected_behavior_sql purpose_sign_in)"
time_literal_space_sql="$(printf '%s' "$time_literal_space_sql" | sed '0,/2026-01-01 00:00:00/s//2026-01-01  00:00:00/')"
appended_statement_sql="$(expected_behavior_sql purpose_sign_in)"$'\nSELECT 1;'
syntax_space_sql="$(expected_behavior_sql purpose_sign_in)"
syntax_space_sql="${syntax_space_sql/) VALUES /)  VALUES }"
[[ "$provider_space_sql" != "$(expected_behavior_sql provider_len1)" ]] || fail_test "provider-space SQL probe did not change"
[[ "$time_literal_space_sql" != "$(expected_behavior_sql purpose_sign_in)" ]] || fail_test "time-literal SQL probe did not change"
[[ "$syntax_space_sql" != "$(expected_behavior_sql purpose_sign_in)" ]] || fail_test "syntax-space SQL probe did not change"

declare -a TEST_94_LABELS=(
  attempts_negative phone_hash_len63 timing_resend_equal_created consumed_before_created provider_len128
  phone_hash_len63 attempts_negative provider_len128 provider_len1 purpose_sign_in purpose_sign_in purpose_sign_in
)
declare -a TEST_94_SQLS=(
  "$attempts_zero_drift_sql" "$hash_len64_drift_sql" "$timing_strict_drift_sql" "$consumed_equal_drift_sql" "$provider_len129_drift_sql"
  "$wrong_column_sql" "$wrong_unrelated_value_sql" "$missing_field_sql" "$provider_space_sql" "$time_literal_space_sql"
  "$appended_statement_sql" "$syntax_space_sql"
)
declare -a TEST_94_DESCRIPTIONS=(
  'attempts -1 changed to 0' 'hash length 63 changed to 64' 'timing equality changed to increasing'
  'consumed before changed to equal' 'provider length 128 changed to 129' 'wrong target column'
  'unrelated boundary value changed' 'required field missing' 'provider value gains trailing space'
  'timestamp literal internal whitespace changed' 'statement appended' 'SQL syntax whitespace changed'
)
[[ "${#TEST_94_LABELS[@]}" -eq 12 && "${#TEST_94_SQLS[@]}" -eq 12 && "${#TEST_94_DESCRIPTIONS[@]}" -eq 12 ]] || \
  fail_test "94 SQL probe table must contain 12 aligned cases"

pass_rejection_count="$(grep -c '^EXPECTED_REJECTION_PASS ' "$DISPATCH_STATE")"
pass_behavior_count="$(grep -c '^BEHAVIOR_PASS ' "$DISPATCH_STATE")"
for ((sql_probe_index=0; sql_probe_index<12; sql_probe_index++)); do
  sql_probe_label="${TEST_94_LABELS[$sql_probe_index]}"
  sql_probe_statement="${TEST_94_SQLS[$sql_probe_index]}"
  sql_probe_description="${TEST_94_DESCRIPTIONS[$sql_probe_index]}"
  [[ -z "$CURRENT_REJECTION_ORACLE" ]] || fail_test "$sql_probe_description started with a rejection oracle active"
  : >"$TMP_ROOT/sql-probe.stderr"
  CURRENT_BEHAVIOR_ORACLE="$sql_probe_label"
  set +e
  database_psql "${SCENARIO_DATABASES[constraint_behavior]}" -c "$sql_probe_statement" >/dev/null 2>"$TMP_ROOT/sql-probe.stderr"
  sql_probe_rc=$?
  set -e
  CURRENT_BEHAVIOR_ORACLE=""
  assert_rc "$sql_probe_rc" 94 "$sql_probe_description"
  [[ ! -s "$TMP_ROOT/sql-probe.stderr" ]] || fail_test "$sql_probe_description generated a fake constraint ERROR"

  if [[ "${TEST_BEHAVIOR_RESULTS[$sql_probe_label]}" == PASS ]]; then
    set +e
    (
      set -e
      CURRENT_BEHAVIOR_ORACLE="$sql_probe_label"
      database_psql "${SCENARIO_DATABASES[constraint_behavior]}" -c "$sql_probe_statement" >/dev/null
    ) >/dev/null 2>&1
    sql_probe_parser_rc=$?
    set -e
    assert_rc "$sql_probe_parser_rc" 94 "$sql_probe_description formal PASS wrapper rejection"
  else
    set +e
    ( expect_behavior_rejection "${SCENARIO_DATABASES[constraint_behavior]}" "$sql_probe_label" "$sql_probe_statement" ) >/dev/null 2>&1
    sql_probe_parser_rc=$?
    set -e
    assert_rc "$sql_probe_parser_rc" 73 "$sql_probe_description formal parser rejection"
    [[ ! -s "$WORK_DIR/behavior_${sql_probe_label}.stderr" ]] || fail_test "$sql_probe_description parser received a fake constraint ERROR"
  fi
  [[ "$(grep -c '^EXPECTED_REJECTION_PASS ' "$DISPATCH_STATE")" == "$pass_rejection_count" ]] || \
    fail_test "$sql_probe_description recorded EXPECTED_REJECTION_PASS"
  [[ "$(grep -c '^BEHAVIOR_PASS ' "$DISPATCH_STATE")" == "$pass_behavior_count" ]] || \
    fail_test "$sql_probe_description recorded BEHAVIOR_PASS"
done

# The outer command wrapper requires exactly one -c SQL argument.
CURRENT_BEHAVIOR_ORACLE=purpose_sign_in
set +e
psql_command -d "${SCENARIO_DATABASES[constraint_behavior]}" >/dev/null 2>&1
missing_command_rc=$?
psql_command -c "$(expected_behavior_sql purpose_sign_in)" -c "$(expected_behavior_sql purpose_sign_in)" >/dev/null 2>&1
duplicate_command_rc=$?
set -e
CURRENT_BEHAVIOR_ORACLE=""
assert_rc "$missing_command_rc" 93 "missing -c SQL"
assert_rc "$duplicate_command_rc" 93 "duplicate -c SQL"

run_test_behavior_insert() {
  local wanted="$1" caller_expectation="$2" row label phone code purpose created resend expires attempts max_attempts consumed ip provider matches=0
  for row in "${TEST_BEHAVIOR_SQL_ROWS[@]}"; do
    IFS=$'\t' read -r label phone code purpose created resend expires attempts max_attempts consumed ip provider <<<"$row"
    if [[ "$label" == "$wanted" ]]; then
      matches=$((matches + 1))
      run_behavior_insert "${SCENARIO_DATABASES[constraint_behavior]}" "$label" "$caller_expectation" \
        "$phone" "$code" "$purpose" "$created" "$resend" "$expires" "$attempts" "$max_attempts" "$consumed" "$ip" "$provider"
    fi
  done
  [[ "$matches" -eq 1 ]]
}

# PASS/REJECT and constraint drift must traverse the formal database wrapper,
# independent SQL oracle, and formal behavior ERROR parser.
TEST_FORCE_BEHAVIOR_RESULT='ERROR: insert ck_auth_challenge_purpose violates check constraint'
set +e
( set -e; run_test_behavior_insert purpose_sign_in PASS ) >/dev/null 2>&1
valid_returned_constraint_rc=$?
set -e
[[ "$valid_returned_constraint_rc" -ne 0 ]] || fail_test "legal behavior accepted a forced constraint ERROR"

TEST_FORCE_BEHAVIOR_RESULT=PASS
set +e
( set -e; run_test_behavior_insert purpose_other ck_auth_challenge_purpose ) >/dev/null 2>&1
invalid_returned_success_rc=$?
set -e
[[ "$invalid_returned_success_rc" -ne 0 ]] || fail_test "invalid behavior accepted forced success"

TEST_FORCE_BEHAVIOR_RESULT='ERROR: insert different_constraint violates check constraint'
set +e
( set -e; run_test_behavior_insert purpose_other ck_auth_challenge_purpose ) >/dev/null 2>&1
wrong_constraint_rc=$?
set -e
[[ "$wrong_constraint_rc" -ne 0 ]] || fail_test "behavior parser accepted the wrong constraint"
TEST_FORCE_BEHAVIOR_RESULT=""

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
