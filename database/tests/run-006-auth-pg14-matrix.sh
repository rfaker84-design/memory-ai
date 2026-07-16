#!/usr/bin/env bash
set -Eeuo pipefail
export TZ=UTC

readonly DB_PREFIX="memoryai_auth_negative_"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DATABASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly MIGRATION_DIR="$DATABASE_DIR/migrations"
readonly MIGRATION_006="$MIGRATION_DIR/006_auth_verification_challenges.sql"
readonly PSQL="psql"
readonly CREATEDB="createdb"
readonly DROPDB="dropdb"
readonly ADMIN_DB="postgres"
RUN_ID="${MATRIX_RUN_ID:-$(date -u +%Y%m%d%H%M%S)_$$_${RANDOM}}"
readonly CALLER_RUN_NONCE_PRESENT="${RUN_NONCE+x}"
RUN_NONCE=""
RUN_DB_PREFIX=""
readonly MAX_DATABASE_NAME_LENGTH=58

MODE="run"
CURRENT_STAGE="startup"
RUN_ACTIVE=0
RUNTIME_READY=0
WORK_DIR_CREATED=0
CLEANUP_RECORDED=0
FAILED_RECORDED=0
WORK_DIR=""
STATE_FILE=""
STATE_DEVICE_INODE=""
declare -a CREATED_DATABASES=()
declare -A SCENARIO_DATABASES=()
DERIVED_DATABASE=""
CURRENT_REJECTION_ORACLE=""
CURRENT_BEHAVIOR_ORACLE=""

readonly -a CHALLENGE_SCENARIOS=(
  challenge_id_type
  challenge_id_nullable
  challenge_id_missing_default
  challenge_id_wrong_default
  challenge_id_missing_primary_key
  challenge_id_composite_primary_key
)
readonly -a CHECK_NAMES=(
  ck_auth_challenge_phone_hash
  ck_auth_challenge_code_digest
  ck_auth_challenge_ip_hash
  ck_auth_challenge_purpose
  ck_auth_challenge_attempts
  ck_auth_challenge_timing
  ck_auth_challenge_consumed_at
  ck_auth_challenge_provider_request_id
)
readonly -a CHECK_VARIANTS=(wrong_relation duplicate_name wrong_conkey not_valid no_inherit wrong_expression)
readonly -a INDEX_NAMES=(
  idx_auth_challenges_phone_created
  idx_auth_challenges_ip_created
  idx_auth_challenges_expires_at
)
readonly -a INDEX_VARIANTS=(wrong_relation wrong_key wrong_sort unique access_method predicate expression)
readonly -a SPECIAL_SCENARIOS=(lock_timeout transaction_rollback constraint_behavior final_catalog)
readonly -a BEHAVIOR_CASES=(
  phone_hash_len63 phone_hash_len64 phone_hash_len65 phone_hash_nonhex phone_hash_uppercase
  code_digest_len63 code_digest_len64 code_digest_len65 code_digest_nonhex code_digest_uppercase
  request_ip_hash_len63 request_ip_hash_len64 request_ip_hash_len65 request_ip_hash_nonhex request_ip_hash_uppercase
  purpose_sign_in purpose_other attempts_negative max_attempts_zero attempts_over_max attempts_zero attempts_equal_max
  timing_resend_equal_created timing_expires_equal_resend timing_strictly_increasing
  consumed_null consumed_equal_created consumed_before_created
  provider_null provider_len1 provider_len128 provider_empty provider_len129
)

# Each expected rejection has its own frozen server-ERROR oracle.  The lock
# timeout is deliberately category-only: PostgreSQL's terse lock-timeout ERROR
# does not promise to repeat the blocked relation name.
readonly -a REJECTION_ORACLE_ROWS=(
  $'challenge_id_type\tchallenge_id\tatttypid must be uuid\tobject_and_category'
  $'challenge_id_nullable\tchallenge_id\tattnotnull must be true\tobject_and_category'
  $'challenge_id_missing_default\tchallenge_id\tdefault is missing\tobject_and_category'
  $'challenge_id_wrong_default\tchallenge_id\tdefault must directly call pg_catalog.gen_random_uuid()\tobject_and_category'
  $'challenge_id_missing_primary_key\tchallenge_id\tprimary key count must be 1\tobject_and_category'
  $'challenge_id_composite_primary_key\tchallenge_id\tprimary key conkey must contain challenge_id only\tobject_and_category'
  $'ck_auth_challenge_phone_hash__wrong_relation\tck_auth_challenge_phone_hash\thas wrong relation\tobject_and_category'
  $'ck_auth_challenge_phone_hash__duplicate_name\tck_auth_challenge_phone_hash\thas duplicate names\tobject_and_category'
  $'ck_auth_challenge_phone_hash__wrong_conkey\tck_auth_challenge_phone_hash\thas wrong conkey\tobject_and_category'
  $'ck_auth_challenge_phone_hash__not_valid\tck_auth_challenge_phone_hash\tis not validated\tobject_and_category'
  $'ck_auth_challenge_phone_hash__no_inherit\tck_auth_challenge_phone_hash\tunexpectedly uses NO INHERIT\tobject_and_category'
  $'ck_auth_challenge_phone_hash__wrong_expression\tck_auth_challenge_phone_hash\thas wrong normalized expression\tobject_and_category'
  $'ck_auth_challenge_code_digest__wrong_relation\tck_auth_challenge_code_digest\thas wrong relation\tobject_and_category'
  $'ck_auth_challenge_code_digest__duplicate_name\tck_auth_challenge_code_digest\thas duplicate names\tobject_and_category'
  $'ck_auth_challenge_code_digest__wrong_conkey\tck_auth_challenge_code_digest\thas wrong conkey\tobject_and_category'
  $'ck_auth_challenge_code_digest__not_valid\tck_auth_challenge_code_digest\tis not validated\tobject_and_category'
  $'ck_auth_challenge_code_digest__no_inherit\tck_auth_challenge_code_digest\tunexpectedly uses NO INHERIT\tobject_and_category'
  $'ck_auth_challenge_code_digest__wrong_expression\tck_auth_challenge_code_digest\thas wrong normalized expression\tobject_and_category'
  $'ck_auth_challenge_ip_hash__wrong_relation\tck_auth_challenge_ip_hash\thas wrong relation\tobject_and_category'
  $'ck_auth_challenge_ip_hash__duplicate_name\tck_auth_challenge_ip_hash\thas duplicate names\tobject_and_category'
  $'ck_auth_challenge_ip_hash__wrong_conkey\tck_auth_challenge_ip_hash\thas wrong conkey\tobject_and_category'
  $'ck_auth_challenge_ip_hash__not_valid\tck_auth_challenge_ip_hash\tis not validated\tobject_and_category'
  $'ck_auth_challenge_ip_hash__no_inherit\tck_auth_challenge_ip_hash\tunexpectedly uses NO INHERIT\tobject_and_category'
  $'ck_auth_challenge_ip_hash__wrong_expression\tck_auth_challenge_ip_hash\thas wrong normalized expression\tobject_and_category'
  $'ck_auth_challenge_purpose__wrong_relation\tck_auth_challenge_purpose\thas wrong relation\tobject_and_category'
  $'ck_auth_challenge_purpose__duplicate_name\tck_auth_challenge_purpose\thas duplicate names\tobject_and_category'
  $'ck_auth_challenge_purpose__wrong_conkey\tck_auth_challenge_purpose\thas wrong conkey\tobject_and_category'
  $'ck_auth_challenge_purpose__not_valid\tck_auth_challenge_purpose\tis not validated\tobject_and_category'
  $'ck_auth_challenge_purpose__no_inherit\tck_auth_challenge_purpose\tunexpectedly uses NO INHERIT\tobject_and_category'
  $'ck_auth_challenge_purpose__wrong_expression\tck_auth_challenge_purpose\thas wrong normalized expression\tobject_and_category'
  $'ck_auth_challenge_attempts__wrong_relation\tck_auth_challenge_attempts\thas wrong relation\tobject_and_category'
  $'ck_auth_challenge_attempts__duplicate_name\tck_auth_challenge_attempts\thas duplicate names\tobject_and_category'
  $'ck_auth_challenge_attempts__wrong_conkey\tck_auth_challenge_attempts\thas wrong conkey\tobject_and_category'
  $'ck_auth_challenge_attempts__not_valid\tck_auth_challenge_attempts\tis not validated\tobject_and_category'
  $'ck_auth_challenge_attempts__no_inherit\tck_auth_challenge_attempts\tunexpectedly uses NO INHERIT\tobject_and_category'
  $'ck_auth_challenge_attempts__wrong_expression\tck_auth_challenge_attempts\thas wrong normalized expression\tobject_and_category'
  $'ck_auth_challenge_timing__wrong_relation\tck_auth_challenge_timing\thas wrong relation\tobject_and_category'
  $'ck_auth_challenge_timing__duplicate_name\tck_auth_challenge_timing\thas duplicate names\tobject_and_category'
  $'ck_auth_challenge_timing__wrong_conkey\tck_auth_challenge_timing\thas wrong conkey\tobject_and_category'
  $'ck_auth_challenge_timing__not_valid\tck_auth_challenge_timing\tis not validated\tobject_and_category'
  $'ck_auth_challenge_timing__no_inherit\tck_auth_challenge_timing\tunexpectedly uses NO INHERIT\tobject_and_category'
  $'ck_auth_challenge_timing__wrong_expression\tck_auth_challenge_timing\thas wrong normalized expression\tobject_and_category'
  $'ck_auth_challenge_consumed_at__wrong_relation\tck_auth_challenge_consumed_at\thas wrong relation\tobject_and_category'
  $'ck_auth_challenge_consumed_at__duplicate_name\tck_auth_challenge_consumed_at\thas duplicate names\tobject_and_category'
  $'ck_auth_challenge_consumed_at__wrong_conkey\tck_auth_challenge_consumed_at\thas wrong conkey\tobject_and_category'
  $'ck_auth_challenge_consumed_at__not_valid\tck_auth_challenge_consumed_at\tis not validated\tobject_and_category'
  $'ck_auth_challenge_consumed_at__no_inherit\tck_auth_challenge_consumed_at\tunexpectedly uses NO INHERIT\tobject_and_category'
  $'ck_auth_challenge_consumed_at__wrong_expression\tck_auth_challenge_consumed_at\thas wrong normalized expression\tobject_and_category'
  $'ck_auth_challenge_provider_request_id__wrong_relation\tck_auth_challenge_provider_request_id\thas wrong relation\tobject_and_category'
  $'ck_auth_challenge_provider_request_id__duplicate_name\tck_auth_challenge_provider_request_id\thas duplicate names\tobject_and_category'
  $'ck_auth_challenge_provider_request_id__wrong_conkey\tck_auth_challenge_provider_request_id\thas wrong conkey\tobject_and_category'
  $'ck_auth_challenge_provider_request_id__not_valid\tck_auth_challenge_provider_request_id\tis not validated\tobject_and_category'
  $'ck_auth_challenge_provider_request_id__no_inherit\tck_auth_challenge_provider_request_id\tunexpectedly uses NO INHERIT\tobject_and_category'
  $'ck_auth_challenge_provider_request_id__wrong_expression\tck_auth_challenge_provider_request_id\thas wrong normalized expression\tobject_and_category'
  $'idx_auth_challenges_phone_created__wrong_relation\tidx_auth_challenges_phone_created\thas wrong relation\tobject_and_category'
  $'idx_auth_challenges_phone_created__wrong_key\tidx_auth_challenges_phone_created\thas wrong key columns\tobject_and_category'
  $'idx_auth_challenges_phone_created__wrong_sort\tidx_auth_challenges_phone_created\thas wrong sort options\tobject_and_category'
  $'idx_auth_challenges_phone_created__unique\tidx_auth_challenges_phone_created\tis unexpectedly unique\tobject_and_category'
  $'idx_auth_challenges_phone_created__access_method\tidx_auth_challenges_phone_created\thas wrong access method\tobject_and_category'
  $'idx_auth_challenges_phone_created__predicate\tidx_auth_challenges_phone_created\tunexpectedly has a predicate\tobject_and_category'
  $'idx_auth_challenges_phone_created__expression\tidx_auth_challenges_phone_created\tunexpectedly has an expression\tobject_and_category'
  $'idx_auth_challenges_ip_created__wrong_relation\tidx_auth_challenges_ip_created\thas wrong relation\tobject_and_category'
  $'idx_auth_challenges_ip_created__wrong_key\tidx_auth_challenges_ip_created\thas wrong key columns\tobject_and_category'
  $'idx_auth_challenges_ip_created__wrong_sort\tidx_auth_challenges_ip_created\thas wrong sort options\tobject_and_category'
  $'idx_auth_challenges_ip_created__unique\tidx_auth_challenges_ip_created\tis unexpectedly unique\tobject_and_category'
  $'idx_auth_challenges_ip_created__access_method\tidx_auth_challenges_ip_created\thas wrong access method\tobject_and_category'
  $'idx_auth_challenges_ip_created__predicate\tidx_auth_challenges_ip_created\tunexpectedly has a predicate\tobject_and_category'
  $'idx_auth_challenges_ip_created__expression\tidx_auth_challenges_ip_created\tunexpectedly has an expression\tobject_and_category'
  $'idx_auth_challenges_expires_at__wrong_relation\tidx_auth_challenges_expires_at\thas wrong relation\tobject_and_category'
  $'idx_auth_challenges_expires_at__wrong_key\tidx_auth_challenges_expires_at\thas wrong key columns\tobject_and_category'
  $'idx_auth_challenges_expires_at__wrong_sort\tidx_auth_challenges_expires_at\thas wrong sort options\tobject_and_category'
  $'idx_auth_challenges_expires_at__unique\tidx_auth_challenges_expires_at\tis unexpectedly unique\tobject_and_category'
  $'idx_auth_challenges_expires_at__access_method\tidx_auth_challenges_expires_at\thas wrong access method\tobject_and_category'
  $'idx_auth_challenges_expires_at__predicate\tidx_auth_challenges_expires_at\tunexpectedly has a predicate\tobject_and_category'
  $'idx_auth_challenges_expires_at__expression\tidx_auth_challenges_expires_at\tunexpectedly has an expression\tobject_and_category'
  $'lock_timeout\t-\tcanceling statement due to lock timeout\tcategory_only'
  $'transaction_rollback\tck_auth_challenge_provider_request_id\thas wrong relation\tobject_and_category'
)

readonly -a BEHAVIOR_ORACLE_ROWS=(
  $'phone_hash_len63\tREJECT\tck_auth_challenge_phone_hash\tviolates check constraint'
  $'phone_hash_len64\tPASS\t-\t-'
  $'phone_hash_len65\tREJECT\tcharacter(64)\tvalue too long for type'
  $'phone_hash_nonhex\tREJECT\tck_auth_challenge_phone_hash\tviolates check constraint'
  $'phone_hash_uppercase\tREJECT\tck_auth_challenge_phone_hash\tviolates check constraint'
  $'code_digest_len63\tREJECT\tck_auth_challenge_code_digest\tviolates check constraint'
  $'code_digest_len64\tPASS\t-\t-'
  $'code_digest_len65\tREJECT\tcharacter(64)\tvalue too long for type'
  $'code_digest_nonhex\tREJECT\tck_auth_challenge_code_digest\tviolates check constraint'
  $'code_digest_uppercase\tREJECT\tck_auth_challenge_code_digest\tviolates check constraint'
  $'request_ip_hash_len63\tREJECT\tck_auth_challenge_ip_hash\tviolates check constraint'
  $'request_ip_hash_len64\tPASS\t-\t-'
  $'request_ip_hash_len65\tREJECT\tcharacter(64)\tvalue too long for type'
  $'request_ip_hash_nonhex\tREJECT\tck_auth_challenge_ip_hash\tviolates check constraint'
  $'request_ip_hash_uppercase\tREJECT\tck_auth_challenge_ip_hash\tviolates check constraint'
  $'purpose_sign_in\tPASS\t-\t-'
  $'purpose_other\tREJECT\tck_auth_challenge_purpose\tviolates check constraint'
  $'attempts_negative\tREJECT\tck_auth_challenge_attempts\tviolates check constraint'
  $'max_attempts_zero\tREJECT\tck_auth_challenge_attempts\tviolates check constraint'
  $'attempts_over_max\tREJECT\tck_auth_challenge_attempts\tviolates check constraint'
  $'attempts_zero\tPASS\t-\t-'
  $'attempts_equal_max\tPASS\t-\t-'
  $'timing_resend_equal_created\tREJECT\tck_auth_challenge_timing\tviolates check constraint'
  $'timing_expires_equal_resend\tREJECT\tck_auth_challenge_timing\tviolates check constraint'
  $'timing_strictly_increasing\tPASS\t-\t-'
  $'consumed_null\tPASS\t-\t-'
  $'consumed_equal_created\tPASS\t-\t-'
  $'consumed_before_created\tREJECT\tck_auth_challenge_consumed_at\tviolates check constraint'
  $'provider_null\tPASS\t-\t-'
  $'provider_len1\tPASS\t-\t-'
  $'provider_len128\tPASS\t-\t-'
  $'provider_empty\tREJECT\tck_auth_challenge_provider_request_id\tviolates check constraint'
  $'provider_len129\tREJECT\tck_auth_challenge_provider_request_id\tviolates check constraint'
)

declare -A CHECK_EXPRESSIONS=(
  [ck_auth_challenge_phone_hash]="phone_hash ~ '^[0-9a-f]{64}$'"
  [ck_auth_challenge_code_digest]="code_digest ~ '^[0-9a-f]{64}$'"
  [ck_auth_challenge_ip_hash]="request_ip_hash ~ '^[0-9a-f]{64}$'"
  [ck_auth_challenge_purpose]="purpose = 'sign_in'"
  [ck_auth_challenge_attempts]="attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts"
  [ck_auth_challenge_timing]="resend_after > created_at AND expires_at > resend_after"
  [ck_auth_challenge_consumed_at]="consumed_at IS NULL OR consumed_at >= created_at"
  [ck_auth_challenge_provider_request_id]="provider_request_id IS NULL OR (char_length(provider_request_id) >= 1 AND char_length(provider_request_id) <= 128)"
)
declare -A INDEX_COLUMNS=(
  [idx_auth_challenges_phone_created]="phone_hash, created_at DESC"
  [idx_auth_challenges_ip_created]="request_ip_hash, created_at DESC"
  [idx_auth_challenges_expires_at]="expires_at"
)

record_state() {
  [[ "$RUNTIME_READY" -eq 1 && -n "$STATE_FILE" ]] || return 0
  [[ -f "$STATE_FILE" && ! -L "$STATE_FILE" ]] || return 76
  [[ "$(stat -c '%d:%i' "$STATE_FILE")" == "$STATE_DEVICE_INODE" ]] || return 76
  [[ "$(stat -c '%u' "$STATE_FILE")" == "0" && "$(stat -c '%a' "$STATE_FILE")" == "600" ]] || return 76
  printf '%(%Y-%m-%dT%H:%M:%SZ)T\t%s\n' -1 "$1" >>"$STATE_FILE"
}

fail() {
  local stage="$1" rc="$2" message="$3"
  CURRENT_STAGE="$stage"
  if [[ "$FAILED_RECORDED" -eq 0 ]]; then
    record_state "FAILED_${stage}_${rc}"
    FAILED_RECORDED=1
  fi
  printf 'ERROR[%s]: %s\n' "$stage" "$message" >&2
  exit "$rc"
}

is_protected_database() {
  case "$1" in
    memoryai|postgres|template0|template1) return 0 ;;
    *) return 1 ;;
  esac
}

validate_test_database_name() {
  local database="$1"
  [[ "$database" =~ ^[a-z0-9_]+$ ]] || fail input 64 "unsafe database name: $database"
  [[ "$database" == "$RUN_DB_PREFIX"* ]] || fail input 64 "database is outside current run nonce: $database"
  [[ "${#database}" -le 63 ]] || fail input 64 "database name is longer than 63 bytes: $database"
  ! is_protected_database "$database" || fail input 64 "protected database target rejected: $database"
}

psql_command() {
  "$PSQL" "$@"
}

admin_psql() {
  psql_command -X --no-psqlrc -v ON_ERROR_STOP=1 -d "$ADMIN_DB" "$@"
}

database_psql() {
  local database="$1"
  shift
  validate_test_database_name "$database"
  psql_command -X --no-psqlrc -v ON_ERROR_STOP=1 -d "$database" "$@"
}

drop_database_command() {
  "$DROPDB" --if-exists --force "$1"
}

create_database_command() {
  "$CREATEDB" --template=template0 "$1"
}

remove_created_database() {
  local target="$1" item
  local -a remaining=()
  for item in "${CREATED_DATABASES[@]:-}"; do
    [[ "$item" == "$target" ]] || remaining+=("$item")
  done
  CREATED_DATABASES=("${remaining[@]}")
}

cleanup_database() {
  local database="$1" cleanup_rc=0 terminate_rc=0 connections_rc=0 connections="" drop_rc=0 exists_rc=0 exists=""
  validate_test_database_name "$database"
  set +e
  admin_psql -v "matrix_db=$database" -c \
    "SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE datname = :'matrix_db' AND pid <> pg_catalog.pg_backend_pid();" \
    >/dev/null
  terminate_rc=$?
  set -e
  if [[ "$terminate_rc" -ne 0 ]]; then
    record_state "FAILED_cleanup_terminate_${terminate_rc} $database"
    cleanup_rc=1
  fi

  set +e
  connections="$(admin_psql -At -v "matrix_db=$database" -c \
    "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname = :'matrix_db';" 2>/dev/null)"
  connections_rc=$?
  set -e
  if [[ "$connections_rc" -ne 0 || "$connections" != "0" ]]; then
    record_state "FAILED_cleanup_connections_${connections_rc} $database count=${connections:-unknown}"
    cleanup_rc=1
  fi

  set +e
  drop_database_command "$database" >/dev/null
  drop_rc=$?
  set -e
  if [[ "$drop_rc" -ne 0 ]]; then
    record_state "FAILED_cleanup_dropdb_${drop_rc} $database"
    cleanup_rc=1
  fi

  set +e
  exists="$(admin_psql -At -v "matrix_db=$database" -c \
    "SELECT count(*) FROM pg_catalog.pg_database WHERE datname = :'matrix_db';" 2>/dev/null)"
  exists_rc=$?
  set -e
  if [[ "$exists_rc" -ne 0 || "$exists" != "0" ]]; then
    record_state "FAILED_cleanup_database_exists_${exists_rc} $database count=${exists:-unknown}"
    cleanup_rc=1
  fi

  if [[ "$drop_rc" -eq 0 && "$exists_rc" -eq 0 && "$exists" == "0" ]]; then
    remove_created_database "$database"
  fi
  if [[ "$cleanup_rc" -eq 0 ]]; then
    record_state "CLEANUP_PASS $database"
  fi
  return "$cleanup_rc"
}

cleanup_or_fail() {
  if cleanup_database "$1"; then
    return 0
  else
    return 75
  fi
}

assert_no_residual_databases() {
  local count
  count="$(admin_psql -At -v "matrix_prefix=${RUN_DB_PREFIX}%" -c \
    "SELECT count(*) FROM pg_catalog.pg_database WHERE datname LIKE :'matrix_prefix';")"
  [[ "$count" == "0" ]] || return 1
}

assert_all_database_names_absent() {
  local names count rc
  names="$(printf '%s\n' "${SCENARIO_DATABASES[@]}" | sort | paste -sd, -)"
  set +e
  count="$(admin_psql -At -v "matrix_names=$names" -c \
    "SELECT count(*) FROM pg_catalog.pg_database WHERE datname = ANY(pg_catalog.string_to_array(:'matrix_names', ','));" 2>/dev/null)"
  rc=$?
  set -e
  [[ "$rc" -eq 0 ]] || fail preexisting 74 "cannot verify matrix database absence"
  [[ "$count" == "0" ]] || fail preexisting 74 "one or more matrix database names already exist"
}

cleanup_all() {
  local database rc=0
  for database in "${CREATED_DATABASES[@]:-}"; do
    [[ -n "$database" ]] || continue
    if ! cleanup_database "$database"; then
      rc=1
    fi
  done
  if ! assert_no_residual_databases; then
    record_state "FAILED_cleanup_residual_1 prefix=$RUN_DB_PREFIX"
    rc=1
  fi
  if [[ "$rc" -eq 0 && "$CLEANUP_RECORDED" -eq 0 ]]; then
    record_state "CLEANUP_PASS residual=0"
    CLEANUP_RECORDED=1
  fi
  return "$rc"
}

validate_secure_directory() {
  local directory="$1" required_owner="$2" mode
  [[ -d "$directory" && ! -L "$directory" ]] || return 1
  [[ "$(stat -c '%u' "$directory")" == "$required_owner" ]] || return 1
  mode="$(stat -c '%a' "$directory")"
  [[ "$mode" == "700" ]]
}

runtime_parent_path() { printf '/var/tmp\n'; }
state_parent_path() { printf '/var/log/memoryai\n'; }
create_state_file() { mktemp "$1"; }

validate_state_directory() {
  local directory="$1" owner="$2" mode
  [[ -d "$directory" && ! -L "$directory" ]] || return 1
  [[ "$(stat -c '%u' "$directory")" == "$owner" ]] || return 1
  mode="$(stat -c '%a' "$directory")"
  (( (8#$mode & 0022) == 0 ))
}

validate_new_state_file() {
  local file="$1" owner="$2"
  [[ -f "$file" && ! -L "$file" ]] || return 1
  [[ "$(stat -c '%u' "$file")" == "$owner" && "$(stat -c '%a' "$file")" == "600" ]]
}

initialize_state_file() {
  local state_parent="$1" required_owner="$2" preexisting_state_inodes state_inode
  validate_state_directory "$state_parent" "$required_owner" || fail runtime 76 "unsafe state directory"
  preexisting_state_inodes="$(find "$state_parent" -maxdepth 1 -type f -printf '%d:%i\n')"
  STATE_FILE="$(create_state_file "$state_parent/memoryai-auth-pg14-matrix.${RUN_NONCE}.state.XXXXXXXX")" || fail runtime 76 "cannot create state file"
  [[ -n "$STATE_FILE" ]] || fail runtime 76 "state file creator returned an empty path"
  state_inode="$(stat -c '%d:%i' "$STATE_FILE" 2>/dev/null || true)"
  if [[ -n "$state_inode" ]] && grep -Fxq -- "$state_inode" <<<"$preexisting_state_inodes"; then
    fail runtime 76 "state file creator returned a pre-existing target"
  fi
  chmod 600 "$STATE_FILE" || fail runtime 76 "cannot protect state file"
  validate_new_state_file "$STATE_FILE" "$required_owner" || fail runtime 76 "state file ownership, type, or mode is unsafe"
  STATE_DEVICE_INODE="$(stat -c '%d:%i' "$STATE_FILE")"
}

initialize_runtime() {
  local runtime_parent state_parent required_owner runtime_mode
  [[ "$(id -u)" == "0" ]] || fail runtime 76 "matrix runtime must execute as root"
  runtime_parent="$(runtime_parent_path)"
  state_parent="$(state_parent_path)"
  required_owner="0"
  [[ -d "$runtime_parent" && ! -L "$runtime_parent" && "$(stat -c '%u' "$runtime_parent")" == "0" ]] || fail runtime 76 "unsafe /var/tmp"
  runtime_mode="$(stat -c '%a' "$runtime_parent")"
  [[ "$runtime_mode" == "1777" ]] || fail runtime 76 "/var/tmp must be root-owned mode 1777"

  WORK_DIR="$(mktemp -d "$runtime_parent/memoryai-auth-pg14-matrix.${RUN_NONCE}.XXXXXXXX")" || fail runtime 76 "cannot create work directory"
  WORK_DIR_CREATED=1
  chmod 700 "$WORK_DIR" || fail runtime 76 "cannot protect work directory"
  validate_secure_directory "$WORK_DIR" "$required_owner" || fail runtime 76 "work directory validation failed"

  initialize_state_file "$state_parent" "$required_owner"
  [[ "$STATE_FILE" != "$WORK_DIR"/* ]] || fail runtime 76 "state file must not be inside work directory"
  RUNTIME_READY=1
}

remove_work_directory() {
  local expected_parent
  [[ "$WORK_DIR_CREATED" -eq 1 ]] || return 0
  [[ -n "$WORK_DIR" && -d "$WORK_DIR" && ! -L "$WORK_DIR" ]] || return 1
  [[ "${WORK_DIR##*/}" == "memoryai-auth-pg14-matrix.${RUN_NONCE}."* ]] || return 1
  expected_parent="$(runtime_parent_path)"
  [[ "$(cd "$(dirname "$WORK_DIR")" && pwd -P)" == "$expected_parent" ]] || return 1
  [[ "$(stat -c '%u' "$WORK_DIR")" == "$(id -u)" ]] || return 1
  [[ "$(stat -c '%a' "$WORK_DIR")" == "700" ]] || return 1
  rm -rf -- "$WORK_DIR"
  [[ ! -e "$WORK_DIR" ]]
}

on_exit() {
  local original_rc="$1" cleanup_rc=0 final_rc
  trap - EXIT INT TERM
  if [[ "$RUN_ACTIVE" -eq 1 ]]; then
    if ! cleanup_all; then
      cleanup_rc=1
      record_state "FAILED_cleanup_all_1 original_rc=$original_rc"
      record_state "CLEANUP_FAILED_RC_75 original_rc=$original_rc"
    fi
    if ! remove_work_directory; then
      cleanup_rc=1
      record_state "FAILED_cleanup_workdir_1 original_rc=$original_rc"
      record_state "CLEANUP_FAILED_RC_75 original_rc=$original_rc"
    fi
    if [[ "$original_rc" -ne 0 ]]; then
      final_rc="$original_rc"
      [[ "$FAILED_RECORDED" -eq 1 ]] || record_state "FAILED_${CURRENT_STAGE}_${original_rc}"
    elif [[ "$cleanup_rc" -ne 0 ]]; then
      final_rc=75
    else
      final_rc=0
      record_state "COMPLETE"
    fi
  else
    if [[ "$WORK_DIR_CREATED" -eq 1 ]] && ! remove_work_directory; then
      final_rc=75
    else
      final_rc="$original_rc"
    fi
  fi
  exit "$final_rc"
}

on_signal() {
  local signal="$1" rc="$2"
  CURRENT_STAGE="signal_${signal}"
  [[ "$FAILED_RECORDED" -eq 1 ]] || { record_state "FAILED_signal_${signal}_${rc}"; FAILED_RECORDED=1; }
  exit "$rc"
}

install_runtime_traps() {
  trap 'on_exit $?' EXIT
  trap 'on_signal INT 130' INT
  trap 'on_signal TERM 143' TERM
}

scenario_rows() {
  local item variant
  for item in "${CHALLENGE_SCENARIOS[@]}"; do
    printf '%s\tchallenge_id\tEXPECTED_REJECTION\n' "$item"
  done
  for item in "${CHECK_NAMES[@]}"; do
    for variant in "${CHECK_VARIANTS[@]}"; do
      printf '%s__%s\tcheck_constraint\tEXPECTED_REJECTION\n' "$item" "$variant"
    done
  done
  for item in "${INDEX_NAMES[@]}"; do
    for variant in "${INDEX_VARIANTS[@]}"; do
      printf '%s__%s\tindex\tEXPECTED_REJECTION\n' "$item" "$variant"
    done
  done
  printf 'lock_timeout\tlocking\tEXPECTED_REJECTION\n'
  printf 'transaction_rollback\tatomicity\tEXPECTED_REJECTION\n'
  printf 'constraint_behavior\tbehavior\tBEHAVIOR_PASS\n'
  printf 'final_catalog\tcatalog\tFINAL_CATALOG_PASS\n'
}

scenario_exists() {
  local wanted="$1"
  scenario_rows | awk -F '\t' -v wanted="$wanted" '$1 == wanted { found=1 } END { exit found ? 0 : 1 }'
}

generate_run_nonce() {
  local raw
  if [[ -r /proc/sys/kernel/random/uuid ]]; then
    IFS= read -r raw </proc/sys/kernel/random/uuid || fail nonce 83 "cannot read kernel UUID"
    RUN_NONCE="${raw//-/}"
  elif [[ -r /dev/urandom ]]; then
    RUN_NONCE="$(LC_ALL=C od -An -tx1 -N16 /dev/urandom | tr -d '[:space:]')"
  else
    fail nonce 83 "kernel random source is unavailable"
  fi
  RUN_NONCE="${RUN_NONCE,,}"
  [[ "$RUN_NONCE" =~ ^[0-9a-f]{32}$ ]] || fail nonce 83 "kernel UUID is not 128-bit lowercase hexadecimal"
}

configure_run_identity() {
  generate_run_nonce
  [[ "$RUN_NONCE" =~ ^[0-9a-f]{32}$ ]] || fail nonce 83 "run nonce validation failed"
  RUN_DB_PREFIX="${DB_PREFIX}${RUN_NONCE}_"
}

selected_scenarios() {
  scenario_rows
}

database_for_scenario() {
  local scenario="$1"
  [[ -n "${SCENARIO_DATABASES[$scenario]:-}" ]] || return 1
  printf '%s' "${SCENARIO_DATABASES[$scenario]}"
}

derive_database_for_scenario() {
  local scenario="$1" index="$2" database
  [[ "$scenario" =~ ^[a-z0-9_]+$ ]] || return 1
  [[ "$RUN_NONCE" =~ ^[0-9a-f]{32}$ ]] || return 1
  [[ "$index" =~ ^(0[1-9]|[1-7][0-9])$ ]] || return 1
  database="${DB_PREFIX}${RUN_NONCE}_${index}"
  [[ "${#database}" -le 63 ]] || return 1
  DERIVED_DATABASE="$database"
}

validate_all_database_names() {
  local scenario category expected database count=0 index
  declare -A seen=()
  while IFS=$'\t' read -r scenario category expected; do
    count=$((count + 1))
    printf -v index '%02d' "$count"
    derive_database_for_scenario "$scenario" "$index" || fail naming 77 "cannot derive database name for $scenario"
    database="$DERIVED_DATABASE"
    validate_test_database_name "$database"
    [[ -z "${seen[$database]:-}" ]] || fail naming 77 "database name collision: $scenario and ${seen[$database]} -> $database"
    seen[$database]="$scenario"
    SCENARIO_DATABASES[$scenario]="$database"
  done < <(scenario_rows)
  [[ "$count" -eq 79 && "${#seen[@]}" -eq 79 ]] || fail naming 77 "expected 79 unique database names, got ${#seen[@]}"
}

record_database_mappings() {
  local scenario category expected database index=0 index_text
  while IFS=$'\t' read -r scenario category expected; do
    index=$((index + 1))
    printf -v index_text '%02d' "$index"
    database="${SCENARIO_DATABASES[$scenario]}"
    record_state "SCENARIO_DATABASE run_id=$RUN_ID nonce=$RUN_NONCE index=$index_text scenario=$scenario database=$database"
  done < <(scenario_rows)
}

validate_inputs() {
  validate_static_inputs
  [[ "${MEMORYAI_AUTH_TEST_ALLOW:-}" == "I_UNDERSTAND_LOCAL_PG14" ]] || fail input 64 "explicit local test acknowledgement is required"
  case "${PGHOST:-}" in
    localhost|127.0.0.1|::1) ;;
    *) fail input 64 "PGHOST must be loopback" ;;
  esac
  command -v "$PSQL" >/dev/null || fail input 69 "psql is unavailable"
  command -v "$CREATEDB" >/dev/null || fail input 69 "createdb is unavailable"
  command -v "$DROPDB" >/dev/null || fail input 69 "dropdb is unavailable"
  command -v timeout >/dev/null || fail input 69 "timeout is unavailable"
}

validate_static_inputs() {
  local number count
  [[ -f "$MIGRATION_006" ]] || fail input 64 "006 migration is missing"
  [[ -z "${DATABASE_URL:-}" ]] || fail input 64 "DATABASE_URL is forbidden for the matrix"
  [[ -n "$PSQL" && -n "$CREATEDB" && -n "$DROPDB" ]] || fail input 64 "database command plan contains an empty command"
  [[ "${#DB_PREFIX}" -eq 23 ]] || fail input 64 "database prefix length contract changed"
  [[ "$MAX_DATABASE_NAME_LENGTH" -le 63 ]] || fail input 64 "database name length proof exceeds PostgreSQL limit"
  [[ "${#BEHAVIOR_CASES[@]}" -eq 33 ]] || fail input 64 "behavior boundary contract must contain 33 cases"
  validate_oracle_contracts
  for number in 001 002 003 004 005; do
    count="$(find "$MIGRATION_DIR" -maxdepth 1 -type f -name "${number}_*.sql" | wc -l | tr -d ' ')"
    [[ "$count" == "1" ]] || fail input 66 "expected exactly one migration for $number, got $count"
  done
}

validate_oracle_contracts() {
  local scenario category expected row row_scenario object error_category mode label outcome
  local rejection_count=0 behavior_count=0
  declare -A expected_rejections=() rejection_rows=() expected_behaviors=() behavior_rows=()

  while IFS=$'\t' read -r scenario category expected; do
    if [[ "$expected" == "EXPECTED_REJECTION" ]]; then
      expected_rejections[$scenario]=1
      rejection_count=$((rejection_count + 1))
    fi
  done < <(scenario_rows)
  [[ "$rejection_count" -eq 77 ]] || fail input 64 "scenario model must contain 77 rejection oracles"
  [[ "${#REJECTION_ORACLE_ROWS[@]}" -eq 77 ]] || fail input 64 "rejection oracle table must contain 77 rows"
  for row in "${REJECTION_ORACLE_ROWS[@]}"; do
    IFS=$'\t' read -r row_scenario object error_category mode <<<"$row"
    [[ -n "$row_scenario" && -n "$object" && -n "$error_category" ]] || fail input 64 "rejection oracle has an empty field"
    [[ -n "${expected_rejections[$row_scenario]:-}" ]] || fail input 64 "unexpected rejection oracle: $row_scenario"
    [[ -z "${rejection_rows[$row_scenario]:-}" ]] || fail input 64 "duplicate rejection oracle: $row_scenario"
    [[ "$mode" == "object_and_category" || "$mode" == "category_only" ]] || fail input 64 "invalid rejection oracle mode: $row_scenario"
    [[ "$mode" != "category_only" || "$row_scenario" == "lock_timeout" ]] || fail input 64 "only lock_timeout may use category-only ERROR matching"
    [[ "$mode" != "category_only" || "$object" == "-" ]] || fail input 64 "lock_timeout category-only oracle must not invent an object"
    rejection_rows[$row_scenario]=1
  done
  for scenario in "${!expected_rejections[@]}"; do
    [[ -n "${rejection_rows[$scenario]:-}" ]] || fail input 64 "missing rejection oracle: $scenario"
  done

  for label in "${BEHAVIOR_CASES[@]}"; do
    expected_behaviors[$label]=1
  done
  [[ "${#BEHAVIOR_ORACLE_ROWS[@]}" -eq 33 ]] || fail input 64 "behavior oracle table must contain 33 rows"
  for row in "${BEHAVIOR_ORACLE_ROWS[@]}"; do
    IFS=$'\t' read -r label outcome object error_category <<<"$row"
    [[ -n "${expected_behaviors[$label]:-}" ]] || fail input 64 "unexpected behavior oracle: $label"
    [[ -z "${behavior_rows[$label]:-}" ]] || fail input 64 "duplicate behavior oracle: $label"
    [[ "$outcome" == "PASS" || "$outcome" == "REJECT" ]] || fail input 64 "invalid behavior oracle outcome: $label"
    if [[ "$outcome" == "PASS" ]]; then
      [[ "$object" == "-" && "$error_category" == "-" ]] || fail input 64 "PASS behavior oracle must not define an ERROR: $label"
    else
      [[ "$object" != "-" && "$error_category" != "-" ]] || fail input 64 "REJECT behavior oracle is incomplete: $label"
    fi
    behavior_rows[$label]=1
    behavior_count=$((behavior_count + 1))
  done
  [[ "$behavior_count" -eq 33 ]] || fail input 64 "behavior oracle count changed"
  for label in "${!expected_behaviors[@]}"; do
    [[ -n "${behavior_rows[$label]:-}" ]] || fail input 64 "missing behavior oracle: $label"
  done
}

verify_postgresql_14() {
  local version
  version="$(admin_psql -At -c 'SHOW server_version_num;')"
  [[ "$version" =~ ^14[0-9]{4}$ ]] || fail version 65 "PostgreSQL 14 is required, got $version"
}

create_database() {
  local database="$1" rc
  validate_test_database_name "$database"
  set +e
  create_database_command "$database" >/dev/null
  rc=$?
  set -e
  [[ "$rc" -eq 0 ]] || fail createdb 84 "createdb rejected $database (possible atomic name collision)"
  CREATED_DATABASES+=("$database")
}

apply_fixture_001_005() {
  local database="$1" number file
  for number in 001 002 003 004 005; do
    file="$(find "$MIGRATION_DIR" -maxdepth 1 -type f -name "${number}_*.sql" -print -quit)"
    [[ -n "$file" ]] || fail fixture 66 "migration $number is missing"
    database_psql "$database" -f "$file" >/dev/null
  done
}

apply_006() {
  database_psql "$1" -f "$MIGRATION_006" >/dev/null
}

run_sql() {
  local database="$1" sql="$2"
  database_psql "$database" -c "$sql" >/dev/null
}

create_challenge_table() {
  local database="$1" challenge_definition="$2" table_constraint="${3:-}"
  run_sql "$database" "
    CREATE TABLE public.auth_verification_challenges (
      challenge_id ${challenge_definition},
      phone_hash CHARACTER(64) NOT NULL,
      code_digest CHARACTER(64) NOT NULL,
      purpose TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      resend_after TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      consumed_at TIMESTAMPTZ,
      request_ip_hash CHARACTER(64) NOT NULL,
      provider_request_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      ${table_constraint}
    );"
}

catalog_snapshot() {
  local database="$1" destination="$2"
  database_psql "$database" -At -c "
    SELECT 'constraint|' || c.conname || '|' || c.conrelid::regclass::text || '|' || c.contype || '|' ||
      c.convalidated || '|' || c.connoinherit || '|' || COALESCE(c.conkey::text, '') || '|' ||
      COALESCE(pg_catalog.pg_get_expr(c.conbin, c.conrelid), '')
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::regnamespace
      AND (c.conrelid = 'public.auth_verification_challenges'::regclass OR c.conname LIKE 'ck_auth_challenge_%')
    UNION ALL
    SELECT 'index|' || index_class.relname || '|' || index_catalog.indrelid::regclass::text || '|' ||
      index_catalog.indisunique || '|' || index_catalog.indisvalid || '|' || index_catalog.indisready || '|' ||
      index_catalog.indislive || '|' || pg_catalog.pg_get_indexdef(index_class.oid)
    FROM pg_catalog.pg_index index_catalog
    JOIN pg_catalog.pg_class index_class ON index_class.oid = index_catalog.indexrelid
    WHERE index_class.relnamespace = 'public'::regnamespace
      AND (index_catalog.indrelid = 'public.auth_verification_challenges'::regclass OR index_class.relname LIKE 'idx_auth_challenges_%')
    ORDER BY 1;" >"$destination"
}

rejection_contract() {
  local scenario="$1" row row_scenario object category mode matches=0 result=""
  for row in "${REJECTION_ORACLE_ROWS[@]}"; do
    IFS=$'\t' read -r row_scenario object category mode <<<"$row"
    if [[ "$row_scenario" == "$scenario" ]]; then
      matches=$((matches + 1))
      result="$object"$'\t'"$category"$'\t'"$mode"
    fi
  done
  [[ "$matches" -eq 1 ]] || return 1
  printf '%s\n' "$result"
}

run_external_timeout() {
  local timeout_seconds="$1"
  shift
  timeout --signal=TERM --kill-after=1 "$timeout_seconds" "$@"
}

run_006_command() {
  local database="$1" stdout_file="$2" stderr_file="$3" timeout_seconds="$4"
  validate_test_database_name "$database"
  if [[ "$timeout_seconds" -gt 0 ]]; then
    LC_ALL=C run_external_timeout "$timeout_seconds" \
      "$PSQL" -X --no-psqlrc --quiet -v ON_ERROR_STOP=1 -v VERBOSITY=terse -d "$database" \
      >"$stdout_file" 2>"$stderr_file" <"$MIGRATION_006"
  else
    LC_ALL=C psql_command -X --no-psqlrc --quiet -v ON_ERROR_STOP=1 -v VERBOSITY=terse -d "$database" \
      >"$stdout_file" 2>"$stderr_file" <"$MIGRATION_006"
  fi
}

expect_006_rejection() {
  local database="$1" scenario="$2" timeout_seconds="${3:-0}" contract expected_object expected_category oracle_mode stderr_file stdout_file rc error_record
  local -a error_records=()
  contract="$(rejection_contract "$scenario")" || fail contract 78 "missing rejection contract for $scenario"
  IFS=$'\t' read -r expected_object expected_category oracle_mode <<<"$contract"
  stderr_file="$WORK_DIR/${scenario}.stderr"
  stdout_file="$WORK_DIR/${scenario}.stdout"
  CURRENT_REJECTION_ORACLE="$scenario"
  set +e
  run_006_command "$database" "$stdout_file" "$stderr_file" "$timeout_seconds"
  rc=$?
  set -e
  CURRENT_REJECTION_ORACLE=""
  [[ "$rc" -ne 0 ]] || fail unexpected_success 70 "$scenario unexpectedly succeeded"
  [[ "$rc" -ne 124 && "$rc" -ne 137 ]] || fail external_timeout 79 "$scenario exceeded the external timeout"
  if grep -Eiq 'psql:[[:space:]]*error:|fixture|permission denied|could not connect|connection (to server )?failed|no such file|could not (open|read)|syntax error' "$stderr_file"; then
    fail unrelated_error 71 "$scenario stderr contains an unrelated infrastructure error"
  fi
  mapfile -t error_records < <(grep -E '^ERROR:[[:space:]]' "$stderr_file" || true)
  [[ "${#error_records[@]}" -eq 1 ]] || fail error_record_count 71 "$scenario produced ${#error_records[@]} ERROR records"
  error_record="${error_records[0]}"
  case "$oracle_mode" in
    object_and_category)
      [[ "$error_record" == *"$expected_object"* ]] || fail object_mismatch 71 "$scenario ERROR did not identify $expected_object" ;;
    category_only)
      [[ "$expected_object" == "-" ]] || fail contract 78 "$scenario category-only oracle has an object" ;;
    *) fail contract 78 "$scenario has unsupported ERROR oracle mode $oracle_mode" ;;
  esac
  [[ "$error_record" == *"$expected_category"* ]] || fail category_mismatch 71 "$scenario ERROR did not contain category: $expected_category"
}

prepare_challenge_scenario() {
  local database="$1" scenario="$2"
  case "$scenario" in
    challenge_id_type)
      create_challenge_table "$database" "TEXT NOT NULL DEFAULT pg_catalog.gen_random_uuid()::TEXT PRIMARY KEY" ;;
    challenge_id_nullable)
      create_challenge_table "$database" "UUID DEFAULT pg_catalog.gen_random_uuid()" ;;
    challenge_id_missing_default)
      create_challenge_table "$database" "UUID NOT NULL PRIMARY KEY" ;;
    challenge_id_wrong_default)
      create_challenge_table "$database" "UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::UUID PRIMARY KEY" ;;
    challenge_id_missing_primary_key)
      create_challenge_table "$database" "UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid()" ;;
    challenge_id_composite_primary_key)
      create_challenge_table "$database" "UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid()" ", PRIMARY KEY (challenge_id, phone_hash)" ;;
  esac
}

prepare_check_scenario() {
  local database="$1" scenario="$2" constraint variant expression suffix=""
  constraint="${scenario%%__*}"
  variant="${scenario##*__}"
  expression="${CHECK_EXPRESSIONS[$constraint]}"
  apply_006 "$database"
  case "$variant" in
    wrong_relation)
      run_sql "$database" "ALTER TABLE public.auth_verification_challenges DROP CONSTRAINT ${constraint}; CREATE TABLE public.auth_challenge_shadow (LIKE public.auth_verification_challenges); ALTER TABLE public.auth_challenge_shadow ADD CONSTRAINT ${constraint} CHECK (${expression});" ;;
    duplicate_name)
      run_sql "$database" "CREATE TABLE public.auth_challenge_shadow (LIKE public.auth_verification_challenges); ALTER TABLE public.auth_challenge_shadow ADD CONSTRAINT ${constraint} CHECK (${expression});" ;;
    wrong_conkey)
      run_sql "$database" "ALTER TABLE public.auth_verification_challenges DROP CONSTRAINT ${constraint}; ALTER TABLE public.auth_verification_challenges ADD CONSTRAINT ${constraint} CHECK ((${expression}) AND challenge_id IS NOT NULL);" ;;
    not_valid) suffix=" NOT VALID" ;;
    no_inherit) suffix=" NO INHERIT" ;;
    wrong_expression) expression="(${expression}) AND false" ;;
  esac
  if [[ -n "$suffix" || "$variant" == "wrong_expression" ]]; then
    run_sql "$database" "ALTER TABLE public.auth_verification_challenges DROP CONSTRAINT ${constraint}; ALTER TABLE public.auth_verification_challenges ADD CONSTRAINT ${constraint} CHECK (${expression})${suffix};"
  fi
}

prepare_index_scenario() {
  local database="$1" scenario="$2" index variant columns replacement
  index="${scenario%%__*}"
  variant="${scenario##*__}"
  columns="${INDEX_COLUMNS[$index]}"
  apply_006 "$database"
  run_sql "$database" "DROP INDEX public.${index};"
  case "$variant" in
    wrong_relation)
      replacement="CREATE TABLE public.auth_challenge_shadow (LIKE public.auth_verification_challenges); CREATE INDEX ${index} ON public.auth_challenge_shadow (${columns});" ;;
    wrong_key) replacement="CREATE INDEX ${index} ON public.auth_verification_challenges (purpose);" ;;
    wrong_sort)
      if [[ "$index" == "idx_auth_challenges_expires_at" ]]; then
        replacement="CREATE INDEX ${index} ON public.auth_verification_challenges (expires_at DESC);"
      else
        replacement="CREATE INDEX ${index} ON public.auth_verification_challenges (${columns/DESC/ASC});"
      fi ;;
    unique) replacement="CREATE UNIQUE INDEX ${index} ON public.auth_verification_challenges (${columns});" ;;
    access_method) replacement="CREATE INDEX ${index} ON public.auth_verification_challenges USING hash (${columns%%,*});" ;;
    predicate) replacement="CREATE INDEX ${index} ON public.auth_verification_challenges (${columns}) WHERE consumed_at IS NULL;" ;;
    expression) replacement="CREATE INDEX ${index} ON public.auth_verification_challenges ((lower(purpose)));" ;;
  esac
  run_sql "$database" "$replacement"
}

prepare_rollback_scenario() {
  local database="$1"
  create_challenge_table "$database" "UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid() PRIMARY KEY"
  run_sql "$database" "CREATE TABLE public.auth_challenge_shadow (LIKE public.auth_verification_challenges); ALTER TABLE public.auth_challenge_shadow ADD CONSTRAINT ck_auth_challenge_provider_request_id CHECK (provider_request_id IS NULL OR char_length(provider_request_id) >= 1);"
}

run_negative_scenario() {
  local scenario="$1" category="$2" database before after
  database="$(database_for_scenario "$scenario")"
  CURRENT_STAGE="${scenario}_create"
  record_state "SCENARIO_STARTED $scenario $category"
  create_database "$database"
  apply_fixture_001_005 "$database"

  case "$category" in
    challenge_id) prepare_challenge_scenario "$database" "$scenario" ;;
    check_constraint) prepare_check_scenario "$database" "$scenario" ;;
    index) prepare_index_scenario "$database" "$scenario" ;;
    atomicity) prepare_rollback_scenario "$database" ;;
  esac

  before="$WORK_DIR/${scenario}.before"
  after="$WORK_DIR/${scenario}.after"
  catalog_snapshot "$database" "$before"
  CURRENT_STAGE="${scenario}_006"
  expect_006_rejection "$database" "$scenario"
  catalog_snapshot "$database" "$after"
  cmp -s "$before" "$after" || fail catalog_drift 72 "$scenario changed the catalog despite rejection"
  record_state "EXPECTED_REJECTION_PASS $scenario"
  if cleanup_or_fail "$database"; then :; else return 75; fi
}

run_lock_timeout_scenario() {
  local scenario="lock_timeout" database before after holder application_name granted="0" connections="" poll start_ms end_ms elapsed_ms external_timeout=8
  database="$(database_for_scenario "$scenario")"
  application_name="memoryai_auth_matrix_lock_${RUN_NONCE}"
  record_state "SCENARIO_STARTED $scenario locking"
  create_database "$database"
  apply_fixture_001_005 "$database"
  apply_006 "$database"
  before="$WORK_DIR/${scenario}.before"
  after="$WORK_DIR/${scenario}.after"
  catalog_snapshot "$database" "$before"
  PGAPPNAME="$application_name" database_psql "$database" -c \
    "BEGIN; LOCK TABLE public.auth_verification_challenges IN ACCESS EXCLUSIVE MODE; SELECT pg_catalog.pg_sleep(30);" \
    >/dev/null 2>&1 &
  holder=$!

  for poll in {1..50}; do
    granted="$(database_psql "$database" -At -v "lock_app=$application_name" -c \
      "SELECT count(*) FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid WHERE a.application_name=:'lock_app' AND l.relation='public.auth_verification_challenges'::regclass AND l.mode='AccessExclusiveLock' AND l.granted;")"
    [[ "$granted" == "1" ]] && break
    sleep 0.1
  done
  [[ "$granted" == "1" ]] || fail lock_handshake 80 "holder did not acquire ACCESS EXCLUSIVE within 5 seconds"
  record_state "LOCK_GRANTED $scenario application_name=$application_name"

  start_ms="$(date +%s%3N)"
  expect_006_rejection "$database" "$scenario" "$external_timeout"
  end_ms="$(date +%s%3N)"
  elapsed_ms=$((end_ms - start_ms))
  [[ "$elapsed_ms" -ge 1500 && "$elapsed_ms" -le 6000 ]] || fail lock_elapsed 81 "lock timeout elapsed ${elapsed_ms}ms outside 1500-6000ms"

  kill "$holder" 2>/dev/null || true
  wait "$holder" 2>/dev/null || true
  for poll in {1..50}; do
    connections="$(database_psql "$database" -At -v "lock_app=$application_name" -c \
      "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name=:'lock_app';")"
    [[ "$connections" == "0" ]] && break
    sleep 0.1
  done
  [[ "$connections" == "0" ]] || fail lock_holder_cleanup 82 "holder connection remained after termination"
  catalog_snapshot "$database" "$after"
  cmp -s "$before" "$after" || fail catalog_drift 72 "$scenario changed the catalog"
  record_state "EXPECTED_REJECTION_PASS $scenario elapsed_ms=$elapsed_ms"
  if cleanup_or_fail "$database"; then :; else return 75; fi
}

behavior_contract() {
  local label="$1" row row_label outcome object category matches=0 result=""
  for row in "${BEHAVIOR_ORACLE_ROWS[@]}"; do
    IFS=$'\t' read -r row_label outcome object category <<<"$row"
    if [[ "$row_label" == "$label" ]]; then
      matches=$((matches + 1))
      result="$outcome"$'\t'"$object"$'\t'"$category"
    fi
  done
  [[ "$matches" -eq 1 ]] || return 1
  printf '%s\n' "$result"
}

expect_behavior_rejection() {
  local database="$1" label="$2" sql="$3" contract outcome expected_object expected_category
  local stderr_file="$WORK_DIR/behavior_${label}.stderr" stdout_file="$WORK_DIR/behavior_${label}.stdout" rc error_record
  local -a error_records=()
  contract="$(behavior_contract "$label")" || fail behavior_contract 78 "missing behavior contract for $label"
  IFS=$'\t' read -r outcome expected_object expected_category <<<"$contract"
  [[ "$outcome" == "REJECT" ]] || fail behavior_contract 78 "$label is not a rejection oracle"
  CURRENT_BEHAVIOR_ORACLE="$label"
  set +e
  database_psql "$database" --quiet -v VERBOSITY=terse -c "$sql" >"$stdout_file" 2>"$stderr_file"
  rc=$?
  set -e
  CURRENT_BEHAVIOR_ORACLE=""
  [[ "$rc" -ne 0 ]] || fail behavior 73 "$label unexpectedly accepted invalid data"
  if grep -Eiq 'psql:[[:space:]]*error:|fixture|permission denied|could not connect|connection (to server )?failed|no such file|could not (open|read)|syntax error' "$stderr_file"; then
    fail behavior 73 "$label returned an infrastructure error"
  fi
  mapfile -t error_records < <(grep -E '^ERROR:[[:space:]]' "$stderr_file" || true)
  [[ "${#error_records[@]}" -eq 1 ]] || fail behavior 73 "$label produced ${#error_records[@]} ERROR records"
  error_record="${error_records[0]}"
  [[ "$error_record" == *"$expected_object"* ]] || fail behavior 73 "$label ERROR did not identify $expected_object"
  [[ "$error_record" == *"$expected_category"* ]] || fail behavior 73 "$label ERROR did not contain category: $expected_category"
  record_state "BEHAVIOR_CASE_PASS $label rejection=$expected_object category=$expected_category"
}

run_behavior_insert() {
  local database="$1" label="$2" caller_expectation="$3" phone="$4" code="$5" purpose="$6"
  local created="$7" resend="$8" expires="$9" attempts="${10}" max_attempts="${11}"
  local consumed="${12}" ip="${13}" provider="${14}" sql contract outcome expected_object expected_category
  contract="$(behavior_contract "$label")" || fail behavior_contract 78 "missing behavior contract for $label"
  IFS=$'\t' read -r outcome expected_object expected_category <<<"$contract"
  if [[ "$caller_expectation" == "PASS" ]]; then
    [[ "$outcome" == "PASS" ]] || fail behavior_contract 78 "$label caller/oracle outcome mismatch"
  else
    [[ "$outcome" == "REJECT" && "$caller_expectation" == "$expected_object" ]] || \
      fail behavior_contract 78 "$label caller/oracle rejection mismatch"
  fi
  sql="INSERT INTO public.auth_verification_challenges (
    phone_hash,code_digest,purpose,created_at,updated_at,resend_after,expires_at,
    attempts,max_attempts,consumed_at,request_ip_hash,provider_request_id
  ) VALUES (${phone},${code},${purpose},${created},${created},${resend},${expires},
    ${attempts},${max_attempts},${consumed},${ip},${provider});"
  if [[ "$outcome" == "PASS" ]]; then
    CURRENT_BEHAVIOR_ORACLE="$label"
    database_psql "$database" -c "$sql" >/dev/null
    CURRENT_BEHAVIOR_ORACLE=""
    record_state "BEHAVIOR_CASE_PASS $label accepted"
  else
    expect_behavior_rejection "$database" "$label" "$sql"
  fi
}

run_hash_behavior_cases() {
  local database="$1" field="$2" constraint="$3" phone="repeat('a',64)" code="repeat('b',64)" ip="repeat('c',64)"
  local value label expectation
  for label in len63 len64 len65 nonhex uppercase; do
    case "$label" in
      len63) value="repeat('a',63)"; expectation="$constraint" ;;
      len64) value="repeat('a',64)"; expectation="PASS" ;;
      len65) value="repeat('a',65)"; expectation="character(64)" ;;
      nonhex) value="repeat('g',64)"; expectation="$constraint" ;;
      uppercase) value="repeat('A',64)"; expectation="$constraint" ;;
    esac
    case "$field" in
      phone_hash) phone="$value"; code="repeat('b',64)"; ip="repeat('c',64)" ;;
      code_digest) phone="repeat('a',64)"; code="$value"; ip="repeat('c',64)" ;;
      request_ip_hash) phone="repeat('a',64)"; code="repeat('b',64)"; ip="$value" ;;
    esac
    run_behavior_insert "$database" "${field}_${label}" "$expectation" "$phone" "$code" "'sign_in'" \
      "TIMESTAMPTZ '2026-01-01 00:00:00+00'" "TIMESTAMPTZ '2026-01-01 00:01:00+00'" "TIMESTAMPTZ '2026-01-01 00:05:00+00'" \
      0 5 NULL "$ip" NULL
  done
}

run_behavior_scenario() {
  local scenario="constraint_behavior" database
  local created="TIMESTAMPTZ '2026-01-01 00:00:00+00'" resend="TIMESTAMPTZ '2026-01-01 00:01:00+00'" expires="TIMESTAMPTZ '2026-01-01 00:05:00+00'"
  local phone="repeat('a',64)" code="repeat('b',64)" ip="repeat('c',64)"
  database="$(database_for_scenario "$scenario")"
  record_state "SCENARIO_STARTED $scenario behavior"
  create_database "$database"
  apply_fixture_001_005 "$database"
  apply_006 "$database"
  run_hash_behavior_cases "$database" phone_hash ck_auth_challenge_phone_hash
  run_hash_behavior_cases "$database" code_digest ck_auth_challenge_code_digest
  run_hash_behavior_cases "$database" request_ip_hash ck_auth_challenge_ip_hash

  run_behavior_insert "$database" purpose_sign_in PASS "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 0 5 NULL "$ip" NULL
  run_behavior_insert "$database" purpose_other ck_auth_challenge_purpose "$phone" "$code" "'other'" "$created" "$resend" "$expires" 0 5 NULL "$ip" NULL

  run_behavior_insert "$database" attempts_negative ck_auth_challenge_attempts "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" -1 5 NULL "$ip" NULL
  run_behavior_insert "$database" max_attempts_zero ck_auth_challenge_attempts "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 0 0 NULL "$ip" NULL
  run_behavior_insert "$database" attempts_over_max ck_auth_challenge_attempts "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 6 5 NULL "$ip" NULL
  run_behavior_insert "$database" attempts_zero PASS "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 0 5 NULL "$ip" NULL
  run_behavior_insert "$database" attempts_equal_max PASS "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 5 5 NULL "$ip" NULL

  run_behavior_insert "$database" timing_resend_equal_created ck_auth_challenge_timing "$phone" "$code" "'sign_in'" "$created" "$created" "$expires" 0 5 NULL "$ip" NULL
  run_behavior_insert "$database" timing_expires_equal_resend ck_auth_challenge_timing "$phone" "$code" "'sign_in'" "$created" "$resend" "$resend" 0 5 NULL "$ip" NULL
  run_behavior_insert "$database" timing_strictly_increasing PASS "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 0 5 NULL "$ip" NULL

  run_behavior_insert "$database" consumed_null PASS "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 0 5 NULL "$ip" NULL
  run_behavior_insert "$database" consumed_equal_created PASS "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 0 5 "$created" "$ip" NULL
  run_behavior_insert "$database" consumed_before_created ck_auth_challenge_consumed_at "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 0 5 "TIMESTAMPTZ '2025-12-31 23:59:59+00'" "$ip" NULL

  run_behavior_insert "$database" provider_null PASS "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 0 5 NULL "$ip" NULL
  run_behavior_insert "$database" provider_len1 PASS "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 0 5 NULL "$ip" "'x'"
  run_behavior_insert "$database" provider_len128 PASS "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 0 5 NULL "$ip" "repeat('x',128)"
  run_behavior_insert "$database" provider_empty ck_auth_challenge_provider_request_id "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 0 5 NULL "$ip" "''"
  run_behavior_insert "$database" provider_len129 ck_auth_challenge_provider_request_id "$phone" "$code" "'sign_in'" "$created" "$resend" "$expires" 0 5 NULL "$ip" "repeat('x',129)"
  record_state "BEHAVIOR_PASS $scenario"
  if cleanup_or_fail "$database"; then :; else return 75; fi
}

run_final_catalog_scenario() {
  local scenario="final_catalog" database
  database="$(database_for_scenario "$scenario")"
  record_state "SCENARIO_STARTED $scenario catalog"
  create_database "$database"
  apply_fixture_001_005 "$database"
  apply_006 "$database"
  apply_006 "$database"
  database_psql "$database" -c "
    DO \$\$
    DECLARE check_count INTEGER; index_count INTEGER;
    BEGIN
      SELECT count(*) INTO check_count
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = 'public.auth_verification_challenges'::regclass
        AND c.conname IN (
          'ck_auth_challenge_phone_hash','ck_auth_challenge_code_digest',
          'ck_auth_challenge_ip_hash','ck_auth_challenge_purpose',
          'ck_auth_challenge_attempts','ck_auth_challenge_timing',
          'ck_auth_challenge_consumed_at','ck_auth_challenge_provider_request_id'
        )
        AND c.contype = 'c' AND c.convalidated AND NOT c.connoinherit
        AND NOT c.condeferrable AND NOT c.condeferred;
      IF check_count <> 8 THEN RAISE EXCEPTION 'final CHECK hard gate failed: %', check_count; END IF;

      SELECT count(*) INTO index_count
      FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_catalog.pg_am am ON am.oid = ic.relam
      WHERE i.indrelid = 'public.auth_verification_challenges'::regclass
        AND ic.relname IN ('idx_auth_challenges_phone_created','idx_auth_challenges_ip_created','idx_auth_challenges_expires_at')
        AND am.amname = 'btree' AND NOT i.indisprimary AND NOT i.indisunique
        AND i.indisvalid AND i.indisready AND i.indislive
        AND i.indpred IS NULL AND i.indexprs IS NULL;
      IF index_count <> 3 THEN RAISE EXCEPTION 'final index hard gate failed: %', index_count; END IF;
    END
    \$\$;" >/dev/null
  record_state "FINAL_CATALOG_PASS $scenario"
  if cleanup_or_fail "$database"; then :; else return 75; fi
}

dry_run() {
  local scenario category expected database contract expected_object expected_category oracle_mode
  validate_static_inputs
  validate_all_database_names
  while IFS=$'\t' read -r scenario category expected; do
    database="${SCENARIO_DATABASES[$scenario]}"
    validate_test_database_name "$database"
    if contract="$(rejection_contract "$scenario" 2>/dev/null)"; then
      IFS=$'\t' read -r expected_object expected_category oracle_mode <<<"$contract"
    else
      expected_object="-"
      expected_category="$expected"
    fi
    printf 'PLAN\t%s\t%s\t%s\tdatabase:%s\tfixture:001-005\texpected_object:%s\texpected_category:%s\tcleanup:terminate,connections=0,dropdb,exists=0\n' \
      "$scenario" "$category" "$expected" "$database" "$expected_object" "$expected_category"
  done < <(scenario_rows)
}

list_scenarios() {
  local scenario category expected database contract expected_object expected_category oracle_mode
  validate_all_database_names
  while IFS=$'\t' read -r scenario category expected; do
    database="${SCENARIO_DATABASES[$scenario]}"
    if contract="$(rejection_contract "$scenario" 2>/dev/null)"; then
      IFS=$'\t' read -r expected_object expected_category oracle_mode <<<"$contract"
    else
      expected_object="-"
      expected_category="$expected"
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$scenario" "$category" "$expected" "$database" "$expected_object" "$expected_category"
  done < <(scenario_rows)
}

run_matrix() {
  validate_static_inputs
  validate_all_database_names
  validate_inputs
  initialize_runtime
  RUN_ACTIVE=1
  record_state "STARTED run_id=$RUN_ID"
  record_database_mappings
  printf 'STATE_FILE=%s\n' "$STATE_FILE"
  verify_postgresql_14
  assert_all_database_names_absent
  assert_no_residual_databases || fail preexisting 74 "current nonce already has residual databases"

  dispatch_all_scenarios
}

dispatch_all_scenarios() {
  local scenario category expected
  while IFS=$'\t' read -r scenario category expected; do
    CURRENT_STAGE="$scenario"
    case "$scenario" in
      lock_timeout) run_lock_timeout_scenario ;;
      transaction_rollback) run_negative_scenario "$scenario" "$category" ;;
      constraint_behavior) run_behavior_scenario ;;
      final_catalog) run_final_catalog_scenario ;;
      *) run_negative_scenario "$scenario" "$category" ;;
    esac
  done < <(selected_scenarios)
}

reject_legacy_test_controls() {
  local variable
  [[ -z "$CALLER_RUN_NONCE_PRESENT" ]] || fail input 64 "caller-provided RUN_NONCE is forbidden"
  for variable in \
    MATRIX_TEST_MODE MATRIX_ONLY_SCENARIO MATRIX_TEST_LOCK_EXTERNAL_TIMEOUT \
    MATRIX_TEST_ROOT MATRIX_TEST_ALLOW_WINDOWS_ACL MATRIX_WORK_DIR MATRIX_STATE_FILE \
    MATRIX_NONCE MATRIX_TEST_NONCE MATRIX_NONCE_GENERATOR; do
    [[ -z "${!variable+x}" ]] || fail input 64 "legacy test control is forbidden: $variable"
  done
}

usage() {
  printf 'Usage: %s [--list|--dry-run]\n' "${0##*/}"
}

main() {
  install_runtime_traps
  reject_legacy_test_controls
  configure_run_identity
  validate_oracle_contracts
  case "${1:-}" in
    --list) MODE="list"; list_scenarios ;;
    --dry-run) MODE="dry-run"; dry_run ;;
    "") run_matrix ;;
    *) usage >&2; return 64 ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
