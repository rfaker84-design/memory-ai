#!/usr/bin/env bash
set -Eeuo pipefail

readonly TEST_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly RUNNER="$TEST_SCRIPT_DIR/run-006-auth-pg14-matrix.sh"
readonly TMP_ROOT="$(mktemp -d)"
cleanup_test() {
  if [[ "${TEST_MANAGED_BACKEND_PID:-}" =~ ^[1-9][0-9]*$ ]] && kill -0 "$TEST_MANAGED_BACKEND_PID" 2>/dev/null; then
    kill -TERM "$TEST_MANAGED_BACKEND_PID" 2>/dev/null || true
    wait "$TEST_MANAGED_BACKEND_PID" 2>/dev/null || true
  fi
  rm -rf -- "$TMP_ROOT"
}
trap cleanup_test EXIT

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
ORIGINAL_CLEANUP_OR_FAIL="$(declare -f cleanup_or_fail)"
ORIGINAL_RUN_EXTERNAL_TIMEOUT="$(declare -f run_external_timeout)"
ORIGINAL_STARTUP_PROBE_FILE_OWNER="$(declare -f startup_probe_file_owner)"
ORIGINAL_STARTUP_PROBE_FILE_GROUP="$(declare -f startup_probe_file_group)"
ORIGINAL_STARTUP_PROBE_FILE_MODE="$(declare -f startup_probe_file_mode)"
ORIGINAL_CREATE_QUERY_CAPTURE_FILE="$(declare -f create_query_capture_file)"
ORIGINAL_QUERY_CAPTURE_FILE_OWNER="$(declare -f query_capture_file_owner)"
ORIGINAL_QUERY_CAPTURE_FILE_GROUP="$(declare -f query_capture_file_group)"
ORIGINAL_QUERY_CAPTURE_FILE_MODE="$(declare -f query_capture_file_mode)"
ORIGINAL_READ_LOCK_HOLDER_WRAPPER_SNAPSHOT="$(declare -f read_lock_holder_wrapper_snapshot)"
ORIGINAL_CAPTURE_LOCK_HOLDER_WRAPPER_STARTTIME="$(declare -f capture_lock_holder_wrapper_starttime)"
ORIGINAL_LOCK_HOLDER_WRAPPER_POLL_SLEEP="$(declare -f lock_holder_wrapper_poll_sleep)"
ORIGINAL_WAIT_LOCK_HOLDER_WRAPPER_CHILD="$(declare -f wait_lock_holder_wrapper_child)"
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
  create_query_capture_file() { printf 'query-capture-file\n' >>"$NO_IO_LOG"; return 99; }
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
QUERY_CAPTURE_OWNER_LOG="$TMP_ROOT/query-capture-owner-checks.log"
QUERY_CAPTURE_GROUP_LOG="$TMP_ROOT/query-capture-group-checks.log"
QUERY_CAPTURE_MODE_LOG="$TMP_ROOT/query-capture-mode-checks.log"
QUERY_CAPTURE_TEST_OWNER=0
QUERY_CAPTURE_TEST_GROUP=0
QUERY_CAPTURE_TEST_GROUP_NAME=root
QUERY_CAPTURE_POST_EXEC_GID_MARKER=""
: >"$QUERY_CAPTURE_OWNER_LOG"
: >"$QUERY_CAPTURE_GROUP_LOG"
: >"$QUERY_CAPTURE_MODE_LOG"
create_query_capture_file() {
  [[ "$#" -eq 2 ]] || return 76
  local operation="$1" stream="$2" file
  case "$operation" in
    connection_count|database_exists|residual_count|preexisting_count|lock_granted|lock_connections|lock_backend_pid|lock_terminate) ;;
    *) return 76 ;;
  esac
  case "$stream" in stdout|stderr) ;; *) return 76 ;; esac
  file="$WORK_DIR/postgresql-query.${operation}.${stream}.${BASHPID}.${RANDOM}"
  ( umask 077; : >"$file" ) || return 76
  printf '%s\n' "$file"
}
query_capture_file_owner() {
  printf '%s\n' "$1" >>"$QUERY_CAPTURE_OWNER_LOG"
  printf '%s\n' "$QUERY_CAPTURE_TEST_OWNER"
}
query_capture_file_group() {
  printf '%s\n' "$1" >>"$QUERY_CAPTURE_GROUP_LOG"
  if [[ -n "$QUERY_CAPTURE_POST_EXEC_GID_MARKER" && -e "$QUERY_CAPTURE_POST_EXEC_GID_MARKER" ]]; then
    printf '1000\n'
  else
    printf '%s\n' "$QUERY_CAPTURE_TEST_GROUP"
  fi
}
query_capture_file_mode() {
  printf '%s\n' "$1" >>"$QUERY_CAPTURE_MODE_LOG"
  printf '600\n'
}

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
  [lock_granted]="SELECT count(*) FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid WHERE a.datname=pg_catalog.current_database() AND a.usename=CURRENT_USER AND a.application_name=:'lock_app' AND a.backend_type='client backend' AND l.database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) AND l.relation='public.auth_verification_challenges'::regclass AND l.mode='AccessExclusiveLock' AND l.granted;"
  [lock_connections]="SELECT CASE WHEN count(*)=0 THEN 0 WHEN count(*)=1 AND pg_catalog.bool_and(usename=CURRENT_USER AND CURRENT_USER='postgres'::name AND backend_type='client backend') THEN 1 ELSE 2 END FROM pg_catalog.pg_stat_activity WHERE datname=pg_catalog.current_database() AND application_name=:'lock_app';"
  [lock_backend_pid]=$'WITH holders AS MATERIALIZED (\n  SELECT DISTINCT a.pid\n  FROM pg_catalog.pg_stat_activity a\n  JOIN pg_catalog.pg_locks l ON l.pid = a.pid\n  WHERE a.datname = pg_catalog.current_database()\n    AND a.usename = CURRENT_USER\n    AND CURRENT_USER = \'postgres\'::name\n    AND a.application_name = :\'lock_app\'\n    AND a.backend_type = \'client backend\'\n    AND a.pid <> pg_catalog.pg_backend_pid()\n    AND l.database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database())\n    AND l.relation = \'public.auth_verification_challenges\'::regclass\n    AND l.mode = \'AccessExclusiveLock\'\n    AND l.granted\n)\nSELECT pg_catalog.lpad(min(pid)::text, 10, \'0\') FROM holders HAVING count(*) = 1;'
  [lock_terminate]=$'WITH holders AS MATERIALIZED (\n  SELECT DISTINCT a.pid\n  FROM pg_catalog.pg_stat_activity a\n  JOIN pg_catalog.pg_locks l ON l.pid = a.pid\n  WHERE a.datname = pg_catalog.current_database()\n    AND a.usename = CURRENT_USER\n    AND CURRENT_USER = \'postgres\'::name\n    AND a.application_name = :\'lock_app\'\n    AND a.backend_type = \'client backend\'\n    AND a.pid <> pg_catalog.pg_backend_pid()\n    AND l.database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database())\n    AND l.relation = \'public.auth_verification_challenges\'::regclass\n    AND l.mode = \'AccessExclusiveLock\'\n    AND l.granted\n), eligible AS MATERIALIZED (\n  SELECT pid FROM holders WHERE pid = :\'lock_pid\'::integer AND (SELECT count(*) FROM holders) = 1\n), terminated AS MATERIALIZED (\n  SELECT pg_catalog.pg_terminate_backend(pid) AS ok FROM eligible\n)\nSELECT count(*) FROM terminated WHERE ok;'
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
  local -a set_arguments=() token_names=()
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
      --set=*) set_count=$((set_count + 1)); set_argument="$argument"; set_arguments+=("$argument") ;;
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
  [[ "$file_count" -eq 1 && "$command_count" -eq 0 && "$set_count" -ge 1 && "$set_count" -le 2 && \
     "$on_error_stop_count" -eq 1 && "$database_count" -eq 1 && "$x_count" -eq 1 && \
     "$no_psqlrc_count" -eq 1 && "$verbosity_variable_count" -eq 0 ]] || return 95
  for candidate_name in matrix_db matrix_prefix matrix_names lock_app lock_pid; do
    if [[ "$sql" == *":'$candidate_name'"* ]]; then
      token_count=$((token_count + 1))
      token_name="$candidate_name"
      token_names+=("$candidate_name")
    fi
  done
  if [[ "$operation" != lock_terminate ]]; then
    [[ "$token_count" -eq 1 && "$set_count" -eq 1 && "$set_argument" == "--set=${token_name}="* && \
       "$set_argument" != "--set=${token_name}=" ]] || return 95
  fi
  case "$operation" in
    terminate|connection_count|database_exists)
      [[ "$database" == postgres && "$token_name" == matrix_db ]] || return 95
      validate_test_database_name "${set_argument#--set=matrix_db=}" || return 95 ;;
    residual_count)
      [[ "$database" == postgres && "$set_argument" == "--set=matrix_prefix=${RUN_DB_PREFIX}%" ]] || return 95 ;;
    preexisting_count)
      [[ "$database" == postgres && "$token_name" == matrix_names ]] || return 95
      validate_matrix_database_list "${set_argument#--set=matrix_names=}" || return 95 ;;
    lock_holder|lock_granted|lock_connections|lock_backend_pid)
      validate_test_database_name "$database" || return 95
      [[ "$token_count" -eq 1 && "$set_count" -eq 1 && "$token_name" == lock_app && \
         "$set_argument" == "--set=lock_app=memoryai_auth_matrix_lock_${RUN_NONCE}" ]] || return 95 ;;
    lock_terminate)
      validate_test_database_name "$database" || return 95
      [[ "$token_count" -eq 2 && "$set_count" -eq 2 && "${token_names[*]}" == "lock_app lock_pid" ]] || return 95
      [[ "${set_arguments[0]}" == "--set=lock_app=memoryai_auth_matrix_lock_${RUN_NONCE}" ]] || return 95
      [[ "${set_arguments[1]}" =~ ^--set=lock_pid=[0-9]{10}$ ]] || return 95
      [[ "${set_arguments[1]}" != "--set=lock_pid=0000000000" ]] || return 95 ;;
    *) return 95 ;;
  esac
  if [[ -n "${SCRIPT_TRANSPORT_LOG:-}" ]]; then
    printf '%s\t%s\t%s\n' "$operation" "$database" "$(IFS=';'; printf '%s' "${set_arguments[*]}")" >>"$SCRIPT_TRANSPORT_LOG"
  fi
  TEST_SCRIPT_OPERATION="$operation"
  TEST_SCRIPT_SET_ARGUMENT="$set_argument"
  TEST_SCRIPT_SET_ARGUMENTS=("${set_arguments[@]}")
  TEST_SCRIPT_DATABASE="$database"
}

# Formal mode keeps root orchestration while rejecting every non-fixed database
# transport input before any runtime directory or database command is created.
ORIGINAL_FIXED_EXECUTABLE_AVAILABLE="$(declare -f fixed_executable_available)"
ORIGINAL_ORCHESTRATOR_UID="$(declare -f orchestrator_uid)"
ORIGINAL_ORCHESTRATOR_GID="$(declare -f orchestrator_gid)"
ORIGINAL_DATABASE_OS_USER_EXISTS="$(declare -f database_os_user_exists)"
fixed_executable_available() { return 0; }
orchestrator_uid() { printf '1000\n'; }
orchestrator_gid() { printf '0\n'; }
set +e
( validate_orchestrator_identity ) >/dev/null 2>&1
non_root_rc=$?
set -e
assert_rc "$non_root_rc" 76 "non-root orchestrator"
orchestrator_uid() { printf '0\n'; }
orchestrator_gid() { printf '1000\n'; }
set +e
( validate_orchestrator_identity ) >/dev/null 2>&1
non_root_group_rc=$?
set -e
assert_rc "$non_root_group_rc" 76 "root uid with non-root primary gid"
orchestrator_gid() { printf '0\n'; }
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
eval "$ORIGINAL_ORCHESTRATOR_GID"
eval "$ORIGINAL_DATABASE_OS_USER_EXISTS"

IDENTITY_EVIDENCE='140023|postgres|postgres|postgres|unix_socket'
IDENTITY_STDERR=''
IDENTITY_TRANSPORT_RC=0
IDENTITY_BOUNDARY_LOG="$TMP_ROOT/identity-boundary.log"
IDENTITY_OWNER_LOG="$TMP_ROOT/identity-owner-checks.log"
IDENTITY_GROUP_LOG="$TMP_ROOT/identity-group-checks.log"
IDENTITY_MODE_LOG="$TMP_ROOT/identity-mode-checks.log"
IDENTITY_GROUP=0
: >"$IDENTITY_BOUNDARY_LOG"
: >"$IDENTITY_OWNER_LOG"
: >"$IDENTITY_GROUP_LOG"
: >"$IDENTITY_MODE_LOG"
startup_probe_file_owner() {
  printf '%s\n' "$1" >>"$IDENTITY_OWNER_LOG"
  printf '0\n'
}
startup_probe_file_group() {
  printf '%s\n' "$1" >>"$IDENTITY_GROUP_LOG"
  printf '%s\n' "$IDENTITY_GROUP"
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
    grep -Fxq -- "$file" "$IDENTITY_GROUP_LOG" || fail_test "$label probe did not execute the root-group check"
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

bad_startup_gid_dir="$TMP_ROOT/identity-case-bad-gid"
mkdir "$bad_startup_gid_dir"
chmod 700 "$bad_startup_gid_dir"
identity_calls_before="$(wc -l <"$IDENTITY_BOUNDARY_LOG" | tr -d ' ')"
IDENTITY_GROUP=1000
set +e
(
  WORK_DIR="$bad_startup_gid_dir"
  FAILED_RECORDED=0
  CURRENT_STAGE=startup
  verify_postgresql_identity
) >/dev/null 2>&1
bad_startup_gid_rc=$?
set -e
assert_rc "$bad_startup_gid_rc" "$STARTUP_VALIDATION_RC" "startup capture with non-root gid"
identity_calls_after="$(wc -l <"$IDENTITY_BOUNDARY_LOG" | tr -d ' ')"
[[ "$identity_calls_after" == "$identity_calls_before" ]] || fail_test "bad startup capture gid reached PostgreSQL"
IDENTITY_GROUP=0
rm -rf -- "$bad_startup_gid_dir"

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
eval "$ORIGINAL_STARTUP_PROBE_FILE_GROUP"
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
QUERY_FIXTURE_DIR="$TMP_ROOT/raw-query-fixtures"
mkdir "$QUERY_FIXTURE_DIR"
declare -A SCRIPT_QUERY_STDOUT_FILES=()
declare -A SCRIPT_QUERY_STDERR_FILES=()
declare -A SCRIPT_QUERY_RCS=()
LOCK_CONNECTION_TEST_MODE=""
LOCK_CONNECTION_TEST_ZERO_AT=1
LOCK_CONNECTION_TEST_CALLS=0
LOCK_CONNECTION_TEST_FAILURES_REMAINING=0
LOCK_CONNECTION_TEST_LOG="$TMP_ROOT/lock-connection-polls.log"
LOCK_BACKEND_TEST_MODE=""
LOCK_BACKEND_TEST_CALLS=0
LOCK_BACKEND_TERMINATE_CALLS=0
LOCK_BACKEND_TARGET_DB=""
LOCK_BACKEND_TARGET_USER=postgres
LOCK_BACKEND_TARGET_APP=""
LOCK_BACKEND_TARGET_PID=0000042420
LOCK_BACKEND_TARGET_MARKER="$TMP_ROOT/lock-backend-target.alive"
LOCK_BACKEND_NON_TARGET_MARKER="$TMP_ROOT/lock-backend-nontarget.alive"
LOCK_BACKEND_TRANSPORT_LOG="$TMP_ROOT/lock-backend-transport.log"
TEST_MANAGED_BACKEND_PID=""
TEST_MANAGED_BACKEND_STOP_FIFO=""
TEST_MANAGED_BACKEND_DONE_FIFO=""
: >"$LOCK_BACKEND_TRANSPORT_LOG"
declare -a SCALAR_QUERY_OPERATIONS=(
  connection_count database_exists residual_count preexisting_count lock_granted lock_connections
)

prepare_query_fixture() {
  local operation="$1" shape="$2" transport_rc="${3:-0}" stdout_file stderr_file
  stdout_file="$QUERY_FIXTURE_DIR/${operation}.stdout"
  stderr_file="$QUERY_FIXTURE_DIR/${operation}.stderr"
  : >"$stdout_file"
  : >"$stderr_file"
  case "$shape" in
    exact_zero) printf '0\n' >"$stdout_file" ;;
    exact_one) printf '1\n' >"$stdout_file" ;;
    trailing_blank_zero) printf '0\n\n' >"$stdout_file" ;;
    trailing_blank_one) printf '1\n\n' >"$stdout_file" ;;
    missing_lf_zero) printf '0' >"$stdout_file" ;;
    missing_lf_one) printf '1' >"$stdout_file" ;;
    crlf_zero) printf '0\r\n' >"$stdout_file" ;;
    leading_space) printf ' 0\n' >"$stdout_file" ;;
    trailing_space) printf '0 \n' >"$stdout_file" ;;
    double_zero) printf '00\n' >"$stdout_file" ;;
    zero_one) printf '01\n' >"$stdout_file" ;;
    empty) ;;
    multiline) printf '0\n1\n' >"$stdout_file" ;;
    nul_extra) printf '0\0' >"$stdout_file" ;;
    stderr_warning)
      printf '0\n' >"$stdout_file"
      printf 'WARNING: scalar query pollution\n' >"$stderr_file"
      ;;
    transport42)
      printf '0\n' >"$stdout_file"
      printf 'WARNING: rc must remain authoritative\n' >"$stderr_file"
      transport_rc=42
      ;;
    *) fail_test "unknown raw query fixture shape $shape" ;;
  esac
  SCRIPT_QUERY_STDOUT_FILES[$operation]="$stdout_file"
  SCRIPT_QUERY_STDERR_FILES[$operation]="$stderr_file"
  SCRIPT_QUERY_RCS[$operation]="$transport_rc"
}

# A managed backend is used only by the Linux lifecycle regression below.  It
# cannot inherit the test's EXIT/INT/TERM traps, and it removes its marker only
# after the exact-termination fake sends an explicit FIFO command and receives
# its acknowledgement.  This avoids orphan, SIGHUP, process-group, and timing
# assumptions while still exercising the formal capture/termination path.
stop_test_managed_backend() {
  local stopped
  [[ -n "$TEST_MANAGED_BACKEND_STOP_FIFO" ]] || return 0
  [[ -p "$TEST_MANAGED_BACKEND_STOP_FIFO" && -p "$TEST_MANAGED_BACKEND_DONE_FIFO" ]] || return 97
  [[ "$TEST_MANAGED_BACKEND_PID" =~ ^[1-9][0-9]*$ ]] || return 97
  printf 'terminate\n' >"$TEST_MANAGED_BACKEND_STOP_FIFO" || return 97
  IFS= read -r stopped <"$TEST_MANAGED_BACKEND_DONE_FIFO" || return 97
  [[ "$stopped" == terminated ]] || return 97
  wait "$TEST_MANAGED_BACKEND_PID" || return 97
  TEST_MANAGED_BACKEND_PID=""
  rm -f -- "$TEST_MANAGED_BACKEND_STOP_FIFO" "$TEST_MANAGED_BACKEND_DONE_FIFO"
  TEST_MANAGED_BACKEND_STOP_FIFO=""
  TEST_MANAGED_BACKEND_DONE_FIFO=""
}

for scalar_operation in "${SCALAR_QUERY_OPERATIONS[@]}"; do
  if [[ "$scalar_operation" == lock_granted ]]; then
    prepare_query_fixture "$scalar_operation" exact_one
  else
    prepare_query_fixture "$scalar_operation" exact_zero
  fi
done

execute_postgres_command() {
  local joined argument next_argument command_sql="" script_file="" has_script=0 index stdout_fixture stderr_fixture fixture_rc
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
      script_file="$TMP_ROOT/psql-script-stdin.${BASHPID}.${RANDOM}"
      cat >"$script_file"
      capture_and_validate_script_transport "$script_file" || return $?
      [[ "$SCRIPT_TRANSPORT_FORCED_RC" -eq 0 ]] || return "$SCRIPT_TRANSPORT_FORCED_RC"
      if [[ -n "$QUERY_CAPTURE_POST_EXEC_GID_MARKER" ]]; then
        : >"$QUERY_CAPTURE_POST_EXEC_GID_MARKER"
      fi
      case "$TEST_SCRIPT_OPERATION" in
        lock_backend_pid)
          LOCK_BACKEND_TEST_CALLS=$((LOCK_BACKEND_TEST_CALLS + 1))
          printf 'probe\t%s\t%s\t%s\n' "$TEST_SCRIPT_DATABASE" "${TEST_SCRIPT_SET_ARGUMENTS[*]}" "$LOCK_BACKEND_TEST_MODE" >>"$LOCK_BACKEND_TRANSPORT_LOG"
          case "$LOCK_BACKEND_TEST_MODE" in
            transport42) return 42 ;;
          esac
          if [[ -e "$LOCK_BACKEND_TARGET_MARKER" && "$TEST_SCRIPT_DATABASE" == "$LOCK_BACKEND_TARGET_DB" && \
                "$LOCK_BACKEND_TARGET_USER" == postgres && "${TEST_SCRIPT_SET_ARGUMENTS[0]}" == "--set=lock_app=${LOCK_BACKEND_TARGET_APP}" ]]; then
            printf '%s\n' "$LOCK_BACKEND_TARGET_PID"
          fi
          return 0
          ;;
        lock_terminate)
          LOCK_BACKEND_TERMINATE_CALLS=$((LOCK_BACKEND_TERMINATE_CALLS + 1))
          printf 'terminate\t%s\t%s\t%s\n' "$TEST_SCRIPT_DATABASE" "${TEST_SCRIPT_SET_ARGUMENTS[*]}" "$LOCK_BACKEND_TEST_MODE" >>"$LOCK_BACKEND_TRANSPORT_LOG"
          case "$LOCK_BACKEND_TEST_MODE" in
            transport42) return 42 ;;
          esac
          if [[ -e "$LOCK_BACKEND_TARGET_MARKER" && "$TEST_SCRIPT_DATABASE" == "$LOCK_BACKEND_TARGET_DB" && \
                "$LOCK_BACKEND_TARGET_USER" == postgres && "${TEST_SCRIPT_SET_ARGUMENTS[0]}" == "--set=lock_app=${LOCK_BACKEND_TARGET_APP}" && \
                "${TEST_SCRIPT_SET_ARGUMENTS[1]}" == "--set=lock_pid=${LOCK_BACKEND_TARGET_PID}" ]]; then
           if [[ "$LOCK_BACKEND_TEST_MODE" == terminate_false ]]; then
             printf '0\n'
            elif [[ "$LOCK_BACKEND_TEST_MODE" == terminate_null ]]; then
              :
            elif [[ "$LOCK_BACKEND_TEST_MODE" == terminate_invalid ]]; then
              printf '2\n'
            else
              stop_test_managed_backend || return $?
              rm -f -- "$LOCK_BACKEND_TARGET_MARKER"
              printf '1\n'
              if [[ "$LOCK_BACKEND_TEST_MODE" == signal_after_terminate ]]; then
                kill -INT "$BASHPID"
              fi
            fi
          else
            printf '0\n'
          fi
          return 0
          ;;
        lock_connections)
          if [[ -n "$LOCK_CONNECTION_TEST_MODE" ]]; then
            LOCK_CONNECTION_TEST_CALLS=$((LOCK_CONNECTION_TEST_CALLS + 1))
            printf '%s\n' "$LOCK_CONNECTION_TEST_CALLS" >>"$LOCK_CONNECTION_TEST_LOG"
            case "$LOCK_CONNECTION_TEST_MODE" in
              sequence)
                if (( LOCK_CONNECTION_TEST_CALLS >= LOCK_CONNECTION_TEST_ZERO_AT )); then printf '0\n'; else printf '1\n'; fi
                return 0
                ;;
              all_one) printf '1\n'; return 0 ;;
              backend_marker) [[ -e "$LOCK_BACKEND_TARGET_MARKER" ]] && printf '1\n' || printf '0\n'; return 0 ;;
              backend_marker_then_transport42)
                if [[ -e "$LOCK_BACKEND_TARGET_MARKER" ]]; then
                  printf '1\n'
                  return 0
                fi
                printf '0\n'
                return 42
                ;;
              backend_marker_then_failures_then_zero)
                if [[ -e "$LOCK_BACKEND_TARGET_MARKER" ]]; then
                  printf '1\n'
                  return 0
                fi
                if (( LOCK_CONNECTION_TEST_FAILURES_REMAINING > 0 )); then
                  LOCK_CONNECTION_TEST_FAILURES_REMAINING=$((LOCK_CONNECTION_TEST_FAILURES_REMAINING - 1))
                  printf '0\n'
                  return 42
                fi
                printf '0\n'
                return 0
                ;;
              transport42) printf '1\n'; return 42 ;;
              output_two) printf '2\n'; return 0 ;;
              trailing_blank) printf '1\n\n'; return 0 ;;
              missing_lf) printf '1'; return 0 ;;
              *) return 97 ;;
            esac
          fi
          ;;&
        connection_count|database_exists|residual_count|preexisting_count|lock_granted|lock_connections)
          stdout_fixture="${SCRIPT_QUERY_STDOUT_FILES[$TEST_SCRIPT_OPERATION]}"
          stderr_fixture="${SCRIPT_QUERY_STDERR_FILES[$TEST_SCRIPT_OPERATION]}"
          fixture_rc="${SCRIPT_QUERY_RCS[$TEST_SCRIPT_OPERATION]}"
          cat -- "$stdout_fixture"
          cat -- "$stderr_fixture" >&2
          return "$fixture_rc"
          ;;
      esac
    fi
    return 0
  fi
  return 0
}
record_state() { :; }
boundary_db="${SCENARIO_DATABASES[challenge_id_nullable]}"
LOCK_BACKEND_TARGET_DB="$boundary_db"
LOCK_BACKEND_TARGET_APP="memoryai_auth_matrix_lock_${RUN_NONCE}"
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
for required_transport in connection_count database_exists residual_count preexisting_count; do
  [[ "$(grep -c "^${required_transport}"$'\t' "$SCRIPT_TRANSPORT_LOG")" -eq 1 ]] || \
    fail_test "$required_transport did not use the unique script transport"
done
[[ "$(grep -c '^terminate'$'\t' "$SCRIPT_TRANSPORT_LOG")" -eq 0 ]] || \
  fail_test "ordinary cleanup used broad termination before proving a residual connection"
grep -Fq $'connection_count\tpostgres\t--set=matrix_db='"$boundary_db" "$SCRIPT_TRANSPORT_LOG" || \
  fail_test "cleanup connection binding changed"
grep -Fq $'database_exists\tpostgres\t--set=matrix_db='"$boundary_db" "$SCRIPT_TRANSPORT_LOG" || \
  fail_test "cleanup existence binding changed"
grep -Fq $'residual_count\tpostgres\t--set=matrix_prefix='"${RUN_DB_PREFIX}%" "$SCRIPT_TRANSPORT_LOG" || \
  fail_test "residual database binding changed"

# All six scalar queries execute through the formal file-capture wrapper.  The
# fixtures are byte files so neither the fake nor the assertion path trims LF.
invoke_scalar_query_operation() {
  local operation="$1" lock_app="memoryai_auth_matrix_lock_${RUN_NONCE}" names
  names="$(printf '%s\n' "${SCENARIO_DATABASES[@]}" | sort | paste -sd, -)"
  case "$operation" in
    connection_count)
      capture_scalar_query admin "$ADMIN_DB" connection_count "$boundary_db" zero <<'TEST_CONNECTION_COUNT_SQL'
SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname = :'matrix_db';
TEST_CONNECTION_COUNT_SQL
      ;;
    database_exists)
      capture_scalar_query admin "$ADMIN_DB" database_exists "$boundary_db" zero <<'TEST_DATABASE_EXISTS_SQL'
SELECT count(*) FROM pg_catalog.pg_database WHERE datname = :'matrix_db';
TEST_DATABASE_EXISTS_SQL
      ;;
    residual_count)
      capture_scalar_query admin "$ADMIN_DB" residual_count "${RUN_DB_PREFIX}%" zero <<'TEST_RESIDUAL_COUNT_SQL'
SELECT count(*) FROM pg_catalog.pg_database WHERE datname LIKE :'matrix_prefix';
TEST_RESIDUAL_COUNT_SQL
      ;;
    preexisting_count)
      capture_scalar_query admin "$ADMIN_DB" preexisting_count "$names" zero <<'TEST_PREEXISTING_COUNT_SQL'
SELECT count(*) FROM pg_catalog.pg_database WHERE datname = ANY(pg_catalog.string_to_array(:'matrix_names', ','));
TEST_PREEXISTING_COUNT_SQL
      ;;
    lock_granted)
      capture_scalar_query database "$boundary_db" lock_granted "$lock_app" zero_or_one <<'TEST_LOCK_GRANTED_SQL'
SELECT count(*) FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid WHERE a.datname=pg_catalog.current_database() AND a.usename=CURRENT_USER AND a.application_name=:'lock_app' AND a.backend_type='client backend' AND l.database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) AND l.relation='public.auth_verification_challenges'::regclass AND l.mode='AccessExclusiveLock' AND l.granted;
TEST_LOCK_GRANTED_SQL
      ;;
    lock_connections)
      capture_scalar_query database "$boundary_db" lock_connections "$lock_app" zero_or_one <<'TEST_LOCK_CONNECTIONS_SQL'
SELECT CASE WHEN count(*)=0 THEN 0 WHEN count(*)=1 AND pg_catalog.bool_and(usename=CURRENT_USER AND CURRENT_USER='postgres'::name AND backend_type='client backend') THEN 1 ELSE 2 END FROM pg_catalog.pg_stat_activity WHERE datname=pg_catalog.current_database() AND application_name=:'lock_app';
TEST_LOCK_CONNECTIONS_SQL
      ;;
    *) return 64 ;;
  esac
}

declare -a RAW_QUERY_SHAPES=(
  exact_zero exact_one trailing_blank_zero trailing_blank_one missing_lf_zero missing_lf_one
  crlf_zero leading_space trailing_space double_zero zero_one empty multiline nul_extra
  stderr_warning transport42
)
scalar_calls_before="$(wc -l <"$SCRIPT_TRANSPORT_LOG" | tr -d ' ')"
for scalar_operation in "${SCALAR_QUERY_OPERATIONS[@]}"; do
  for raw_shape in "${RAW_QUERY_SHAPES[@]}"; do
    prepare_query_fixture "$scalar_operation" "$raw_shape"
    QUERY_CAPTURE_VALUE="stale"
    if invoke_scalar_query_operation "$scalar_operation"; then
      scalar_rc=0
    else
      scalar_rc=$?
    fi
    if [[ "$raw_shape" == exact_zero ]]; then
      expected_scalar_rc=0
      expected_scalar_value=0
    elif [[ "$raw_shape" == exact_one && ( "$scalar_operation" == lock_granted || "$scalar_operation" == lock_connections ) ]]; then
      expected_scalar_rc=0
      expected_scalar_value=1
    elif [[ "$raw_shape" == transport42 ]]; then
      expected_scalar_rc=42
      expected_scalar_value=""
    else
      expected_scalar_rc="$QUERY_CAPTURE_VALIDATION_RC"
      expected_scalar_value=""
    fi
    assert_rc "$scalar_rc" "$expected_scalar_rc" "$scalar_operation raw-byte case $raw_shape"
    [[ "$QUERY_CAPTURE_VALUE" == "$expected_scalar_value" ]] || \
      fail_test "$scalar_operation $raw_shape exposed an unexpected scalar value"
    for capture_file in "$QUERY_CAPTURE_STDOUT_FILE" "$QUERY_CAPTURE_STDERR_FILE"; do
      [[ -f "$capture_file" && ! -L "$capture_file" ]] || fail_test "$scalar_operation $raw_shape capture is unsafe"
      [[ "$(cd "$(dirname "$capture_file")" && pwd -P)" == "$(cd "$WORK_DIR" && pwd -P)" ]] || \
        fail_test "$scalar_operation $raw_shape capture escaped WORK_DIR"
      grep -Fxq -- "$capture_file" "$QUERY_CAPTURE_OWNER_LOG" || fail_test "$scalar_operation $raw_shape skipped owner validation"
      grep -Fxq -- "$capture_file" "$QUERY_CAPTURE_GROUP_LOG" || fail_test "$scalar_operation $raw_shape skipped group validation"
      grep -Fxq -- "$capture_file" "$QUERY_CAPTURE_MODE_LOG" || fail_test "$scalar_operation $raw_shape skipped mode validation"
      case "${capture_file##*/}" in
        postgresql-query.${scalar_operation}.stdout.*|postgresql-query.${scalar_operation}.stderr.*) ;;
        *) fail_test "$scalar_operation $raw_shape used an uncontrolled capture filename" ;;
      esac
    done
  done
done
scalar_calls_after="$(wc -l <"$SCRIPT_TRANSPORT_LOG" | tr -d ' ')"
[[ $((scalar_calls_after - scalar_calls_before)) -eq $((6 * ${#RAW_QUERY_SHAPES[@]})) ]] || \
  fail_test "six-query raw-byte matrix did not execute every formal wrapper"
for scalar_operation in "${SCALAR_QUERY_OPERATIONS[@]}"; do
  if [[ "$scalar_operation" == lock_granted ]]; then
    prepare_query_fixture "$scalar_operation" exact_one
  else
    prepare_query_fixture "$scalar_operation" exact_zero
  fi
done

# Numeric uid:gid:mode is authoritative.  A misleading group name cannot
# compensate for a nonzero numeric gid, and unsafe metadata must stop before
# the PostgreSQL command boundary.
query_gid_calls_before="$(wc -l <"$SCRIPT_TRANSPORT_LOG" | tr -d ' ')"
QUERY_CAPTURE_TEST_GROUP=1000
QUERY_CAPTURE_TEST_GROUP_NAME=root
QUERY_CAPTURE_VALUE=stale
if invoke_scalar_query_operation connection_count; then query_bad_gid_rc=0; else query_bad_gid_rc=$?; fi
assert_rc "$query_bad_gid_rc" 76 "query capture uid0 gid1000 mode600"
[[ "$QUERY_CAPTURE_VALUE" == "" ]] || fail_test "bad query gid retained a stale scalar value"
query_gid_calls_after="$(wc -l <"$SCRIPT_TRANSPORT_LOG" | tr -d ' ')"
[[ "$query_gid_calls_after" == "$query_gid_calls_before" ]] || fail_test "bad query gid reached PostgreSQL"

QUERY_CAPTURE_TEST_GROUP=0
QUERY_CAPTURE_TEST_OWNER=1000
QUERY_CAPTURE_VALUE=stale
if invoke_scalar_query_operation connection_count; then query_bad_uid_rc=0; else query_bad_uid_rc=$?; fi
assert_rc "$query_bad_uid_rc" 76 "query capture uid1000 gid0 mode600"
[[ "$QUERY_CAPTURE_VALUE" == "" ]] || fail_test "bad query uid retained a stale scalar value"
query_uid_calls_after="$(wc -l <"$SCRIPT_TRANSPORT_LOG" | tr -d ' ')"
[[ "$query_uid_calls_after" == "$query_gid_calls_before" ]] || fail_test "bad query uid reached PostgreSQL"

QUERY_CAPTURE_TEST_OWNER=0
QUERY_CAPTURE_TEST_GROUP=0
QUERY_CAPTURE_POST_EXEC_GID_MARKER="$TMP_ROOT/query-post-exec-bad-gid.marker"
rm -f -- "$QUERY_CAPTURE_POST_EXEC_GID_MARKER"
QUERY_CAPTURE_VALUE=stale
if invoke_scalar_query_operation connection_count; then query_replaced_gid_rc=0; else query_replaced_gid_rc=$?; fi
assert_rc "$query_replaced_gid_rc" "$QUERY_CAPTURE_VALIDATION_RC" "query capture gid changed after database command"
[[ "$QUERY_CAPTURE_VALUE" == "" ]] || fail_test "post-exec gid replacement retained a scalar value"
query_replaced_calls_after="$(wc -l <"$SCRIPT_TRANSPORT_LOG" | tr -d ' ')"
[[ $((query_replaced_calls_after - query_uid_calls_after)) -eq 1 ]] || fail_test "post-exec gid replacement did not execute exactly one query"
rm -f -- "$QUERY_CAPTURE_POST_EXEC_GID_MARKER"
QUERY_CAPTURE_POST_EXEC_GID_MARKER=""

# Exercise the production 50-poll helper itself.  Only the external sleep and
# database transport are injected; the parser, capture files, value state, and
# finite-loop implementation remain the runner's real functions.
run_lock_connection_poll_case() {
  local label="$1" mode="$2" zero_at="$3" expected_rc="$4" expected_calls="$5" actual_rc expected_value
  LOCK_CONNECTION_TEST_MODE="$mode"
  LOCK_CONNECTION_TEST_ZERO_AT="$zero_at"
  LOCK_CONNECTION_TEST_CALLS=0
  : >"$LOCK_CONNECTION_TEST_LOG"
  QUERY_CAPTURE_VALUE=stale
  if wait_for_lock_holder_connections "$boundary_db" "memoryai_auth_matrix_lock_${RUN_NONCE}"; then
    actual_rc=0
  else
    actual_rc=$?
  fi
  assert_rc "$actual_rc" "$expected_rc" "lock connection poll $label"
  [[ "$LOCK_CONNECTION_TEST_CALLS" -eq "$expected_calls" ]] || \
    fail_test "$label executed $LOCK_CONNECTION_TEST_CALLS polls instead of $expected_calls"
  [[ "$(wc -l <"$LOCK_CONNECTION_TEST_LOG" | tr -d ' ')" -eq "$expected_calls" ]] || \
    fail_test "$label transport log count changed"
  if [[ "$expected_rc" -eq 0 ]]; then expected_value=0; else expected_value=""; fi
  [[ "$QUERY_CAPTURE_VALUE" == "$expected_value" ]] || fail_test "$label leaked a stale query value"
}

sleep() { :; }
run_lock_connection_poll_case first_zero sequence 1 0 1
run_lock_connection_poll_case one_then_zero sequence 2 0 2
run_lock_connection_poll_case two_ones_then_zero sequence 3 0 3
run_lock_connection_poll_case fifty_ones all_one 0 82 50
run_lock_connection_poll_case forty_nine_ones_then_zero sequence 50 0 50
run_lock_connection_poll_case transport_rc42 transport42 0 42 1
run_lock_connection_poll_case output_two output_two 0 "$QUERY_CAPTURE_VALIDATION_RC" 1
run_lock_connection_poll_case trailing_blank trailing_blank 0 "$QUERY_CAPTURE_VALIDATION_RC" 1
run_lock_connection_poll_case missing_lf missing_lf 0 "$QUERY_CAPTURE_VALIDATION_RC" 1
unset -f sleep
LOCK_CONNECTION_TEST_MODE=""
LOCK_CONNECTION_TEST_CALLS=0

# Linux lifecycle regression: wrapper and backend are distinct processes.  The
# fixture runs in an explicit subshell so its FIFO variables, holder state,
# function replacements, traps, and shell options cannot affect a later formal
# state-file test.  The wrapper has no authority over the backend marker; the
# backend has no parent-exit trap and only exits after exact termination sends
# an explicit FIFO command and receives its acknowledgement.
run_legacy_wrapper_backend_fixture() (
  trap - EXIT INT TERM
  local legacy_backend_ready_fifo="$TMP_ROOT/legacy-backend.ready"
  local legacy_wrapper_hold_fifo="$TMP_ROOT/legacy-wrapper.hold"
  local legacy_holder_wrapper legacy_backend_ready legacy_holder_poll_rc
  TEST_MANAGED_BACKEND_STOP_FIFO="$TMP_ROOT/legacy-backend.stop"
  TEST_MANAGED_BACKEND_DONE_FIFO="$TMP_ROOT/legacy-backend.done"
  mkfifo "$legacy_backend_ready_fifo" "$legacy_wrapper_hold_fifo" "$TEST_MANAGED_BACKEND_STOP_FIFO" "$TEST_MANAGED_BACKEND_DONE_FIFO"
  (
    trap - EXIT INT TERM
    : >"$LOCK_BACKEND_TARGET_MARKER"
    printf 'ready\n' >"$legacy_backend_ready_fifo"
    IFS= read -r legacy_backend_command <"$TEST_MANAGED_BACKEND_STOP_FIFO" || exit 97
    [[ "$legacy_backend_command" == terminate ]] || exit 98
    rm -f -- "$LOCK_BACKEND_TARGET_MARKER"
    printf 'terminated\n' >"$TEST_MANAGED_BACKEND_DONE_FIFO"
  ) &
  TEST_MANAGED_BACKEND_PID=$!
  IFS= read -r legacy_backend_ready <"$legacy_backend_ready_fifo" || return 97
  [[ "$legacy_backend_ready" == ready ]] || return 98
  kill -0 "$TEST_MANAGED_BACKEND_PID" 2>/dev/null || return 99
  : >"$LOCK_BACKEND_NON_TARGET_MARKER"
  (
    trap - EXIT INT TERM
    IFS= read -r legacy_wrapper_command <"$legacy_wrapper_hold_fifo" || exit 97
    [[ "$legacy_wrapper_command" == exit ]] || exit 98
  ) &
  legacy_holder_wrapper=$!
  kill -0 "$legacy_holder_wrapper" 2>/dev/null || return 99
  printf 'exit\n' >"$legacy_wrapper_hold_fifo"
  wait "$legacy_holder_wrapper" 2>/dev/null || return 97
  if kill -0 "$legacy_holder_wrapper" 2>/dev/null; then return 99; fi
  rm -f -- "$legacy_backend_ready_fifo" "$legacy_wrapper_hold_fifo"
  [[ -e "$LOCK_BACKEND_TARGET_MARKER" ]] || return 99
  kill -0 "$TEST_MANAGED_BACKEND_PID" 2>/dev/null || return 99
  LOCK_CONNECTION_TEST_MODE=backend_marker
  LOCK_CONNECTION_TEST_CALLS=0
  : >"$LOCK_CONNECTION_TEST_LOG"
  sleep() { :; }
  if wait_for_lock_holder_connections "$boundary_db" "$LOCK_BACKEND_TARGET_APP"; then
    legacy_holder_poll_rc=0
  else
    legacy_holder_poll_rc=$?
  fi
  unset -f sleep
  [[ "$legacy_holder_poll_rc" -eq 82 && "$LOCK_CONNECTION_TEST_CALLS" -eq 50 ]] || return 99

  # The backend disappears only when the formal, identity-checked termination
  # path succeeds.  Its FIFO acknowledgement removes scheduling ambiguity.
  LOCK_BACKEND_TEST_MODE=success
  clear_active_lock_holder
  capture_lock_holder_wrapper_starttime() {
    LOCK_HOLDER_SNAPSHOT_STATE=R
    LOCK_HOLDER_SNAPSHOT_STARTTIME=42424200
  }
  register_active_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" 424242 || return 99
  eval "$ORIGINAL_CAPTURE_LOCK_HOLDER_WRAPPER_STARTTIME"
  mark_lock_holder_backend_verified "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID" || return 99
  terminate_exact_lock_holder_backend "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID" || return $?
  [[ ! -e "$LOCK_BACKEND_TARGET_MARKER" ]] || return 99
  [[ -z "$TEST_MANAGED_BACKEND_PID" ]] || return 99
  [[ ! -e "$legacy_backend_ready_fifo" && ! -e "$legacy_wrapper_hold_fifo" ]] || return 99
  clear_active_lock_holder
)
legacy_fixture_parent_traps="$(trap -p EXIT INT TERM)"
legacy_fixture_parent_options="$(set +o)"
legacy_fixture_parent_capture="$(declare -f capture_lock_holder_wrapper_starttime)"
if run_legacy_wrapper_backend_fixture; then legacy_fixture_rc=0; else legacy_fixture_rc=$?; fi
assert_rc "$legacy_fixture_rc" 0 "legacy wrapper/backend fixture"
[[ "$(trap -p EXIT INT TERM)" == "$legacy_fixture_parent_traps" ]] || fail_test "legacy fixture changed parent traps"
[[ "$(set +o)" == "$legacy_fixture_parent_options" ]] || fail_test "legacy fixture changed parent shell options"
[[ "$(declare -f capture_lock_holder_wrapper_starttime)" == "$legacy_fixture_parent_capture" ]] || \
  fail_test "legacy fixture changed parent wrapper-starttime capture"
[[ -z "$TEST_MANAGED_BACKEND_PID$TEST_MANAGED_BACKEND_STOP_FIFO$TEST_MANAGED_BACKEND_DONE_FIFO" ]] || \
  fail_test "legacy fixture leaked backend FIFO tracking"

# Run the actual pre-existing-state safety gate immediately after the complete
# legacy lifecycle fixture.  The returned path is the already-created regular
# file that initialize_state_file itself snapshots; no database boundary may be
# reached and that sentinel must remain byte-for-byte intact.
legacy_sequence_state_root="$TMP_ROOT/legacy-then-state"
legacy_sequence_preexisting="$legacy_sequence_state_root/preexisting.state"
legacy_sequence_database_calls="$TMP_ROOT/legacy-then-state.database-calls"
mkdir "$legacy_sequence_state_root"
printf 'sentinel\n' >"$legacy_sequence_preexisting"
: >"$legacy_sequence_database_calls"
set +e
(
  RUN_NONCE=56565656565656565656565656565656
  validate_state_directory() { return 0; }
  create_state_file() { printf '%s\n' "$legacy_sequence_preexisting"; }
  execute_postgres_command() { printf 'unexpected\n' >>"$legacy_sequence_database_calls"; return 99; }
  initialize_state_file "$legacy_sequence_state_root" "$(id -u)" "$(id -g)"
) >/dev/null 2>&1
legacy_sequence_preexisting_rc=$?
set -e
assert_rc "$legacy_sequence_preexisting_rc" 76 "legacy fixture followed by pre-existing state target"
[[ "$(<"$legacy_sequence_preexisting")" == sentinel ]] || \
  fail_test "legacy fixture sequence modified the pre-existing state target"
[[ ! -s "$legacy_sequence_database_calls" ]] || \
  fail_test "legacy fixture sequence reached a database boundary"

capture_test_lock_backend_pid() {
  capture_scalar_query database "$1" lock_backend_pid "$2" backend_pid <<'TEST_LOCK_BACKEND_PID_SQL'
WITH holders AS MATERIALIZED (
  SELECT DISTINCT a.pid
  FROM pg_catalog.pg_stat_activity a
  JOIN pg_catalog.pg_locks l ON l.pid = a.pid
  WHERE a.datname = pg_catalog.current_database()
    AND a.usename = CURRENT_USER
    AND CURRENT_USER = 'postgres'::name
    AND a.application_name = :'lock_app'
    AND a.backend_type = 'client backend'
    AND a.pid <> pg_catalog.pg_backend_pid()
    AND l.database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database())
    AND l.relation = 'public.auth_verification_challenges'::regclass
    AND l.mode = 'AccessExclusiveLock'
    AND l.granted
)
SELECT pg_catalog.lpad(min(pid)::text, 10, '0') FROM holders HAVING count(*) = 1;
TEST_LOCK_BACKEND_PID_SQL
}

activate_test_lock_holder() {
  clear_active_lock_holder
  capture_lock_holder_wrapper_starttime() {
    LOCK_HOLDER_SNAPSHOT_STATE=R
    LOCK_HOLDER_SNAPSHOT_STARTTIME=42424200
  }
  register_active_lock_holder "$1" "$2" 424242 || fail_test "could not register fake lock holder"
  eval "$ORIGINAL_CAPTURE_LOCK_HOLDER_WRAPPER_STARTTIME"
  mark_lock_holder_backend_verified "$1" "$2" "$3" || fail_test "could not mark fake lock holder backend verified"
}

assert_lock_target_still_isolated() {
  [[ -e "$LOCK_BACKEND_NON_TARGET_MARKER" ]] || fail_test "$1 terminated the non-target connection"
}

# The backend PID handshake and termination both use the formal capture and
# script transports.  A successful termination changes only the exact target,
# after which the unmodified connection poll observes 1 -> 0.
LOCK_BACKEND_TEST_MODE=success
LOCK_BACKEND_TEST_CALLS=0
LOCK_BACKEND_TERMINATE_CALLS=0
: >"$LOCK_BACKEND_TARGET_MARKER"
: >"$LOCK_BACKEND_NON_TARGET_MARKER"
QUERY_CAPTURE_VALUE=stale
capture_test_lock_backend_pid "$boundary_db" "$LOCK_BACKEND_TARGET_APP" || fail_test "exact backend PID handshake failed"
[[ "$QUERY_CAPTURE_VALUE" == "$LOCK_BACKEND_TARGET_PID" ]] || fail_test "backend PID handshake returned the wrong PID"
for capture_file in "$QUERY_CAPTURE_STDOUT_FILE" "$QUERY_CAPTURE_STDERR_FILE"; do
  [[ -f "$capture_file" && ! -L "$capture_file" ]] || fail_test "backend PID capture is not a regular non-symlink file"
  grep -Fxq -- "$capture_file" "$QUERY_CAPTURE_OWNER_LOG" || fail_test "backend PID capture skipped uid validation"
  grep -Fxq -- "$capture_file" "$QUERY_CAPTURE_GROUP_LOG" || fail_test "backend PID capture skipped gid validation"
  grep -Fxq -- "$capture_file" "$QUERY_CAPTURE_MODE_LOG" || fail_test "backend PID capture skipped mode validation"
done
activate_test_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID"
LOCK_CONNECTION_TEST_MODE=backend_marker
LOCK_CONNECTION_TEST_CALLS=0
invoke_scalar_query_operation lock_connections || fail_test "pre-termination connection probe failed"
[[ "$QUERY_CAPTURE_VALUE" == 1 ]] || fail_test "pre-termination connection probe did not observe the target"
QUERY_CAPTURE_VALUE=stale
terminate_exact_lock_holder_backend "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID" || \
  fail_test "exact backend termination failed"
[[ "$QUERY_CAPTURE_VALUE" == 1 ]] || fail_test "exact backend termination did not return strict success"
[[ ! -e "$LOCK_BACKEND_TARGET_MARKER" ]] || fail_test "exact target backend remained after termination"
assert_lock_target_still_isolated "exact backend termination"
sleep() { :; }
LOCK_CONNECTION_TEST_CALLS=0
wait_for_lock_holder_connections "$boundary_db" "$LOCK_BACKEND_TARGET_APP" || fail_test "post-termination connection poll failed"
unset -f sleep
[[ "$LOCK_CONNECTION_TEST_CALLS" -eq 1 ]] || fail_test "post-termination connection poll did not stop at the first zero"
clear_active_lock_holder

# Fail closed before or during termination for every identity component.  No
# mismatch may remove either the target or a non-target connection.
run_lock_termination_rejection() {
  local label="$1" call_database="$2" call_app="$3" call_pid="$4" target_user="$5" mode="$6" expected_rc="$7"
  local actual_rc terminate_calls_before
  : >"$LOCK_BACKEND_TARGET_MARKER"
  : >"$LOCK_BACKEND_NON_TARGET_MARKER"
  LOCK_BACKEND_TARGET_USER="$target_user"
  LOCK_BACKEND_TEST_MODE="$mode"
  activate_test_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID"
  terminate_calls_before="$LOCK_BACKEND_TERMINATE_CALLS"
  QUERY_CAPTURE_VALUE=stale
  if terminate_exact_lock_holder_backend "$call_database" "$call_app" "$call_pid"; then actual_rc=0; else actual_rc=$?; fi
  assert_rc "$actual_rc" "$expected_rc" "lock termination rejection $label"
  [[ -e "$LOCK_BACKEND_TARGET_MARKER" ]] || fail_test "$label terminated a mismatched target"
  assert_lock_target_still_isolated "$label"
  [[ "$QUERY_CAPTURE_VALUE" == "" ]] || fail_test "$label retained stale query state"
  if [[ "$expected_rc" -eq 64 ]]; then
    [[ "$LOCK_BACKEND_TERMINATE_CALLS" == "$terminate_calls_before" ]] || fail_test "$label reached the database transport"
  fi
  clear_active_lock_holder
  LOCK_BACKEND_TARGET_USER=postgres
  LOCK_BACKEND_TEST_MODE=success
}

wrong_database="${SCENARIO_DATABASES[challenge_id_type]}"
run_lock_termination_rejection wrong_database "$wrong_database" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID" postgres success 64
run_lock_termination_rejection wrong_application "$boundary_db" memoryai_auth_matrix_lock_wrong "$LOCK_BACKEND_TARGET_PID" postgres success 64
run_lock_termination_rejection wrong_pid "$boundary_db" "$LOCK_BACKEND_TARGET_APP" 0000042421 postgres success 64
run_lock_termination_rejection wrong_user "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID" attacker success "$QUERY_CAPTURE_VALIDATION_RC"
run_lock_termination_rejection terminate_false "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID" postgres terminate_false "$QUERY_CAPTURE_VALIDATION_RC"
run_lock_termination_rejection transport_rc42 "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID" postgres transport42 42

# A PID captured during the handshake must not authorize a later PID.  This
# models backend exit/PID reuse between capture and the atomic server-side
# revalidation.
: >"$LOCK_BACKEND_TARGET_MARKER"
LOCK_BACKEND_TARGET_PID=0000042420
LOCK_BACKEND_TEST_MODE=success
capture_test_lock_backend_pid "$boundary_db" "$LOCK_BACKEND_TARGET_APP" || fail_test "PID-race handshake failed"
captured_backend_pid="$QUERY_CAPTURE_VALUE"
LOCK_BACKEND_TARGET_PID=0000042421
activate_test_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$captured_backend_pid"
if terminate_exact_lock_holder_backend "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$captured_backend_pid"; then
  pid_race_rc=0
else
  pid_race_rc=$?
fi
assert_rc "$pid_race_rc" "$QUERY_CAPTURE_VALIDATION_RC" "backend PID changed before termination"
[[ -e "$LOCK_BACKEND_TARGET_MARKER" ]] || fail_test "PID-race rejection terminated the replacement backend"
assert_lock_target_still_isolated "PID-race rejection"
clear_active_lock_holder
LOCK_BACKEND_TARGET_PID=0000042420

# Unsafe gid metadata must stop both new database operations before the formal
# PostgreSQL boundary, just like the original six raw-byte queries.
QUERY_CAPTURE_TEST_GROUP=1000
lock_backend_calls_before="$(wc -l <"$LOCK_BACKEND_TRANSPORT_LOG" | tr -d ' ')"
if capture_test_lock_backend_pid "$boundary_db" "$LOCK_BACKEND_TARGET_APP"; then bad_backend_gid_rc=0; else bad_backend_gid_rc=$?; fi
assert_rc "$bad_backend_gid_rc" 76 "backend PID capture with non-root gid"
activate_test_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID"
if terminate_exact_lock_holder_backend "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID"; then bad_terminate_gid_rc=0; else bad_terminate_gid_rc=$?; fi
assert_rc "$bad_terminate_gid_rc" 76 "backend termination capture with non-root gid"
clear_active_lock_holder
lock_backend_calls_after="$(wc -l <"$LOCK_BACKEND_TRANSPORT_LOG" | tr -d ' ')"
[[ "$lock_backend_calls_after" == "$lock_backend_calls_before" ]] || fail_test "unsafe backend capture gid reached PostgreSQL"
QUERY_CAPTURE_TEST_GROUP=0
LOCK_BACKEND_TEST_MODE=""
LOCK_CONNECTION_TEST_MODE=""

# The formal wrapper reaper never waits for a running child.  These tests call
# the production state machine directly while replacing only /proc observation,
# the fixed polling sleep, and Bash's wait builtin.
WRAPPER_SNAPSHOT_MODE=""
WRAPPER_SNAPSHOT_CALLS=0
WRAPPER_SLEEP_CALLS=0
WRAPPER_WAIT_CALLS=0
WRAPPER_WAIT_RC=0
read_lock_holder_wrapper_snapshot() {
  WRAPPER_SNAPSHOT_CALLS=$((WRAPPER_SNAPSHOT_CALLS + 1))
  LOCK_HOLDER_SNAPSHOT_STARTTIME="$LOCK_HOLDER_WRAPPER_STARTTIME"
  case "$WRAPPER_SNAPSHOT_MODE" in
    gone) LOCK_HOLDER_SNAPSHOT_STATE=gone; LOCK_HOLDER_SNAPSHOT_STARTTIME="" ;;
    running_then_zombie)
      if (( WRAPPER_SNAPSHOT_CALLS == 1 )); then LOCK_HOLDER_SNAPSHOT_STATE=R; else LOCK_HOLDER_SNAPSHOT_STATE=Z; fi
      ;;
    hung) LOCK_HOLDER_SNAPSHOT_STATE=S ;;
    stopped) LOCK_HOLDER_SNAPSHOT_STATE=T ;;
    drift) LOCK_HOLDER_SNAPSHOT_STATE=R; LOCK_HOLDER_SNAPSHOT_STARTTIME=$((LOCK_HOLDER_WRAPPER_STARTTIME + 1)) ;;
    *) return 86 ;;
  esac
}
lock_holder_wrapper_poll_sleep() { WRAPPER_SLEEP_CALLS=$((WRAPPER_SLEEP_CALLS + 1)); }
wait_lock_holder_wrapper_child() { WRAPPER_WAIT_CALLS=$((WRAPPER_WAIT_CALLS + 1)); return "$WRAPPER_WAIT_RC"; }

prepare_fake_wrapper_reap() {
  local mode="$1" wait_rc="$2"
  clear_active_lock_holder
  LOCK_HOLDER_ACTIVE=1
  LOCK_HOLDER_DATABASE="$boundary_db"
  LOCK_HOLDER_APPLICATION_NAME="$LOCK_BACKEND_TARGET_APP"
  LOCK_HOLDER_WRAPPER_PID=424242
  LOCK_HOLDER_WRAPPER_STARTTIME=42424200
  LOCK_HOLDER_WRAPPER_REAPED=0
  LOCK_HOLDER_WRAPPER_EXIT_RC=""
  LOCK_HOLDER_STATE=backend_absent
  LOCK_HOLDER_RESUME_STATE=backend_absent
  WRAPPER_SNAPSHOT_MODE="$mode"
  WRAPPER_SNAPSHOT_CALLS=0
  WRAPPER_SLEEP_CALLS=0
  WRAPPER_WAIT_CALLS=0
  WRAPPER_WAIT_RC="$wait_rc"
}

run_fake_wrapper_reap_case() {
  local label="$1" mode="$2" wait_rc="$3" expected_rc="$4" expected_snapshots="$5" expected_sleeps="$6" expected_waits="$7" actual_rc
  prepare_fake_wrapper_reap "$mode" "$wait_rc"
  if reap_active_lock_holder_wrapper "$boundary_db"; then actual_rc=0; else actual_rc=$?; fi
  assert_rc "$actual_rc" "$expected_rc" "$label wrapper reap"
  [[ "$WRAPPER_SNAPSHOT_CALLS" -eq "$expected_snapshots" ]] || fail_test "$label wrapper snapshot count changed"
  [[ "$WRAPPER_SLEEP_CALLS" -eq "$expected_sleeps" ]] || fail_test "$label wrapper sleep count changed"
  [[ "$WRAPPER_WAIT_CALLS" -eq "$expected_waits" ]] || fail_test "$label wrapper wait count changed"
}

run_fake_wrapper_reap_case immediate_zero gone 0 0 1 0 1
[[ "$LOCK_HOLDER_STATE" == wrapper_reaped && "$LOCK_HOLDER_WRAPPER_EXIT_RC" == 0 ]] || fail_test "wrapper exit 0 state was not preserved"
run_fake_wrapper_reap_case expected_psql_disconnect gone 2 0 1 0 1
[[ "$LOCK_HOLDER_STATE" == wrapper_reaped && "$LOCK_HOLDER_WRAPPER_EXIT_RC" == 2 ]] || fail_test "wrapper exit 2 was not accepted explicitly"
run_fake_wrapper_reap_case exit_42 gone 42 42 1 0 1
[[ "$LOCK_HOLDER_STATE" == cleanup_failed && "$LOCK_HOLDER_WRAPPER_REAPED" -eq 1 ]] || fail_test "wrapper exit 42 was not recorded as a reaped failure"
run_fake_wrapper_reap_case wait_127 gone 127 127 1 0 1
run_fake_wrapper_reap_case running_then_zero running_then_zombie 0 0 2 1 1
run_fake_wrapper_reap_case hung_timeout hung 0 "$LOCK_HOLDER_WRAPPER_TIMEOUT_RC" 50 50 0
run_fake_wrapper_reap_case stopped_timeout stopped 0 "$LOCK_HOLDER_WRAPPER_TIMEOUT_RC" 50 50 0
run_fake_wrapper_reap_case pid_starttime_drift drift 0 "$LOCK_HOLDER_WRAPPER_IDENTITY_RC" 1 0 0
prepare_fake_wrapper_reap hung 0
if complete_active_lock_holder_cleanup "$boundary_db"; then hung_cleanup_first_rc=0; else hung_cleanup_first_rc=$?; fi
if complete_active_lock_holder_cleanup "$boundary_db"; then hung_cleanup_second_rc=0; else hung_cleanup_second_rc=$?; fi
assert_rc "$hung_cleanup_first_rc" "$LOCK_HOLDER_WRAPPER_TIMEOUT_RC" "hung wrapper first cleanup"
assert_rc "$hung_cleanup_second_rc" "$LOCK_HOLDER_WRAPPER_TIMEOUT_RC" "hung wrapper repeated cleanup"
[[ "$WRAPPER_SNAPSHOT_CALLS" -eq 100 && "$WRAPPER_WAIT_CALLS" -eq 0 ]] || fail_test "hung wrapper cleanup used an unbounded or hidden wait"

# Inject INT/TERM after the wait helper has selected the real child status but
# before it returns to the reaper.  The reaper must commit the wrapper state
# first, then replay the signal without a second cleanup wait.
run_wait_commit_signal_case() {
  local signal="$1" injected_wait_rc="$2" expected_signal_rc="$3" marker actual_rc
  marker="$TMP_ROOT/wait-commit-${signal}.state"
  rm -f -- "$marker"
  set +e
  (
    trap - EXIT INT TERM
    prepare_fake_wrapper_reap gone "$injected_wait_rc"
    wait_lock_holder_wrapper_child() {
      WRAPPER_WAIT_CALLS=$((WRAPPER_WAIT_CALLS + 1))
      kill -s "$signal" "$BASHPID"
      return "$injected_wait_rc"
    }
    on_signal() {
      [[ "$1" == "$signal" && "$2" == "$expected_signal_rc" ]] || exit 98
      [[ "$LOCK_HOLDER_WRAPPER_REAPED" -eq 1 && "$LOCK_HOLDER_ACTIVE" -eq 0 ]] || exit 97
      [[ "$LOCK_HOLDER_WRAPPER_EXIT_RC" == "$injected_wait_rc" && "$LOCK_HOLDER_STATE" == wrapper_reaped ]] || exit 96
      [[ "$WRAPPER_WAIT_CALLS" -eq 1 ]] || exit 95
      printf 'COMMITTED_BEFORE_%s\n' "$signal" >"$marker"
      exit "$2"
    }
    reap_active_lock_holder_wrapper "$boundary_db"
    exit 94
  ) >/dev/null 2>&1
  actual_rc=$?
  set -e
  assert_rc "$actual_rc" "$expected_signal_rc" "$signal wait-to-commit signal window"
  assert_contains "$marker" "COMMITTED_BEFORE_${signal}"
}
run_wait_commit_signal_case INT 0 130
run_wait_commit_signal_case TERM 2 143

set +e
(
  trap - EXIT
  trap '' INT TERM
  prepare_fake_wrapper_reap gone 0
  wait_lock_holder_wrapper_child() {
    WRAPPER_WAIT_CALLS=$((WRAPPER_WAIT_CALLS + 1))
    kill -INT "$BASHPID"
    kill -TERM "$BASHPID"
    return 0
  }
  on_signal() { exit 99; }
  reap_active_lock_holder_wrapper "$boundary_db"
  [[ "$LOCK_HOLDER_STATE" == wrapper_reaped && "$WRAPPER_WAIT_CALLS" -eq 1 ]]
) >/dev/null 2>&1
ignored_cleanup_signal_rc=$?
set -e
assert_rc "$ignored_cleanup_signal_rc" 0 "on_exit ignored-signal wrapper commit"

# If Bash reports the deferred signal status from wait itself, retry exactly
# once after the already-confirmed child is terminal to obtain its real status.
interrupted_wait_marker="$TMP_ROOT/wait-interrupted.state"
rm -f -- "$interrupted_wait_marker"
set +e
(
  trap - EXIT INT TERM
  prepare_fake_wrapper_reap gone 0
  wait_lock_holder_wrapper_child() {
    WRAPPER_WAIT_CALLS=$((WRAPPER_WAIT_CALLS + 1))
    if [[ "$WRAPPER_WAIT_CALLS" -eq 1 ]]; then
      kill -INT "$BASHPID"
      return 130
    fi
    return 0
  }
  on_signal() {
    [[ "$LOCK_HOLDER_STATE" == wrapper_reaped && "$LOCK_HOLDER_WRAPPER_EXIT_RC" == 0 ]] || exit 98
    [[ "$WRAPPER_WAIT_CALLS" -eq 2 ]] || exit 97
    printf 'INTERRUPTED_WAIT_RETRIED_ONCE\n' >"$interrupted_wait_marker"
    exit "$2"
  }
  reap_active_lock_holder_wrapper "$boundary_db"
  exit 96
) >/dev/null 2>&1
interrupted_wait_rc=$?
set -e
assert_rc "$interrupted_wait_rc" 130 "interrupted terminal wrapper wait"
assert_contains "$interrupted_wait_marker" "INTERRUPTED_WAIT_RETRIED_ONCE"

# Restore real process observation and wait, then prove the accepted statuses
# against actual children.  A gate prevents exit before starttime is captured.
eval "$ORIGINAL_READ_LOCK_HOLDER_WRAPPER_SNAPSHOT"
eval "$ORIGINAL_CAPTURE_LOCK_HOLDER_WRAPPER_STARTTIME"
eval "$ORIGINAL_LOCK_HOLDER_WRAPPER_POLL_SLEEP"
eval "$ORIGINAL_WAIT_LOCK_HOLDER_WRAPPER_CHILD"

run_actual_wrapper_exit_case() {
  local label="$1" child_rc="$2" expected_rc="$3" gate child actual_rc
  gate="$TMP_ROOT/wrapper-${label}.gate"
  clear_active_lock_holder
  : >"$gate"
  ( while [[ -e "$gate" ]]; do /usr/bin/sleep 0.01; done; exit "$child_rc" ) &
  child=$!
  register_active_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$child" || fail_test "$label could not register actual wrapper"
  LOCK_HOLDER_STATE=backend_absent
  LOCK_HOLDER_RESUME_STATE=backend_absent
  rm -f -- "$gate"
  if reap_active_lock_holder_wrapper "$boundary_db"; then actual_rc=0; else actual_rc=$?; fi
  assert_rc "$actual_rc" "$expected_rc" "$label actual wrapper"
  if kill -0 "$child" 2>/dev/null; then fail_test "$label left the actual wrapper running"; fi
  clear_active_lock_holder
}
run_actual_wrapper_exit_case immediate_exit_0 0 0
run_actual_wrapper_exit_case expected_disconnect_2 2 0
run_actual_wrapper_exit_case unknown_exit_42 42 42

run_actual_nonterminal_wrapper_case() {
  local label="$1" stop_child="$2" child actual_rc
  clear_active_lock_holder
  ( while :; do /usr/bin/sleep 0.05; done ) &
  child=$!
  register_active_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$child" || fail_test "$label registration failed"
  LOCK_HOLDER_STATE=backend_absent
  LOCK_HOLDER_RESUME_STATE=backend_absent
  if [[ "$stop_child" == 1 ]]; then
    kill -STOP "$child"
    /usr/bin/sleep 0.05
  fi
  WRAPPER_SLEEP_CALLS=0
  WRAPPER_WAIT_CALLS=0
  lock_holder_wrapper_poll_sleep() { WRAPPER_SLEEP_CALLS=$((WRAPPER_SLEEP_CALLS + 1)); }
  wait_lock_holder_wrapper_child() { WRAPPER_WAIT_CALLS=$((WRAPPER_WAIT_CALLS + 1)); builtin wait "$1"; }
  if reap_active_lock_holder_wrapper "$boundary_db"; then actual_rc=0; else actual_rc=$?; fi
  assert_rc "$actual_rc" "$LOCK_HOLDER_WRAPPER_TIMEOUT_RC" "$label bounded timeout"
  [[ "$WRAPPER_SLEEP_CALLS" -eq 50 && "$WRAPPER_WAIT_CALLS" -eq 0 ]] || fail_test "$label entered wait or lost the 50-poll bound"
  if [[ "$stop_child" == 1 ]]; then kill -CONT "$child"; fi
  kill -TERM "$child" 2>/dev/null || true
  builtin wait "$child" 2>/dev/null || true
  eval "$ORIGINAL_LOCK_HOLDER_WRAPPER_POLL_SLEEP"
  eval "$ORIGINAL_WAIT_LOCK_HOLDER_WRAPPER_CHILD"
  clear_active_lock_holder
}
run_actual_nonterminal_wrapper_case hung_child 0
run_actual_nonterminal_wrapper_case stopped_child 1

# Exercise the formal backend/wrapper cleanup state machine.  The fake database
# owns one exact marker; every call still crosses the production capture/parser.
read_lock_holder_wrapper_snapshot() {
  LOCK_HOLDER_SNAPSHOT_STATE=gone
  LOCK_HOLDER_SNAPSHOT_STARTTIME=""
}
lock_holder_wrapper_poll_sleep() { fail_test "gone fake wrapper unexpectedly slept"; }
WRAPPER_WAIT_CALLS=0
WRAPPER_WAIT_RC=0
wait_lock_holder_wrapper_child() { WRAPPER_WAIT_CALLS=$((WRAPPER_WAIT_CALLS + 1)); return "$WRAPPER_WAIT_RC"; }

LOCK_BACKEND_TEST_MODE=success
LOCK_CONNECTION_TEST_MODE=backend_marker
: >"$LOCK_BACKEND_TARGET_MARKER"
: >"$LOCK_BACKEND_NON_TARGET_MARKER"
LOCK_BACKEND_TERMINATE_CALLS=0
activate_test_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID"
complete_active_lock_holder_cleanup "$boundary_db" || fail_test "first exact holder cleanup failed"
[[ "$LOCK_HOLDER_STATE" == wrapper_reaped ]] || fail_test "first holder cleanup did not reach wrapper_reaped"
[[ "$LOCK_BACKEND_TERMINATE_CALLS" -eq 1 && "$WRAPPER_WAIT_CALLS" -eq 1 ]] || fail_test "first cleanup did not terminate/reap exactly once"
complete_active_lock_holder_cleanup "$boundary_db" || fail_test "second exact holder cleanup failed"
complete_active_lock_holder_cleanup "$boundary_db" || fail_test "third exact holder cleanup failed"
[[ "$LOCK_BACKEND_TERMINATE_CALLS" -eq 1 && "$WRAPPER_WAIT_CALLS" -eq 1 ]] || fail_test "repeat cleanup repeated terminate or reap"
assert_lock_target_still_isolated "idempotent holder cleanup"

# A signal can arrive after PostgreSQL has ended the backend but before Bash
# stores termination_succeeded.  A prior handshake plus an exact zero probe is
# the only recovery path, and it must not call terminate again.
for race_state in active_verified termination_requested; do
  activate_test_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID"
  LOCK_HOLDER_STATE="$race_state"
  LOCK_HOLDER_RESUME_STATE="$race_state"
  rm -f -- "$LOCK_BACKEND_TARGET_MARKER"
  race_terminate_before="$LOCK_BACKEND_TERMINATE_CALLS"
  race_connections_before="$LOCK_CONNECTION_TEST_CALLS"
  complete_active_lock_holder_cleanup "$boundary_db" || fail_test "$race_state backend-absence recovery failed"
  [[ "$LOCK_BACKEND_TERMINATE_CALLS" -eq "$race_terminate_before" ]] || fail_test "$race_state recovery repeated backend termination"
  [[ $((LOCK_CONNECTION_TEST_CALLS - race_connections_before)) -eq 1 ]] || fail_test "$race_state recovery did not prove exact backend absence"
done

# Without a completed holder handshake, zero connections is not promoted to a
# successful exact termination state.
clear_active_lock_holder
capture_lock_holder_wrapper_starttime() { LOCK_HOLDER_SNAPSHOT_STATE=R; LOCK_HOLDER_SNAPSHOT_STARTTIME=42424200; }
register_active_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" 424242 || fail_test "unverified wrapper registration failed"
eval "$ORIGINAL_CAPTURE_LOCK_HOLDER_WRAPPER_STARTTIME"
unverified_terminate_before="$LOCK_BACKEND_TERMINATE_CALLS"
if complete_active_lock_holder_cleanup "$boundary_db"; then unverified_cleanup_rc=0; else unverified_cleanup_rc=$?; fi
assert_rc "$unverified_cleanup_rc" "$LOCK_HOLDER_HANDSHAKE_REQUIRED_RC" "unverified holder cleanup"
[[ "$LOCK_BACKEND_TERMINATE_CALLS" -eq "$unverified_terminate_before" ]] || fail_test "unverified holder reached exact termination"
clear_active_lock_holder

# A false, malformed, or failed exact termination remains fail-closed while the
# target is still present.  The original transport status remains authoritative.
run_holder_cleanup_rejection() {
  local label="$1" mode="$2" connection_mode="$3" expected_rc="$4" actual_rc
  : >"$LOCK_BACKEND_TARGET_MARKER"
  : >"$LOCK_BACKEND_NON_TARGET_MARKER"
  LOCK_BACKEND_TEST_MODE="$mode"
  LOCK_CONNECTION_TEST_MODE="$connection_mode"
  activate_test_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID"
  if complete_active_lock_holder_cleanup "$boundary_db"; then actual_rc=0; else actual_rc=$?; fi
  assert_rc "$actual_rc" "$expected_rc" "$label cleanup rejection"
  [[ -e "$LOCK_BACKEND_TARGET_MARKER" ]] || fail_test "$label removed the target despite rejection"
  assert_lock_target_still_isolated "$label cleanup rejection"
  clear_active_lock_holder
}
run_holder_cleanup_rejection terminate_false terminate_false backend_marker "$QUERY_CAPTURE_VALIDATION_RC"
run_holder_cleanup_rejection terminate_null terminate_null backend_marker "$QUERY_CAPTURE_VALIDATION_RC"
run_holder_cleanup_rejection terminate_invalid terminate_invalid backend_marker "$QUERY_CAPTURE_VALIDATION_RC"
run_holder_cleanup_rejection terminate_transport42 transport42 backend_marker 42
run_holder_cleanup_rejection duplicate_target success output_two "$QUERY_CAPTURE_VALIDATION_RC"

# cleanup_database itself is repeatable: after exact completion, later calls
# neither terminate the backend nor reap the wrapper again.
LOCK_BACKEND_TEST_MODE=success
LOCK_CONNECTION_TEST_MODE=backend_marker
: >"$LOCK_BACKEND_TARGET_MARKER"
: >"$LOCK_BACKEND_NON_TARGET_MARKER"
activate_test_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID"
terminate_calls_before_idempotent="$LOCK_BACKEND_TERMINATE_CALLS"
wrapper_waits_before_idempotent="$WRAPPER_WAIT_CALLS"
admin_terminate_before_idempotent="$(grep -c '^terminate'$'\t' "$SCRIPT_TRANSPORT_LOG" || true)"
for cleanup_iteration in 1 2 3; do
  cleanup_database "$boundary_db" || fail_test "cleanup_database idempotency iteration $cleanup_iteration failed"
done
[[ $((LOCK_BACKEND_TERMINATE_CALLS - terminate_calls_before_idempotent)) -eq 1 ]] || fail_test "cleanup_database repeated exact termination"
[[ $((WRAPPER_WAIT_CALLS - wrapper_waits_before_idempotent)) -eq 1 ]] || fail_test "cleanup_database repeated wrapper reap"
admin_terminate_after_idempotent="$(grep -c '^terminate'$'\t' "$SCRIPT_TRANSPORT_LOG" || true)"
[[ "$admin_terminate_after_idempotent" == "$admin_terminate_before_idempotent" ]] || fail_test "completed exact holder used broad terminate fallback"
assert_lock_target_still_isolated "cleanup_database idempotency"
clear_active_lock_holder

# Once exact pg_terminate_backend has returned 1, a later absence-query failure
# must never fall back to broad database termination.  Repeated cleanup remains
# fail-closed without issuing either exact or broad termination again.
LOCK_BACKEND_TEST_MODE=success
LOCK_CONNECTION_TEST_MODE=backend_marker_then_transport42
: >"$LOCK_BACKEND_TARGET_MARKER"
: >"$LOCK_BACKEND_NON_TARGET_MARKER"
activate_test_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID"
post_terminate_exact_before="$LOCK_BACKEND_TERMINATE_CALLS"
post_terminate_broad_before="$(grep -c '^terminate'$'\t' "$SCRIPT_TRANSPORT_LOG" || true)"
for cleanup_iteration in 1 2; do
  if cleanup_or_fail "$boundary_db"; then post_terminate_cleanup_rc=0; else post_terminate_cleanup_rc=$?; fi
  assert_rc "$post_terminate_cleanup_rc" 75 "post-termination query failure cleanup $cleanup_iteration"
done
post_terminate_broad_after="$(grep -c '^terminate'$'\t' "$SCRIPT_TRANSPORT_LOG" || true)"
[[ $((LOCK_BACKEND_TERMINATE_CALLS - post_terminate_exact_before)) -eq 1 ]] || fail_test "post-termination query failure repeated exact termination"
[[ "$post_terminate_broad_after" == "$post_terminate_broad_before" ]] || fail_test "post-termination query failure used broad termination"
[[ -e "$LOCK_BACKEND_NON_TARGET_MARKER" ]] || fail_test "post-termination query failure touched a non-target connection"
clear_active_lock_holder
rm -f -- "$LOCK_BACKEND_NON_TARGET_MARKER"

# Audit the outer cleanup control flow itself.  These cases retain the formal
# cleanup_database(), cleanup_all(), and on_exit() functions; only the fake
# PostgreSQL process and dropdb result are injected.
OUTER_CLEANUP_LOG="$TMP_ROOT/outer-cleanup.log"
: >"$OUTER_CLEANUP_LOG"
outer_log_count() { grep -c "^$1$" "$OUTER_CLEANUP_LOG" || true; }
outer_broad_count() { grep -c '^terminate'$'\t' "$SCRIPT_TRANSPORT_LOG" || true; }
outer_exact_count() { grep -c '^terminate'$'\t' "$LOCK_BACKEND_TRANSPORT_LOG" || true; }
ORIGINAL_OUTER_DROP_DATABASE_COMMAND="$(declare -f drop_database_command)"
OUTER_DROP_MODE=success
OUTER_DROP_CALLS=0
drop_database_command() {
  OUTER_DROP_CALLS=$((OUTER_DROP_CALLS + 1))
  printf 'drop\n' >>"$OUTER_CLEANUP_LOG"
  [[ "$OUTER_DROP_MODE" == success ]] && return 0
  return 42
}
wait_lock_holder_wrapper_child() {
  WRAPPER_WAIT_CALLS=$((WRAPPER_WAIT_CALLS + 1))
  printf 'reap\n' >>"$OUTER_CLEANUP_LOG"
  return 0
}

# A wrapper with no catalog-verified backend may use the current-run broad
# fallback, but that success cannot erase the handshake error or its tracking
# item.  on_exit must observe and return the same first error on its retry.
clear_active_lock_holder
capture_lock_holder_wrapper_starttime() { LOCK_HOLDER_SNAPSHOT_STATE=R; LOCK_HOLDER_SNAPSHOT_STARTTIME=42424200; }
register_active_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" 424242 || fail_test "outer unverified wrapper registration failed"
eval "$ORIGINAL_CAPTURE_LOCK_HOLDER_WRAPPER_STARTTIME"
CREATED_DATABASES=("$boundary_db")
outer_unverified_broad_before="$(outer_broad_count)"
if cleanup_all; then outer_unverified_rc=0; else outer_unverified_rc=$?; fi
assert_rc "$outer_unverified_rc" "$LOCK_HOLDER_HANDSHAKE_REQUIRED_RC" "outer unverified cleanup_all"
[[ "$LOCK_HOLDER_STATE" == cleanup_failed && "$LOCK_HOLDER_RESUME_STATE" == wrapper_started ]] || \
  fail_test "outer unverified cleanup advanced to a successful holder state"
[[ "$(outer_broad_count)" -eq $((outer_unverified_broad_before + 1)) ]] || fail_test "outer unverified cleanup skipped safe broad fallback"
[[ "${#CREATED_DATABASES[@]}" -eq 1 && "${CREATED_DATABASES[0]}" == "$boundary_db" ]] || \
  fail_test "successful fallback drop erased the handshake failure tracking"
set +e
(
  RUN_ACTIVE=1
  WORK_DIR_CREATED=0
  remove_work_directory() { return 0; }
  on_exit 0
) >/dev/null 2>&1
outer_unverified_exit_rc=$?
set -e
assert_rc "$outer_unverified_exit_rc" "$LOCK_HOLDER_HANDSHAKE_REQUIRED_RC" "outer unverified on_exit"
[[ "$(outer_broad_count)" -eq $((outer_unverified_broad_before + 2)) ]] || fail_test "outer unverified on_exit lost fallback retry"
clear_active_lock_holder

run_pending_absence_cleanup_case() {
  local label="$1" failures="$2" expected_attempts="$3" attempt actual_rc exact_before broad_before drops_before reaps_before
  clear_active_lock_holder
  : >"$LOCK_BACKEND_TARGET_MARKER"
  : >"$LOCK_BACKEND_NON_TARGET_MARKER"
  LOCK_BACKEND_TEST_MODE=success
  LOCK_CONNECTION_TEST_MODE=backend_marker_then_failures_then_zero
  LOCK_CONNECTION_TEST_FAILURES_REMAINING="$failures"
  CREATED_DATABASES=("$boundary_db")
  exact_before="$(outer_exact_count)"
  broad_before="$(outer_broad_count)"
  drops_before="$(outer_log_count drop)"
  reaps_before="$(outer_log_count reap)"
  activate_test_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID"
  for ((attempt=1; attempt<=expected_attempts; attempt++)); do
    if cleanup_all; then actual_rc=0; else actual_rc=$?; fi
    if (( attempt <= failures )); then
      assert_rc "$actual_rc" 42 "$label absence failure $attempt"
      [[ "${#CREATED_DATABASES[@]}" -eq 1 ]] || fail_test "$label failure $attempt removed pending database"
      [[ "$(outer_log_count drop)" -eq "$drops_before" && "$(outer_log_count reap)" -eq "$reaps_before" ]] || \
        fail_test "$label failure $attempt dropped or reaped before exact absence proof"
      [[ "$LOCK_HOLDER_STATE" == cleanup_failed && "$LOCK_HOLDER_RESUME_STATE" == termination_succeeded ]] || \
        fail_test "$label failure $attempt lost termination_succeeded recovery state"
    else
      assert_rc "$actual_rc" 0 "$label final cleanup"
    fi
  done
  [[ "$(outer_exact_count)" -eq $((exact_before + 1)) ]] || fail_test "$label repeated exact termination"
  [[ "$(outer_broad_count)" -eq "$broad_before" ]] || fail_test "$label used broad termination after exact success"
  [[ "$(outer_log_count drop)" -eq $((drops_before + 1)) && "$(outer_log_count reap)" -eq $((reaps_before + 1)) ]] || \
    fail_test "$label did not perform one reap and one drop after absence proof"
  [[ "${#CREATED_DATABASES[@]}" -eq 0 ]] || fail_test "$label final cleanup retained a dropped database"
  assert_lock_target_still_isolated "$label"
}

# First absence transport failure leaves the pending database untouched.  A
# later real on_exit retry continues from termination_succeeded, reaps once,
# and only then drops it.
clear_active_lock_holder
: >"$LOCK_BACKEND_TARGET_MARKER"
: >"$LOCK_BACKEND_NON_TARGET_MARKER"
LOCK_BACKEND_TEST_MODE=success
LOCK_CONNECTION_TEST_MODE=backend_marker_then_failures_then_zero
LOCK_CONNECTION_TEST_FAILURES_REMAINING=1
CREATED_DATABASES=("$boundary_db")
outer_exit_exact_before="$(outer_exact_count)"
outer_exit_broad_before="$(outer_broad_count)"
outer_exit_drops_before="$(outer_log_count drop)"
outer_exit_reaps_before="$(outer_log_count reap)"
activate_test_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID"
if cleanup_all; then outer_exit_first_rc=0; else outer_exit_first_rc=$?; fi
assert_rc "$outer_exit_first_rc" 42 "outer pending absence cleanup_all"
[[ "${#CREATED_DATABASES[@]}" -eq 1 && "$LOCK_HOLDER_STATE" == cleanup_failed && "$LOCK_HOLDER_RESUME_STATE" == termination_succeeded ]] || \
  fail_test "outer pending absence cleanup lost its recoverable state"
[[ "$(outer_log_count drop)" -eq "$outer_exit_drops_before" && "$(outer_log_count reap)" -eq "$outer_exit_reaps_before" ]] || \
  fail_test "outer pending absence cleanup dropped or reaped early"
set +e
(
  RUN_ACTIVE=1
  WORK_DIR_CREATED=0
  remove_work_directory() { return 0; }
  on_exit 0
) >/dev/null 2>&1
outer_exit_retry_rc=$?
set -e
assert_rc "$outer_exit_retry_rc" 0 "outer pending absence on_exit retry"
[[ "$(outer_exact_count)" -eq $((outer_exit_exact_before + 1)) && "$(outer_broad_count)" -eq "$outer_exit_broad_before" ]] || \
  fail_test "outer pending absence on_exit repeated termination"
[[ "$(outer_log_count reap)" -eq $((outer_exit_reaps_before + 1)) && "$(outer_log_count drop)" -eq $((outer_exit_drops_before + 1)) ]] || \
  fail_test "outer pending absence on_exit did not reap then drop"

# Two consecutive absence failures must remain pending; the third real outer
# cleanup resumes from the exact termination state and completes once.
run_pending_absence_cleanup_case absence_two_failures_then_success 2 3

# A dropdb failure is likewise recoverable: keep the tracking entry until a
# later cleanup_all call observes a successful drop.
clear_active_lock_holder
LOCK_CONNECTION_TEST_MODE=""
CREATED_DATABASES=("$boundary_db")
OUTER_DROP_MODE=fail
outer_drop_before="$(outer_log_count drop)"
if cleanup_all; then outer_drop_first_rc=0; else outer_drop_first_rc=$?; fi
assert_rc "$outer_drop_first_rc" 42 "outer drop failure cleanup_all"
[[ "${#CREATED_DATABASES[@]}" -eq 1 && "$(outer_log_count drop)" -eq $((outer_drop_before + 1)) ]] || \
  fail_test "outer drop failure lost database tracking"
OUTER_DROP_MODE=success
cleanup_all || fail_test "outer drop retry cleanup_all failed"
[[ "${#CREATED_DATABASES[@]}" -eq 0 && "$(outer_log_count drop)" -eq $((outer_drop_before + 2)) ]] || \
  fail_test "outer drop retry did not remove tracking after success"
OUTER_DROP_MODE=success

# EXIT, INT, and TERM all reach the real cleanup_all/on_exit path.  While the
# absence query is still transport-failed, none may repeat exact termination,
# fall back broadly, reap, drop, or lose the pending database.
run_pending_outer_exit_case() {
  local label="$1" original_rc="$2" use_signal="$3" actual_rc exact_before broad_before drops_before reaps_before
  clear_active_lock_holder
  : >"$LOCK_BACKEND_TARGET_MARKER"
  : >"$LOCK_BACKEND_NON_TARGET_MARKER"
  LOCK_BACKEND_TEST_MODE=success
  LOCK_CONNECTION_TEST_MODE=backend_marker_then_transport42
  CREATED_DATABASES=("$boundary_db")
  activate_test_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID"
  rm -f -- "$LOCK_BACKEND_TARGET_MARKER"
  LOCK_HOLDER_STATE=termination_succeeded
  LOCK_HOLDER_RESUME_STATE=termination_succeeded
  exact_before="$(outer_exact_count)"
  broad_before="$(outer_broad_count)"
  drops_before="$(outer_log_count drop)"
  reaps_before="$(outer_log_count reap)"
  set +e
  (
    RUN_ACTIVE=1
    WORK_DIR_CREATED=0
    remove_work_directory() { return 0; }
    if [[ "$use_signal" == 1 ]]; then
      install_runtime_traps
      on_signal "$label" "$original_rc"
    else
      on_exit "$original_rc"
    fi
  ) >/dev/null 2>&1
  actual_rc=$?
  set -e
  assert_rc "$actual_rc" "$original_rc" "$label pending outer cleanup exit status"
  [[ "$(outer_exact_count)" -eq "$exact_before" && "$(outer_broad_count)" -eq "$broad_before" && \
     "$(outer_log_count drop)" -eq "$drops_before" && "$(outer_log_count reap)" -eq "$reaps_before" ]] || \
    fail_test "$label pending outer cleanup changed protected work"
  [[ "${#CREATED_DATABASES[@]}" -eq 1 && "${CREATED_DATABASES[0]}" == "$boundary_db" ]] || \
    fail_test "$label pending outer cleanup lost database tracking"
}
run_pending_outer_exit_case EXIT 42 0
run_pending_outer_exit_case INT 130 1
run_pending_outer_exit_case TERM 143 1
eval "$ORIGINAL_OUTER_DROP_DATABASE_COMMAND"
clear_active_lock_holder
CREATED_DATABASES=()

cleanup_guard_calls_before="$(wc -l <"$SCRIPT_TRANSPORT_LOG" | tr -d ' ')"
CLEANUP_DATABASE_IN_PROGRESS=1
if cleanup_database "$boundary_db"; then cleanup_guard_rc=0; else cleanup_guard_rc=$?; fi
CLEANUP_DATABASE_IN_PROGRESS=0
assert_rc "$cleanup_guard_rc" 89 "recursive cleanup_database guard"
cleanup_guard_calls_after="$(wc -l <"$SCRIPT_TRANSPORT_LOG" | tr -d ' ')"
[[ "$cleanup_guard_calls_after" == "$cleanup_guard_calls_before" ]] || fail_test "recursive cleanup_database reached PostgreSQL"

# on_exit masks later INT/TERM while cleanup is already active, so a combined
# EXIT -> INT -> TERM sequence cannot recursively enter cleanup or overwrite rc.
cleanup_reentry_log="$TMP_ROOT/cleanup-reentry.log"
: >"$cleanup_reentry_log"
set +e
(
  RUN_ACTIVE=1
  CLEANUP_DATABASE_IN_PROGRESS=1
  CLEANUP_ALL_IN_PROGRESS=1
  cleanup_all() {
    [[ "$CLEANUP_DATABASE_IN_PROGRESS" -eq 0 && "$CLEANUP_ALL_IN_PROGRESS" -eq 0 ]] || return 99
    printf 'cleanup\n' >>"$cleanup_reentry_log"
    kill -INT "$BASHPID"
    kill -TERM "$BASHPID"
    return 0
  }
  remove_work_directory() { return 0; }
  on_exit 0
) >/dev/null 2>&1
cleanup_reentry_rc=$?
set -e
assert_rc "$cleanup_reentry_rc" 0 "EXIT INT TERM cleanup reentry"
[[ "$(wc -l <"$cleanup_reentry_log" | tr -d ' ')" == 1 ]] || fail_test "cleanup reentry executed cleanup more than once"

eval "$ORIGINAL_READ_LOCK_HOLDER_WRAPPER_SNAPSHOT"
eval "$ORIGINAL_CAPTURE_LOCK_HOLDER_WRAPPER_STARTTIME"
eval "$ORIGINAL_LOCK_HOLDER_WRAPPER_POLL_SLEEP"
eval "$ORIGINAL_WAIT_LOCK_HOLDER_WRAPPER_CHILD"
LOCK_BACKEND_TEST_MODE=""
LOCK_CONNECTION_TEST_MODE=""

# The root-owned query files share the established WORK_DIR lifecycle and are
# removed on normal, INT, and TERM exits without widening the delete boundary.
for cleanup_spec in EXIT:0 INT:130 TERM:143; do
  cleanup_kind="${cleanup_spec%%:*}"
  cleanup_expected_rc="${cleanup_spec##*:}"
  query_cleanup_parent="$TMP_ROOT/query-capture-cleanup-$cleanup_kind"
  query_cleanup_dir="$query_cleanup_parent/memoryai-auth-pg14-matrix.${RUN_NONCE}.capture"
  mkdir -p "$query_cleanup_dir"
  chmod 700 "$query_cleanup_dir"
  set +e
  (
    WORK_DIR="$query_cleanup_dir"
    WORK_DIR_CREATED=1
    RUN_ACTIVE=0
    RUNTIME_READY=0
    FAILED_RECORDED=0
    remove_work_directory() {
      [[ "$WORK_DIR" == "$query_cleanup_dir" && -d "$WORK_DIR" && ! -L "$WORK_DIR" ]] || return 1
      rm -rf -- "$WORK_DIR"
      [[ ! -e "$WORK_DIR" ]]
    }
    install_runtime_traps
    capture_scalar_query admin "$ADMIN_DB" residual_count "${RUN_DB_PREFIX}%" zero <<'QUERY_CLEANUP_SQL'
SELECT count(*) FROM pg_catalog.pg_database WHERE datname LIKE :'matrix_prefix';
QUERY_CLEANUP_SQL
    [[ "$(find "$WORK_DIR" -maxdepth 1 -type f -name 'postgresql-query.residual_count.*' | wc -l | tr -d ' ')" == "2" ]] || exit 99
    case "$cleanup_kind" in
      EXIT) exit 0 ;;
      INT) on_signal INT 130 ;;
      TERM) on_signal TERM 143 ;;
    esac
  ) >/dev/null 2>&1
  query_cleanup_rc=$?
  set -e
  assert_rc "$query_cleanup_rc" "$cleanup_expected_rc" "$cleanup_kind query capture cleanup"
  [[ ! -e "$query_cleanup_dir" ]] || fail_test "$cleanup_kind left query capture files behind"
done

# Active-holder cleanup uses the same exact backend termination on normal exit
# and both signal paths.  The wrapper observes backend removal and exits on its
# own; reap waits for that exact child and never signals an arbitrary PID.
for holder_cleanup_spec in EXIT:0 INT:130 TERM:143 RACE_INT:130 EXIT_INT_TERM:0; do
  holder_cleanup_kind="${holder_cleanup_spec%%:*}"
  holder_cleanup_expected_rc="${holder_cleanup_spec##*:}"
  holder_cleanup_parent="$TMP_ROOT/holder-cleanup-$holder_cleanup_kind"
  holder_cleanup_dir="$holder_cleanup_parent/memoryai-auth-pg14-matrix.${RUN_NONCE}.holder"
  holder_target_marker="$holder_cleanup_parent/target.connected"
  holder_non_target_marker="$holder_cleanup_parent/non-target-other-db.connected"
  holder_pid_file="$holder_cleanup_parent/wrapper.pid"
  mkdir -p "$holder_cleanup_dir"
  chmod 700 "$holder_cleanup_dir"
  : >"$holder_target_marker"
  : >"$holder_non_target_marker"
  holder_terminate_calls_before="$(grep -c '^lock_terminate'$'\t' "$SCRIPT_TRANSPORT_LOG")"
  holder_cleanup_start_ms="$(date +%s%3N)"
  set +e
  (
    WORK_DIR="$holder_cleanup_dir"
    WORK_DIR_CREATED=1
    RUN_ACTIVE=1
    RUNTIME_READY=0
    FAILED_RECORDED=0
    CLEANUP_RECORDED=0
    CREATED_DATABASES=("$boundary_db")
    LOCK_BACKEND_TARGET_MARKER="$holder_target_marker"
    LOCK_BACKEND_NON_TARGET_MARKER="$holder_non_target_marker"
    LOCK_BACKEND_TARGET_DB="$boundary_db"
    LOCK_BACKEND_TARGET_USER=postgres
    LOCK_BACKEND_TARGET_APP="memoryai_auth_matrix_lock_${RUN_NONCE}"
    LOCK_BACKEND_TARGET_PID=0000042420
    if [[ "$holder_cleanup_kind" == RACE_INT ]]; then
      LOCK_BACKEND_TEST_MODE=signal_after_terminate
    else
      LOCK_BACKEND_TEST_MODE=success
    fi
    LOCK_CONNECTION_TEST_MODE=backend_marker
    remove_work_directory() {
      [[ "$WORK_DIR" == "$holder_cleanup_dir" && -d "$WORK_DIR" && ! -L "$WORK_DIR" ]] || return 1
      rm -rf -- "$WORK_DIR"
      [[ ! -e "$WORK_DIR" ]]
    }
    (
      while [[ -e "$holder_target_marker" ]]; do /usr/bin/sleep 0.05; done
    ) &
    holder_cleanup_wrapper=$!
    printf '%s\n' "$holder_cleanup_wrapper" >"$holder_pid_file"
    register_active_lock_holder "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$holder_cleanup_wrapper" || exit 99
    mark_lock_holder_backend_verified "$boundary_db" "$LOCK_BACKEND_TARGET_APP" "$LOCK_BACKEND_TARGET_PID" || exit 99
    if [[ "$holder_cleanup_kind" == EXIT_INT_TERM ]]; then
      wait_lock_holder_wrapper_child() {
        kill -INT "$BASHPID"
        kill -TERM "$BASHPID"
        builtin wait "$1"
      }
    fi
    install_runtime_traps
    case "$holder_cleanup_kind" in
      EXIT) exit 0 ;;
      INT) kill -INT "$BASHPID"; exit 94 ;;
      TERM) kill -TERM "$BASHPID"; exit 94 ;;
      RACE_INT) complete_active_lock_holder_cleanup "$boundary_db"; exit 94 ;;
      EXIT_INT_TERM) exit 0 ;;
    esac
  ) >/dev/null 2>&1
  holder_cleanup_rc=$?
  set -e
  holder_cleanup_end_ms="$(date +%s%3N)"
  assert_rc "$holder_cleanup_rc" "$holder_cleanup_expected_rc" "$holder_cleanup_kind active holder cleanup"
  holder_cleanup_elapsed_ms=$((holder_cleanup_end_ms - holder_cleanup_start_ms))
  [[ "$holder_cleanup_elapsed_ms" -le 20000 ]] || fail_test "$holder_cleanup_kind active holder cleanup exceeded the 20s end-to-end deadline (${holder_cleanup_elapsed_ms}ms)"
  [[ ! -e "$holder_target_marker" ]] || fail_test "$holder_cleanup_kind left the target backend connected"
  holder_terminate_calls_after="$(grep -c '^lock_terminate'$'\t' "$SCRIPT_TRANSPORT_LOG")"
  [[ $((holder_terminate_calls_after - holder_terminate_calls_before)) -eq 1 ]] || fail_test "$holder_cleanup_kind repeated exact backend termination"
  [[ -e "$holder_non_target_marker" ]] || fail_test "$holder_cleanup_kind terminated the other-database connection"
  holder_cleanup_wrapper="$(<"$holder_pid_file")"
  if kill -0 "$holder_cleanup_wrapper" 2>/dev/null; then fail_test "$holder_cleanup_kind left the holder wrapper running"; fi
  [[ ! -e "$holder_cleanup_dir" ]] || fail_test "$holder_cleanup_kind left holder capture files behind"
  rm -f -- "$holder_non_target_marker" "$holder_pid_file"
done

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
preexisting_calls_before="$(grep -c '^preexisting_count'$'\t' "$SCRIPT_TRANSPORT_LOG")"
assert_all_database_names_absent || fail_test "preexisting stdin transport did not replace psql variables"
preexisting_calls_after="$(grep -c '^preexisting_count'$'\t' "$SCRIPT_TRANSPORT_LOG")"
[[ $((preexisting_calls_after - preexisting_calls_before)) -eq 1 ]] || \
  fail_test "preexisting query did not traverse --file=- exactly once"

# Both formal preflight queries map transport failures to 74 before dispatch.
# The real assert_all_database_names_absent and assert_no_residual_databases
# functions remain active; only non-database setup and dispatch are injected.
run_preflight_failure_case() {
  local label="$1" preexisting_shape="$2" preexisting_rc="$3" residual_shape="$4" residual_rc="$5" expected_rc=74 actual_rc
  local state_file="$TMP_ROOT/preflight-${label}.state" dispatch_file="$TMP_ROOT/preflight-${label}.dispatch"
  : >"$state_file"
  rm -f -- "$dispatch_file"
  prepare_query_fixture preexisting_count "$preexisting_shape" "$preexisting_rc"
  prepare_query_fixture residual_count "$residual_shape" "$residual_rc"
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
run_preflight_failure_case preexisting_transport exact_zero 42 exact_zero 0
run_preflight_failure_case preexisting_trailing_blank trailing_blank_zero 0 exact_zero 0
run_preflight_failure_case residual_transport exact_zero 0 exact_zero 42
run_preflight_failure_case residual_nonzero exact_zero 0 exact_one 0
run_preflight_failure_case residual_missing_lf exact_zero 0 missing_lf_zero 0
prepare_query_fixture preexisting_count exact_zero
prepare_query_fixture residual_count exact_zero

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
  clear_active_lock_holder
  if [[ "$mode" == terminate ]]; then
    # Broad termination is now reserved for the explicit no-handshake
    # fallback; ordinary database cleanup must never reach it.
    LOCK_HOLDER_ACTIVE=1
    LOCK_HOLDER_DATABASE="$cleanup_db"
    LOCK_HOLDER_STATE=wrapper_started
    LOCK_HOLDER_RESUME_STATE=wrapper_started
  fi
  CREATED_DATABASES=("$cleanup_db")
  if cleanup_or_fail "$cleanup_db"; then cleanup_rc=0; else cleanup_rc=$?; fi
  assert_rc "$cleanup_rc" 75 "$mode cleanup failure"
  assert_contains "$CLEANUP_STATE" "FAILED_cleanup_"
done
clear_active_lock_holder

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
assert_contains "$CLEANUP_STATE" "CLEANUP_FAILED_RC_92"

# A residual query transport failure is a cleanup failure even when it printed
# zero.  Clean exits preserve its actual rc; an existing business rc remains
# authoritative.
for residual_exit_spec in 0:42 70:70; do
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
  assert_contains "$CLEANUP_STATE" "FAILED_cleanup_residual_42 stdout_bytes=unchecked stderr_bytes=unchecked"
  assert_contains "$CLEANUP_STATE" "CLEANUP_FAILED_RC_42"
done
CLEANUP_RESIDUAL_OUTPUT=$'0\n'
CLEANUP_RESIDUAL_RC=0

# Full dispatcher: actual scenario functions execute; only external dependencies are replaced.
DISPATCH_STATE="$TMP_ROOT/dispatch.state"
DISPATCH_WORK="$TMP_ROOT/dispatch-work"
HOLDER_MARKER="$TMP_ROOT/holder.locked"
DISPATCH_BACKEND_MARKER="$TMP_ROOT/holder-backend.connected"
DISPATCH_NON_TARGET_MARKER="$TMP_ROOT/non-target-backend.connected"
DISPATCH_BACKEND_PID=0000042420
mkdir "$DISPATCH_WORK"
: >"$DISPATCH_NON_TARGET_MARKER"
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
        : >"$DISPATCH_BACKEND_MARKER"
        sleep 4
        return 0 ;;
      lock_granted) [[ -e "$DISPATCH_BACKEND_MARKER" ]] && printf '1\n' || printf '0\n'; return 0 ;;
      lock_backend_pid)
        [[ -e "$DISPATCH_BACKEND_MARKER" ]] && printf '%s\n' "$DISPATCH_BACKEND_PID"
        return 0 ;;
      lock_terminate)
        if [[ -e "$DISPATCH_BACKEND_MARKER" && "${TEST_SCRIPT_SET_ARGUMENTS[0]}" == "--set=lock_app=memoryai_auth_matrix_lock_${RUN_NONCE}" && \
              "${TEST_SCRIPT_SET_ARGUMENTS[1]}" == "--set=lock_pid=${DISPATCH_BACKEND_PID}" ]]; then
          rm -f -- "$DISPATCH_BACKEND_MARKER"
          printf '1\n'
        else
          printf '0\n'
        fi
        return 0 ;;
      lock_connections) [[ -e "$DISPATCH_BACKEND_MARKER" ]] && printf '1\n' || printf '0\n'; return 0 ;;
      terminate)
        # pg_terminate_backend reports signal delivery, not that a just-
        # terminated backend has disappeared from pg_stat_activity.  This
        # source-only switch models the preserved production 1\n -> rc67
        # window without opening a PostgreSQL connection.
        [[ "${MATRIX_RACE_AFTER_BROAD:-0}" == 1 ]] && MATRIX_RACE_PENDING=1
        rm -f -- "$DISPATCH_BACKEND_MARKER"
        return 0
        ;;
      connection_count)
        if [[ "${MATRIX_RACE_PENDING:-0}" == 1 ]]; then
          MATRIX_RACE_PENDING=0
          printf '1\n'
        else
          printf '0\n'
        fi
        return 0
        ;;
      database_exists|residual_count|preexisting_count) printf '0\n'; return 0 ;;
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
: >"$SCRIPT_TRANSPORT_LOG"
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
[[ ! -e "$DISPATCH_BACKEND_MARKER" ]] || fail_test "lock backend marker remained"
[[ -e "$DISPATCH_NON_TARGET_MARKER" ]] || fail_test "full dispatcher terminated a non-target backend"
[[ "$LOCK_HOLDER_ACTIVE" -eq 0 ]] || fail_test "full dispatcher retained active holder state"
for lock_transport in lock_holder lock_granted lock_backend_pid lock_terminate lock_connections; do
  lock_transport_count="$(grep -c "^${lock_transport}"$'\t' "$SCRIPT_TRANSPORT_LOG")"
  if [[ "$lock_transport" == lock_holder || "$lock_transport" == lock_backend_pid || "$lock_transport" == lock_terminate ]]; then
    [[ "$lock_transport_count" -eq 1 ]] || fail_test "$lock_transport did not use exactly one stdin script transport"
  else
    [[ "$lock_transport_count" -ge 1 && "$lock_transport_count" -le 50 ]] || \
      fail_test "$lock_transport poll count is outside 1-50"
  fi
  if [[ "$lock_transport" == lock_terminate ]]; then
    expected_lock_transport="${lock_transport}"$'\t'"${SCENARIO_DATABASES[lock_timeout]}"$'\t'"--set=lock_app=memoryai_auth_matrix_lock_${RUN_NONCE};--set=lock_pid=${DISPATCH_BACKEND_PID}"
  else
    expected_lock_transport="${lock_transport}"$'\t'"${SCENARIO_DATABASES[lock_timeout]}"$'\t'"--set=lock_app=memoryai_auth_matrix_lock_${RUN_NONCE}"
  fi
  while IFS= read -r lock_transport_row; do
    [[ "$lock_transport_row" == "$expected_lock_transport" ]] || fail_test "$lock_transport binding changed"
  done < <(grep "^${lock_transport}"$'\t' "$SCRIPT_TRANSPORT_LOG")
done
rm -f -- "$DISPATCH_NON_TARGET_MARKER"

# Production matrix regression: scenario 55 validated successfully, then the
# unconditional broad cleanup made the first strict connection query observe
# one asynchronously-terminating backend (two stdout bytes, no stderr), which
# correctly maps to rc67.  Prove that exact raw value remains rejected, then
# run the real scenario -> cleanup_or_fail -> cleanup_database path and prove
# ordinary cleanup never creates the race.  The final check is still exactly
# zero and no sleep is introduced.
MATRIX_RACE_AFTER_BROAD=1
MATRIX_RACE_PENDING=1
if capture_scalar_query admin "$ADMIN_DB" connection_count "${SCENARIO_DATABASES[idx_auth_challenges_phone_created__wrong_relation]}" zero <<'RACE_REPRO_CONNECTION_SQL'
SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname = :'matrix_db';
RACE_REPRO_CONNECTION_SQL
then
  race_raw_rc=0
else
  race_raw_rc=$?
fi
assert_rc "$race_raw_rc" "$QUERY_CAPTURE_VALIDATION_RC" "production cleanup 1-byte count value remains fail-closed"

eval "$ORIGINAL_CLEANUP_OR_FAIL"
race_scenario=idx_auth_challenges_phone_created__wrong_relation
race_database="${SCENARIO_DATABASES[$race_scenario]}"
race_broad_before="$(grep -c '^terminate'$'\t' "$SCRIPT_TRANSPORT_LOG" || true)"
MATRIX_RACE_PENDING=0
run_negative_scenario "$race_scenario" index || fail_test "scenario 55 formal cleanup failed"
[[ "$(grep -c '^EXPECTED_REJECTION_PASS ' "$DISPATCH_STATE")" -ge 78 ]] || \
  fail_test "scenario 55 did not validate before formal cleanup"
grep -Fxq -- "CLEANUP_PASS $race_database" "$DISPATCH_STATE" || \
  fail_test "scenario 55 did not record formal cleanup pass"
[[ "$(grep -c "^FAILED_cleanup_connections_${QUERY_CAPTURE_VALIDATION_RC}" "$DISPATCH_STATE" || true)" -eq 0 ]] || \
  fail_test "scenario 55 retained the asynchronous broad cleanup failure"
[[ "$(grep -c '^terminate'$'\t' "$SCRIPT_TRANSPORT_LOG" || true)" -eq "$race_broad_before" ]] || \
  fail_test "scenario 55 ordinary cleanup used broad termination"
[[ "${#CREATED_DATABASES[@]}" -eq 0 ]] || fail_test "scenario 55 left its database tracked after successful cleanup"
MATRIX_RACE_AFTER_BROAD=0
MATRIX_RACE_PENDING=0

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

# Every filesystem boundary uses numeric gid values, never an NSS group name.
gid_boundary_root="$TMP_ROOT/gid-boundaries"
mkdir "$gid_boundary_root"
chmod 700 "$gid_boundary_root"
gid_state_file="$gid_boundary_root/state.file"
printf 'sentinel\n' >"$gid_state_file"
chmod 600 "$gid_state_file"

set +e
(
  stat() {
    case "$2" in %u) printf '0\n' ;; %g) printf '1000\n' ;; %a) printf '700\n' ;; *) return 99 ;; esac
  }
  validate_secure_directory "$gid_boundary_root" 0 0
) >/dev/null 2>&1
bad_work_gid_rc=$?
set -e
assert_rc "$bad_work_gid_rc" 1 "WORK_DIR numeric gid"

set +e
(
  stat() {
    case "$2" in %u) printf '0\n' ;; %g) printf '1000\n' ;; %a) printf '700\n' ;; *) return 99 ;; esac
  }
  validate_state_directory "$gid_boundary_root" 0 0
) >/dev/null 2>&1
bad_state_dir_gid_rc=$?
set -e
assert_rc "$bad_state_dir_gid_rc" 1 "state directory numeric gid"

set +e
(
  stat() {
    case "$2" in '%u:%g:%a') printf '0:1000:600\n' ;; *) return 99 ;; esac
  }
  validate_new_state_file "$gid_state_file" 0 0 "$gid_boundary_root"
) >/dev/null 2>&1
bad_state_file_gid_rc=$?
set -e
assert_rc "$bad_state_file_gid_rc" 1 "state file numeric gid"

state_before_bad_gid="$(<"$gid_state_file")"
set +e
(
  eval "$ORIGINAL_RECORD_STATE"
  STATE_FILE="$gid_state_file"
  STATE_DEVICE_INODE='1:2'
  RUNTIME_READY=1
  stat() {
    case "$2" in '%d:%i') printf '1:2\n' ;; '%u:%g:%a') printf '0:1000:600\n' ;; *) return 99 ;; esac
  }
  record_state should-not-write
) >/dev/null 2>&1
bad_state_write_gid_rc=$?
set -e
assert_rc "$bad_state_write_gid_rc" 76 "state write numeric gid"
[[ "$(<"$gid_state_file")" == "$state_before_bad_gid" ]] || fail_test "bad state gid modified the state file"

gid_delete_parent="$TMP_ROOT/gid-delete-parent"
gid_delete_dir="$gid_delete_parent/memoryai-auth-pg14-matrix.${RUN_NONCE}.capture"
mkdir -p "$gid_delete_dir"
set +e
(
  WORK_DIR="$gid_delete_dir"
  WORK_DIR_CREATED=1
  runtime_parent_path() { printf '%s\n' "$gid_delete_parent"; }
  stat() {
    case "$2" in %u) printf '0\n' ;; %g) printf '1000\n' ;; %a) printf '700\n' ;; *) return 99 ;; esac
  }
  remove_work_directory
) >/dev/null 2>&1
bad_delete_gid_rc=$?
set -e
assert_rc "$bad_delete_gid_rc" 1 "WORK_DIR pre-delete numeric gid"
[[ -d "$gid_delete_dir" ]] || fail_test "bad gid WORK_DIR was deleted"

# State-path attacks use fresh sourced subshells and never write the link target.
state_attack_root="$TMP_ROOT/state-attacks"
mkdir "$state_attack_root"
mkdir "$state_attack_root/real-dir"
ln -s "$state_attack_root/real-dir" "$state_attack_root/link-dir"
set +e
(
  RUN_NONCE=44444444444444444444444444444444
  initialize_state_file "$state_attack_root/link-dir" "$(id -u)" "$(id -g)"
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
  initialize_state_file "$state_attack_root" "$(id -u)" "$(id -g)"
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
