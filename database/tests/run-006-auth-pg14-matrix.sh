#!/usr/bin/env bash
set -Eeuo pipefail

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
readonly RUN_DB_PREFIX="${DB_PREFIX}${RUN_ID}_"
readonly WORK_DIR="${MATRIX_WORK_DIR:-$(mktemp -d)}"
readonly STATE_FILE="${MATRIX_STATE_FILE:-$WORK_DIR/state.log}"

MODE="run"
CURRENT_STAGE="startup"
RUN_ACTIVE=0
CLEANUP_RECORDED=0
FAILED_RECORDED=0
declare -a CREATED_DATABASES=()

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
  mkdir -p "$(dirname "$STATE_FILE")"
  printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >>"$STATE_FILE"
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
  CREATED_DATABASES=("${remaining[@]:-}")
}

cleanup_database() {
  local database="$1"
  validate_test_database_name "$database"
  admin_psql -v "matrix_db=$database" -c \
    "SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE datname = :'matrix_db' AND pid <> pg_catalog.pg_backend_pid();" \
    >/dev/null
  "$DROPDB" --if-exists --force "$database" >/dev/null
  remove_created_database "$database"
  record_state "CLEANUP_PASS $database"
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
    cleanup_database "$database" || rc=1
  done
  assert_no_residual_databases || rc=1
  if [[ "$rc" -eq 0 && "$CLEANUP_RECORDED" -eq 0 ]]; then
    record_state "CLEANUP_PASS residual=0"
    CLEANUP_RECORDED=1
  fi
  return "$rc"
}

on_exit() {
  local rc="$1"
  trap - EXIT INT TERM
  if [[ "$RUN_ACTIVE" -eq 1 ]]; then
    if ! cleanup_all; then
      [[ "$FAILED_RECORDED" -eq 1 ]] || record_state "FAILED_cleanup_1"
      rc=1
    fi
    if [[ "$rc" -eq 0 ]]; then
      record_state "COMPLETE"
    elif [[ "$FAILED_RECORDED" -eq 0 ]]; then
      record_state "FAILED_${CURRENT_STAGE}_${rc}"
    fi
  fi
  rm -rf "$WORK_DIR"
  exit "$rc"
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
    scenario_exists "$MATRIX_ONLY_SCENARIO" || fail input 64 "unknown MATRIX_ONLY_SCENARIO: $MATRIX_ONLY_SCENARIO"
    scenario_rows | awk -F '\t' -v wanted="$MATRIX_ONLY_SCENARIO" '$1 == wanted'
  else
    scenario_rows
  fi
}

database_for_scenario() {
  local scenario="$1" slug
  slug="$(printf '%s' "$scenario" | tr '[:upper:]-' '[:lower:]_' | tr -cd 'a-z0-9_')"
  printf '%.63s' "${RUN_DB_PREFIX}${slug}"
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
}

validate_static_inputs() {
  local number count
  [[ -f "$MIGRATION_006" ]] || fail input 64 "006 migration is missing"
  [[ -z "${DATABASE_URL:-}" ]] || fail input 64 "DATABASE_URL is forbidden for the matrix"
  [[ -n "$PSQL" && -n "$CREATEDB" && -n "$DROPDB" ]] || fail input 64 "database command plan contains an empty command"
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

expected_error_for() {
  local scenario="$1"
  case "$scenario" in
    challenge_id_*) printf 'challenge_id check failed' ;;
    *__wrong_relation) printf 'wrong relation' ;;
    *__duplicate_name) printf 'duplicate names' ;;
    *__wrong_conkey) printf 'wrong conkey' ;;
    *__not_valid) printf 'not validated' ;;
    *__no_inherit) printf 'NO INHERIT' ;;
    *__wrong_expression) printf 'wrong normalized expression' ;;
    idx_*__wrong_key) printf 'wrong key columns' ;;
    idx_*__wrong_sort) printf 'wrong sort options|wrong normalized definition' ;;
    idx_*__unique) printf 'unexpectedly unique' ;;
    idx_*__access_method) printf 'wrong access method' ;;
    idx_*__predicate) printf 'predicate' ;;
    idx_*__expression) printf 'expression' ;;
    lock_timeout) printf 'lock timeout|canceling statement due to lock timeout' ;;
    transaction_rollback) printf 'wrong relation' ;;
    *) printf 'EXPECTED_REJECTION' ;;
  esac
}

expect_006_rejection() {
  local database="$1" scenario="$2" expected output rc
  expected="$(expected_error_for "$scenario")"
  set +e
  output="$(database_psql "$database" -f "$MIGRATION_006" 2>&1)"
  rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || fail unexpected_success 70 "$scenario unexpectedly succeeded"
  printf '%s' "$output" | grep -Eiq "$expected" || fail error_mismatch 71 "$scenario failed with the wrong error category"
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
  local scenario="lock_timeout" database before after holder rc
  database="$(database_for_scenario "$scenario")"
  record_state "SCENARIO_STARTED $scenario locking"
  create_database "$database"
  apply_fixture_001_005 "$database"
  apply_006 "$database"
  before="$WORK_DIR/${scenario}.before"
  after="$WORK_DIR/${scenario}.after"
  catalog_snapshot "$database" "$before"
  database_psql "$database" -c "BEGIN; LOCK TABLE public.auth_verification_challenges IN ACCESS EXCLUSIVE MODE; SELECT pg_catalog.pg_sleep(8);" >/dev/null 2>&1 &
  holder=$!
  sleep 1
  set +e
  expect_006_rejection "$database" "$scenario"
  rc=$?
  set -e
  kill "$holder" 2>/dev/null || true
  wait "$holder" 2>/dev/null || true
  [[ "$rc" -eq 0 ]] || return "$rc"
  catalog_snapshot "$database" "$after"
  cmp -s "$before" "$after" || fail catalog_drift 72 "$scenario changed the catalog"
  record_state "EXPECTED_REJECTION_PASS $scenario"
  cleanup_database "$database"
}

expect_behavior_rejection() {
  local database="$1" constraint="$2" sql="$3" output rc
  set +e
  output="$(database_psql "$database" -c "$sql" 2>&1)"
  rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || fail behavior 73 "$constraint behavior unexpectedly accepted invalid data"
  printf '%s' "$output" | grep -Fq "$constraint" || fail behavior 73 "$constraint behavior returned the wrong error"
}

run_behavior_scenario() {
  local scenario="constraint_behavior" database valid="$(printf 'a%.0s' {1..64})"
  database="$(database_for_scenario "$scenario")"
  record_state "SCENARIO_STARTED $scenario behavior"
  create_database "$database"
  apply_fixture_001_005 "$database"
  apply_006 "$database"
  expect_behavior_rejection "$database" ck_auth_challenge_phone_hash "INSERT INTO public.auth_verification_challenges (phone_hash,code_digest,purpose,expires_at,resend_after,request_ip_hash) VALUES ('bad','${valid}','sign_in',NOW()+INTERVAL '5 minutes',NOW()+INTERVAL '1 minute','${valid}');"
  expect_behavior_rejection "$database" ck_auth_challenge_code_digest "INSERT INTO public.auth_verification_challenges (phone_hash,code_digest,purpose,expires_at,resend_after,request_ip_hash) VALUES ('${valid}','bad','sign_in',NOW()+INTERVAL '5 minutes',NOW()+INTERVAL '1 minute','${valid}');"
  expect_behavior_rejection "$database" ck_auth_challenge_ip_hash "INSERT INTO public.auth_verification_challenges (phone_hash,code_digest,purpose,expires_at,resend_after,request_ip_hash) VALUES ('${valid}','${valid}','sign_in',NOW()+INTERVAL '5 minutes',NOW()+INTERVAL '1 minute','bad');"
  expect_behavior_rejection "$database" ck_auth_challenge_purpose "INSERT INTO public.auth_verification_challenges (phone_hash,code_digest,purpose,expires_at,resend_after,request_ip_hash) VALUES ('${valid}','${valid}','wrong',NOW()+INTERVAL '5 minutes',NOW()+INTERVAL '1 minute','${valid}');"
  expect_behavior_rejection "$database" ck_auth_challenge_attempts "INSERT INTO public.auth_verification_challenges (phone_hash,code_digest,purpose,expires_at,resend_after,attempts,max_attempts,request_ip_hash) VALUES ('${valid}','${valid}','sign_in',NOW()+INTERVAL '5 minutes',NOW()+INTERVAL '1 minute',6,5,'${valid}');"
  expect_behavior_rejection "$database" ck_auth_challenge_timing "INSERT INTO public.auth_verification_challenges (phone_hash,code_digest,purpose,expires_at,resend_after,request_ip_hash) VALUES ('${valid}','${valid}','sign_in',NOW()+INTERVAL '30 seconds',NOW()+INTERVAL '1 minute','${valid}');"
  expect_behavior_rejection "$database" ck_auth_challenge_consumed_at "INSERT INTO public.auth_verification_challenges (phone_hash,code_digest,purpose,expires_at,resend_after,consumed_at,request_ip_hash) VALUES ('${valid}','${valid}','sign_in',NOW()+INTERVAL '5 minutes',NOW()+INTERVAL '1 minute',NOW()-INTERVAL '1 minute','${valid}');"
  expect_behavior_rejection "$database" ck_auth_challenge_provider_request_id "INSERT INTO public.auth_verification_challenges (phone_hash,code_digest,purpose,expires_at,resend_after,provider_request_id,request_ip_hash) VALUES ('${valid}','${valid}','sign_in',NOW()+INTERVAL '5 minutes',NOW()+INTERVAL '1 minute','', '${valid}');"
  run_sql "$database" "INSERT INTO public.auth_verification_challenges (phone_hash,code_digest,purpose,expires_at,resend_after,provider_request_id,request_ip_hash) VALUES ('${valid}','${valid}','sign_in',NOW()+INTERVAL '5 minutes',NOW()+INTERVAL '1 minute','provider-request','${valid}');"
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
  local row scenario category expected database
  validate_static_inputs
  while IFS=$'\t' read -r scenario category expected; do
    database="$(database_for_scenario "$scenario")"
    validate_test_database_name "$database"
    printf 'PLAN\t%s\t%s\t%s\tcreate:%s\tfixture:001-005\tcleanup:%s\n' \
      "$scenario" "$category" "$expected" "$database" "$database"
  done < <(selected_scenarios)
}

run_matrix() {
  local scenario category expected
  validate_inputs
  RUN_ACTIVE=1
  record_state "STARTED run_id=$RUN_ID"
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
    scenario_rows
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
