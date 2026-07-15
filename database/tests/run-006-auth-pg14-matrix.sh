#!/usr/bin/env bash
set -Eeuo pipefail
export TZ=UTC

readonly DB_PREFIX="memoryai_auth_negative_"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DATABASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly MIGRATION_DIR="$DATABASE_DIR/migrations"
readonly MIGRATION_006="$MIGRATION_DIR/006_auth_verification_challenges.sql"
readonly PSQL="${PSQL:-psql}"
readonly CREATEDB="${CREATEDB:-createdb}"
readonly DROPDB="${DROPDB:-dropdb}"
readonly ADMIN_DB="${MEMORYAI_AUTH_TEST_ADMIN_DB:-postgres}"
readonly RUN_ID="${MATRIX_RUN_ID:-$(date -u +%Y%m%d%H%M%S)_$$_${RANDOM}}"
readonly RUN8="$(printf '%s' "$RUN_ID" | sha256sum | cut -c1-8)"
readonly RUN_DB_PREFIX="${DB_PREFIX}${RUN8}_"
readonly MAX_DATABASE_NAME_LENGTH=52

MODE="run"
CURRENT_STAGE="startup"
RUN_ACTIVE=0
RUNTIME_READY=0
WORK_DIR_CREATED=0
CLEANUP_RECORDED=0
FAILED_RECORDED=0
WORK_DIR=""
STATE_FILE=""
declare -a CREATED_DATABASES=()
declare -A SCENARIO_DATABASES=()
HASH8_RESULT=""
DERIVED_DATABASE=""

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
  [[ "$database" == "$RUN_DB_PREFIX"* ]] || fail input 64 "database is outside current RUN_ID: $database"
  [[ "${#database}" -le 63 ]] || fail input 64 "database name is longer than 63 bytes: $database"
  ! is_protected_database "$database" || fail input 64 "protected database target rejected: $database"
}

admin_psql() {
  "$PSQL" -X --no-psqlrc -v ON_ERROR_STOP=1 -d "$ADMIN_DB" "$@"
}

database_psql() {
  local database="$1"
  shift
  validate_test_database_name "$database"
  "$PSQL" -X --no-psqlrc -v ON_ERROR_STOP=1 -d "$database" "$@"
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
  "$DROPDB" --if-exists --force "$database" >/dev/null
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

assert_no_residual_databases() {
  local count
  count="$(admin_psql -At -v "matrix_prefix=${RUN_DB_PREFIX}%" -c \
    "SELECT count(*) FROM pg_catalog.pg_database WHERE datname LIKE :'matrix_prefix';")"
  [[ "$count" == "0" ]] || return 1
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
  [[ "$mode" == "700" ]] || test_windows_acl_exception "$mode" "755"
}

test_windows_acl_exception() {
  local actual="$1" windows_mode="$2"
  [[ "${MATRIX_TEST_MODE:-0}" == "1" && "${MATRIX_TEST_ALLOW_WINDOWS_ACL:-0}" == "1" ]] || return 1
  [[ "$(uname -s)" == MINGW* && "$actual" == "$windows_mode" ]]
}

initialize_runtime() {
  local runtime_parent state_parent required_owner runtime_mode state_mode
  if [[ "${MATRIX_TEST_MODE:-0}" == "1" ]]; then
    [[ -n "${MATRIX_TEST_ROOT:-}" ]] || fail runtime 76 "MATRIX_TEST_ROOT is required in test mode"
    runtime_parent="$MATRIX_TEST_ROOT"
    state_parent="$MATRIX_TEST_ROOT"
    required_owner="$(id -u)"
    validate_secure_directory "$runtime_parent" "$required_owner" || fail runtime 76 "unsafe MATRIX_TEST_ROOT"
  else
    [[ "$(id -u)" == "0" ]] || fail runtime 76 "matrix runtime must execute as root"
    runtime_parent="/var/tmp"
    state_parent="/var/log/memoryai"
    required_owner="0"
    [[ -d "$runtime_parent" && ! -L "$runtime_parent" && "$(stat -c '%u' "$runtime_parent")" == "0" ]] || fail runtime 76 "unsafe /var/tmp"
    [[ -d "$state_parent" && ! -L "$state_parent" && "$(stat -c '%u' "$state_parent")" == "0" ]] || fail runtime 76 "unsafe /var/log/memoryai"
    runtime_mode="$(stat -c '%a' "$runtime_parent")"
    [[ "$runtime_mode" == "1777" ]] || fail runtime 76 "/var/tmp must be root-owned mode 1777"
    state_mode="$(stat -c '%a' "$state_parent")"
    (( (8#$state_mode & 0022) == 0 )) || fail runtime 76 "/var/log/memoryai must not be group/world writable"
  fi

  WORK_DIR="$(mktemp -d "$runtime_parent/memoryai-auth-pg14-matrix.${RUN8}.XXXXXXXX")" || fail runtime 76 "cannot create work directory"
  WORK_DIR_CREATED=1
  chmod 700 "$WORK_DIR" || fail runtime 76 "cannot protect work directory"
  validate_secure_directory "$WORK_DIR" "$required_owner" || fail runtime 76 "work directory validation failed"

  STATE_FILE="$(mktemp "$state_parent/memoryai-auth-pg14-matrix.${RUN8}.state.XXXXXXXX")" || fail runtime 76 "cannot create state file"
  chmod 600 "$STATE_FILE" || fail runtime 76 "cannot protect state file"
  [[ -f "$STATE_FILE" && ! -L "$STATE_FILE" ]] || fail runtime 76 "state file is not a regular file"
  [[ "$(stat -c '%u' "$STATE_FILE")" == "$required_owner" ]] || fail runtime 76 "state file owner is unsafe"
  [[ "$(stat -c '%a' "$STATE_FILE")" == "600" ]] || test_windows_acl_exception "$(stat -c '%a' "$STATE_FILE")" "644" || fail runtime 76 "state file mode is unsafe"
  [[ "$STATE_FILE" != "$WORK_DIR"/* ]] || fail runtime 76 "state file must not be inside work directory"
  RUNTIME_READY=1
}

remove_work_directory() {
  local expected_parent
  [[ "$WORK_DIR_CREATED" -eq 1 ]] || return 0
  [[ -n "$WORK_DIR" && -d "$WORK_DIR" && ! -L "$WORK_DIR" ]] || return 1
  [[ "${WORK_DIR##*/}" == "memoryai-auth-pg14-matrix.${RUN8}."* ]] || return 1
  if [[ "${MATRIX_TEST_MODE:-0}" == "1" ]]; then
    expected_parent="$(cd "$MATRIX_TEST_ROOT" && pwd -P)"
  else
    expected_parent="/var/tmp"
  fi
  [[ "$(cd "$(dirname "$WORK_DIR")" && pwd -P)" == "$expected_parent" ]] || return 1
  [[ "$(stat -c '%u' "$WORK_DIR")" == "$(id -u)" ]] || return 1
  [[ "$(stat -c '%a' "$WORK_DIR")" == "700" ]] || test_windows_acl_exception "$(stat -c '%a' "$WORK_DIR")" "755" || return 1
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
    fi
    if ! remove_work_directory; then
      cleanup_rc=1
      record_state "FAILED_cleanup_workdir_1 original_rc=$original_rc"
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

trap 'on_exit $?' EXIT
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM

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

selected_scenarios() {
  if [[ -n "${MATRIX_ONLY_SCENARIO:-}" ]]; then
    [[ "${MATRIX_TEST_MODE:-0}" == "1" ]] || fail input 64 "MATRIX_ONLY_SCENARIO is test-only"
    scenario_exists "$MATRIX_ONLY_SCENARIO" || fail input 64 "unknown MATRIX_ONLY_SCENARIO: $MATRIX_ONLY_SCENARIO"
    scenario_rows | awk -F '\t' -v wanted="$MATRIX_ONLY_SCENARIO" '$1 == wanted'
  else
    scenario_rows
  fi
}

database_for_scenario() {
  local scenario="$1"
  [[ -n "${SCENARIO_DATABASES[$scenario]:-}" ]] || return 1
  printf '%s' "${SCENARIO_DATABASES[$scenario]}"
}

hash8_string() {
  local input="$1" hash=2166136261 byte index
  LC_ALL=C
  for ((index = 0; index < ${#input}; index++)); do
    printf -v byte '%d' "'${input:index:1}"
    hash=$(( ((hash ^ byte) * 16777619) & 0xffffffff ))
  done
  printf -v HASH8_RESULT '%08x' "$hash"
}

derive_database_for_scenario() {
  local scenario="$1" index="$2" slug hash database
  [[ "$scenario" =~ ^[a-z0-9_]+$ ]] || return 1
  slug="${scenario:0:8}"
  hash8_string "$scenario"
  hash="$HASH8_RESULT"
  database="${RUN_DB_PREFIX}${index}_${slug}_${hash}"
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
  local scenario category expected database
  while IFS=$'\t' read -r scenario category expected; do
    database="${SCENARIO_DATABASES[$scenario]}"
    record_state "SCENARIO_DATABASE $scenario $database"
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
  for number in 001 002 003 004 005; do
    count="$(find "$MIGRATION_DIR" -maxdepth 1 -type f -name "${number}_*.sql" | wc -l | tr -d ' ')"
    [[ "$count" == "1" ]] || fail input 66 "expected exactly one migration for $number, got $count"
  done
}

verify_postgresql_14() {
  local version
  version="$(admin_psql -At -c 'SHOW server_version_num;')"
  [[ "$version" =~ ^14[0-9]{4}$ ]] || fail version 65 "PostgreSQL 14 is required, got $version"
}

create_database() {
  local database="$1"
  validate_test_database_name "$database"
  "$CREATEDB" --template=template0 "$database" >/dev/null
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
  local scenario="$1" object category
  case "$scenario" in
    challenge_id_type) object="challenge_id"; category="atttypid must be uuid" ;;
    challenge_id_nullable) object="challenge_id"; category="attnotnull must be true" ;;
    challenge_id_missing_default) object="challenge_id"; category="default is missing" ;;
    challenge_id_wrong_default) object="challenge_id"; category="default must directly call pg_catalog.gen_random_uuid()" ;;
    challenge_id_missing_primary_key) object="challenge_id"; category="primary key count must be 1" ;;
    challenge_id_composite_primary_key) object="challenge_id"; category="primary key conkey must contain challenge_id only" ;;
    ck_*__wrong_relation) object="${scenario%%__*}"; category="has wrong relation" ;;
    ck_*__duplicate_name) object="${scenario%%__*}"; category="has duplicate names" ;;
    ck_*__wrong_conkey) object="${scenario%%__*}"; category="has wrong conkey" ;;
    ck_*__not_valid) object="${scenario%%__*}"; category="is not validated" ;;
    ck_*__no_inherit) object="${scenario%%__*}"; category="unexpectedly uses NO INHERIT" ;;
    ck_*__wrong_expression) object="${scenario%%__*}"; category="has wrong normalized expression" ;;
    idx_*__wrong_relation) object="${scenario%%__*}"; category="has wrong relation" ;;
    idx_*__wrong_key) object="${scenario%%__*}"; category="has wrong key columns" ;;
    idx_*__wrong_sort) object="${scenario%%__*}"; category="has wrong sort options" ;;
    idx_*__unique) object="${scenario%%__*}"; category="is unexpectedly unique" ;;
    idx_*__access_method) object="${scenario%%__*}"; category="has wrong access method" ;;
    idx_*__predicate) object="${scenario%%__*}"; category="unexpectedly has a predicate" ;;
    idx_*__expression) object="${scenario%%__*}"; category="unexpectedly has an expression" ;;
    lock_timeout) object="auth_verification_challenges"; category="canceling statement due to lock timeout" ;;
    transaction_rollback) object="ck_auth_challenge_provider_request_id"; category="has wrong relation" ;;
    *) return 1 ;;
  esac
  printf '%s\t%s\n' "$object" "$category"
}

expect_006_rejection() {
  local database="$1" scenario="$2" timeout_seconds="${3:-0}" contract expected_object expected_category stderr_file stdout_file rc
  contract="$(rejection_contract "$scenario")" || fail contract 78 "missing rejection contract for $scenario"
  IFS=$'\t' read -r expected_object expected_category <<<"$contract"
  stderr_file="$WORK_DIR/${scenario}.stderr"
  stdout_file="$WORK_DIR/${scenario}.stdout"
  set +e
  if [[ "$timeout_seconds" -gt 0 ]]; then
    timeout --signal=TERM --kill-after=1 "$timeout_seconds" \
      "$PSQL" -X --no-psqlrc --echo-errors -v ON_ERROR_STOP=1 -d "$database" -f "$MIGRATION_006" \
      >"$stdout_file" 2>"$stderr_file"
  else
    "$PSQL" -X --no-psqlrc --echo-errors -v ON_ERROR_STOP=1 -d "$database" -f "$MIGRATION_006" \
      >"$stdout_file" 2>"$stderr_file"
  fi
  rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || fail unexpected_success 70 "$scenario unexpectedly succeeded"
  [[ "$rc" -ne 124 && "$rc" -ne 137 ]] || fail external_timeout 79 "$scenario exceeded the external timeout"
  if grep -Eiq 'fixture|permission denied|could not connect|connection (to server )?failed|no such file|could not (open|read) file|syntax error' "$stderr_file"; then
    fail unrelated_error 71 "$scenario stderr contains an unrelated infrastructure error"
  fi
  grep -Fq -- "$expected_object" "$stderr_file" || fail object_mismatch 71 "$scenario stderr did not identify $expected_object"
  grep -Fq -- "$expected_category" "$stderr_file" || fail category_mismatch 71 "$scenario stderr did not contain category: $expected_category"
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
  cleanup_database "$database"
}

run_lock_timeout_scenario() {
  local scenario="lock_timeout" database before after holder application_name granted="0" connections="" poll start_ms end_ms elapsed_ms external_timeout=8
  database="$(database_for_scenario "$scenario")"
  application_name="memoryai_auth_matrix_lock_${RUN8}"
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

  if [[ "${MATRIX_TEST_MODE:-0}" == "1" && -n "${MATRIX_TEST_LOCK_EXTERNAL_TIMEOUT:-}" ]]; then
    [[ "$MATRIX_TEST_LOCK_EXTERNAL_TIMEOUT" =~ ^[1-9][0-9]*$ ]] || fail input 64 "invalid test lock timeout"
    external_timeout="$MATRIX_TEST_LOCK_EXTERNAL_TIMEOUT"
  fi
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
  cleanup_database "$database"
}

expect_behavior_rejection() {
  local database="$1" expected_marker="$2" label="$3" sql="$4" stderr_file="$WORK_DIR/behavior_${label}.stderr" rc
  set +e
  database_psql "$database" -c "$sql" >/dev/null 2>"$stderr_file"
  rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || fail behavior 73 "$label unexpectedly accepted invalid data"
  grep -Fq "$expected_marker" "$stderr_file" || fail behavior 73 "$label returned the wrong rejection"
  if grep -Eiq 'permission denied|could not connect|connection (to server )?failed|no such file|could not (open|read) file|syntax error' "$stderr_file"; then
    fail behavior 73 "$label returned an infrastructure error"
  fi
  record_state "BEHAVIOR_CASE_PASS $label rejection=$expected_marker"
}

run_behavior_insert() {
  local database="$1" label="$2" expectation="$3" phone="$4" code="$5" purpose="$6"
  local created="$7" resend="$8" expires="$9" attempts="${10}" max_attempts="${11}"
  local consumed="${12}" ip="${13}" provider="${14}" sql
  sql="INSERT INTO public.auth_verification_challenges (
    phone_hash,code_digest,purpose,created_at,updated_at,resend_after,expires_at,
    attempts,max_attempts,consumed_at,request_ip_hash,provider_request_id
  ) VALUES (${phone},${code},${purpose},${created},${created},${resend},${expires},
    ${attempts},${max_attempts},${consumed},${ip},${provider});"
  if [[ "$expectation" == "PASS" ]]; then
    database_psql "$database" -c "$sql" >/dev/null
    record_state "BEHAVIOR_CASE_PASS $label accepted"
  else
    expect_behavior_rejection "$database" "$expectation" "$label" "$sql"
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
  cleanup_database "$database"
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
  cleanup_database "$database"
}

dry_run() {
  local scenario category expected database contract expected_object expected_category
  validate_static_inputs
  validate_all_database_names
  while IFS=$'\t' read -r scenario category expected; do
    database="${SCENARIO_DATABASES[$scenario]}"
    validate_test_database_name "$database"
    if contract="$(rejection_contract "$scenario" 2>/dev/null)"; then
      IFS=$'\t' read -r expected_object expected_category <<<"$contract"
    else
      expected_object="-"
      expected_category="$expected"
    fi
    printf 'PLAN\t%s\t%s\t%s\tdatabase:%s\tfixture:001-005\texpected_object:%s\texpected_category:%s\tcleanup:terminate,connections=0,dropdb,exists=0\n' \
      "$scenario" "$category" "$expected" "$database" "$expected_object" "$expected_category"
  done < <(scenario_rows)
}

list_scenarios() {
  local scenario category expected database contract expected_object expected_category
  validate_all_database_names
  while IFS=$'\t' read -r scenario category expected; do
    database="${SCENARIO_DATABASES[$scenario]}"
    if contract="$(rejection_contract "$scenario" 2>/dev/null)"; then
      IFS=$'\t' read -r expected_object expected_category <<<"$contract"
    else
      expected_object="-"
      expected_category="$expected"
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$scenario" "$category" "$expected" "$database" "$expected_object" "$expected_category"
  done < <(scenario_rows)
}

run_matrix() {
  local scenario category expected
  validate_static_inputs
  validate_all_database_names
  validate_inputs
  initialize_runtime
  RUN_ACTIVE=1
  record_state "STARTED run_id=$RUN_ID"
  record_database_mappings
  printf 'STATE_FILE=%s\n' "$STATE_FILE"
  verify_postgresql_14
  assert_no_residual_databases || fail preexisting 74 "current RUN_ID already has residual databases"

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

usage() {
  printf 'Usage: %s [--list|--dry-run]\n' "${0##*/}"
}

case "${1:-}" in
  --list)
    MODE="list"
    list_scenarios
    ;;
  --dry-run)
    MODE="dry-run"
    dry_run
    ;;
  "")
    run_matrix
    ;;
  *)
    usage >&2
    exit 64
    ;;
esac
