# Sprint15 Production Database Migration Runbook

## Purpose and boundaries

This runbook covers migrations `004_media_storage_foundation.sql` and
`005_memory_creation_idempotency.sql`. It does not authorize deployment, server changes,
automatic data repair, or modification of backup automation owned by another workstream.

The migration design is **GO**. The production maintenance window remains blocked until every
on-site evidence field below is populated and verified. Missing window input is a window NO-GO;
it does not change the migration GO conclusion.

The required order is `001 → 002 → 003 → 004 → 005`. Never execute 005 after a failed
004. Both migrations remain single transactions. They deliberately use ordinary indexes
instead of `CREATE INDEX CONCURRENTLY`; the two-second `lock_timeout` makes a busy table a
safe stop condition rather than allowing an unbounded writer outage.

The production application directory is `/home/ubuntu/memory-ai`, the only PM2 application
name permitted by this runbook is `memoryai`, and short public 502/503 responses are accepted
while writes are frozen. Do not modify Nginx. Do not deploy or switch the application worktree
as part of the migration phase.

## Commit identities and immutable migration package

These three commits have distinct meanings and must never be substituted:

```text
MIGRATION_SOURCE_COMMIT=e3749493438d2b698a677e389a15fbc18c25eff8
RELEASE_COMMIT=等待最终集成后填写
PREVIOUS_PRODUCTION_COMMIT=维护窗口前现场记录
```

- `MIGRATION_SOURCE_COMMIT` is the fixed, reviewed source of 004, 005, preflight, postflight,
  and this source runbook.
- `RELEASE_COMMIT` is the final remote `canonical-mainline` SHA after all release integration.
- `PREVIOUS_PRODUCTION_COMMIT` is the SHA recorded from production immediately before the
  maintenance window.

Do not switch the production application worktree to `MIGRATION_SOURCE_COMMIT`. After the
final release commit has been pushed to the approved formal remote, use `git fetch` and
`git show` to extract the reviewed files to a fixed staging root outside the worktree.
Migration commands must use only hash-verified staged SQL.

## Single Bash session, staging, and logs

Run the production commands through the application-compatibility decision in one Bash
session. Every critical `tee` pipeline is therefore governed by the same `pipefail` setting.
The staging and log directories are outside the Git worktree; logs for each run live under
`/var/log/memoryai/migrations/<UTC-RUN-ID>/`.

```bash
set -Eeuo pipefail
umask 077

readonly PROJECT_ROOT=/home/ubuntu/memory-ai
readonly DB_NAME=memoryai
readonly DB_OS_USER=postgres
readonly PM2_APP=memoryai
readonly EXPECTED_OLD_APP_COMMIT=b7577f875ee16b581d4b9f174a29546c3f8bf0a0
readonly MIGRATION_SOURCE_COMMIT=e3749493438d2b698a677e389a15fbc18c25eff8

: "${FORMAL_REMOTE:?set the approved production Git remote name}"
: "${RELEASE_COMMIT:?set the final integrated canonical-mainline SHA}"
: "${PREVIOUS_PRODUCTION_COMMIT:?record production HEAD before the window}"
: "${RELEASE_WINDOW_START_UTC:?set this release window start in UTC}"

readonly RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAGING_ROOT="/var/lib/memoryai/migration-staging/${RUN_ID}"
readonly SQL_ROOT="${STAGING_ROOT}/database"
readonly LOG_DIR="/var/log/memoryai/migrations/${RUN_ID}"
readonly SESSION_STARTED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

[[ ! -e "$STAGING_ROOT" && ! -e "$LOG_DIR" ]] || {
  printf 'STOP: staging/log RUN_ID collision: %s\n' "$RUN_ID" >&2
  exit 1
}
sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 700 \
  "$STAGING_ROOT" "$SQL_ROOT/migrations" "$SQL_ROOT/verification" \
  "$STAGING_ROOT/docs/Deployment" "$LOG_DIR"
exec > >(tee -a "$LOG_DIR/operator-session.log") 2>&1
```

Fetch and extract without checking out either commit:

```bash
git -C "$PROJECT_ROOT" fetch --prune "$FORMAL_REMOTE"
git -C "$PROJECT_ROOT" cat-file -e "${MIGRATION_SOURCE_COMMIT}^{commit}"
git -C "$PROJECT_ROOT" cat-file -e "${RELEASE_COMMIT}^{commit}"
REMOTE_RELEASE_COMMIT="$(git -C "$PROJECT_ROOT" \
  rev-parse "${FORMAL_REMOTE}/canonical-mainline^{commit}")"
[[ "$REMOTE_RELEASE_COMMIT" == "$RELEASE_COMMIT" ]]

extract_reviewed_file() {
  local relative_path="$1"
  local output_path="$STAGING_ROOT/$relative_path"
  git -C "$PROJECT_ROOT" show "${MIGRATION_SOURCE_COMMIT}:${relative_path}" > "$output_path"
  [[ -f "$output_path" && ! -L "$output_path" && -s "$output_path" ]]
  chmod 600 "$output_path"
}

extract_reviewed_file database/migrations/004_media_storage_foundation.sql
extract_reviewed_file database/migrations/005_memory_creation_idempotency.sql
extract_reviewed_file database/verification/sprint15-preflight.sql
extract_reviewed_file database/verification/sprint15-postflight.sql
extract_reviewed_file docs/Deployment/sprint15-database-migration-runbook.md

cat > "$STAGING_ROOT/SHA256SUMS" <<'SHA256'
45329316c4009133986594586355033963f03c5be17939a8cf759718b90fd073  database/migrations/004_media_storage_foundation.sql
fb06bf5b33c8a71834c8a16a930567f631a45ec8b765c0e3a6d4b2fdf02845d1  database/migrations/005_memory_creation_idempotency.sql
ae29b2892d3b3dcb2f0150b97c0d0a730f870cf7446e92520207f9df0019b262  database/verification/sprint15-preflight.sql
15c0607c3273f6e524a4eed524df6bbdc97802e4aad0ce6c5ef1108fbb8d764e  database/verification/sprint15-postflight.sql
eccc576c93ca281699750dd694536b714e90efdb99a0d9e87c01faf08e6dc11d  docs/Deployment/sprint15-database-migration-runbook.md
SHA256
chmod 600 "$STAGING_ROOT/SHA256SUMS"
(cd "$STAGING_ROOT" && sha256sum --check SHA256SUMS)

while IFS= read -r staged_file; do
  [[ -f "$staged_file" && ! -L "$staged_file" ]]
done < <(find "$STAGING_ROOT" -type f -print)
```

Stop on any fetch, commit lookup, remote SHA, extraction, regular-file, symlink, non-empty, or
SHA-256 failure. Never repair a staged artifact or fall back to a worktree SQL file.

## Required approvals and evidence

Before scheduling the maintenance window:

1. Confirm the deployed commit and SHA-256 checksums of migrations 001-005.
2. Confirm 001-003 have been applied and their tables, indexes, constraints, and
   `public.digest(text, text)` function exist.
3. Take a database backup using the separately owned, approved backup procedure and record
   its artifact identifier. Do not alter that procedure from this workstream.
4. Record exact `public.media_assets` and `public.memories` row counts from preflight.
5. Record database/tablespace sizes and verify free space at the operating-system level with
   `df -h`. PostgreSQL exposes used size, not trustworthy filesystem free space.
6. Run the isolated migration test matrix against the same PostgreSQL major version planned
   for production.

The PostgreSQL 14.23 negative matrix, lock timeout, transaction rollback, 004-failure stop,
no-silent-repair, and zero-residue evidence has already passed. Do not repeat the destructive
matrix in production. The maintenance window still requires fresh on-site evidence for the current
application, environment, backup, remote release, database, disk, connections, locks, and
long transactions before writes may be stopped.

The operator must receive these approved backup fields; this runbook does not create, upload,
download, or restore a backup:

```bash
: "${VERIFIED_APP_BACKUP_PATH:?missing application backup path}"
: "${VERIFIED_APP_BACKUP_SHA256:?missing application backup SHA-256}"
: "${VERIFIED_ENV_BACKUP_PATH:?missing environment-file backup path}"
: "${VERIFIED_ENV_BACKUP_SHA256:?missing environment-file backup SHA-256}"
: "${VERIFIED_BACKUP_PATH:?missing local database backup path}"
: "${VERIFIED_BACKUP_COS_KEY:?missing object-storage backup key}"
: "${VERIFIED_BACKUP_SHA256:?missing registered database backup SHA-256}"
: "${VERIFIED_DOWNLOADED_SHA256:?missing downloaded backup SHA-256}"
: "${VERIFIED_RESTORE_DRILL:?missing restore-drill result}"
: "${VERIFIED_RESTORE_UTC:?missing restore-drill UTC time}"

for artifact in \
  "$VERIFIED_APP_BACKUP_PATH" \
  "$VERIFIED_ENV_BACKUP_PATH" \
  "$VERIFIED_BACKUP_PATH"; do
  [[ -f "$artifact" && ! -L "$artifact" && -s "$artifact" ]]
done

for recorded_hash in \
  "$VERIFIED_APP_BACKUP_SHA256" \
  "$VERIFIED_ENV_BACKUP_SHA256" \
  "$VERIFIED_BACKUP_SHA256" \
  "$VERIFIED_DOWNLOADED_SHA256"; do
  [[ "$recorded_hash" =~ ^[0-9a-f]{64}$ ]]
done

[[ "$(sha256sum "$VERIFIED_APP_BACKUP_PATH" | awk '{print $1}')" == \
   "$VERIFIED_APP_BACKUP_SHA256" ]]
[[ "$(sha256sum "$VERIFIED_ENV_BACKUP_PATH" | awk '{print $1}')" == \
   "$VERIFIED_ENV_BACKUP_SHA256" ]]
CURRENT_BACKUP_SHA256="$(sha256sum "$VERIFIED_BACKUP_PATH" | awk '{print $1}')"
[[ "$CURRENT_BACKUP_SHA256" == "$VERIFIED_BACKUP_SHA256" ]]
[[ "$VERIFIED_DOWNLOADED_SHA256" == "$VERIFIED_BACKUP_SHA256" ]]
[[ "$VERIFIED_RESTORE_DRILL" == PASS ]]

WINDOW_START_EPOCH="$(date -u -d "$RELEASE_WINDOW_START_UTC" +%s)"
SESSION_START_EPOCH="$(date -u -d "$SESSION_STARTED_UTC" +%s)"
RESTORE_EPOCH="$(date -u -d "$VERIFIED_RESTORE_UTC" +%s)"
BACKUP_EPOCH="$(stat -c %Y "$VERIFIED_BACKUP_PATH")"
(( BACKUP_EPOCH >= WINDOW_START_EPOCH && BACKUP_EPOCH < SESSION_START_EPOCH ))
(( RESTORE_EPOCH >= WINDOW_START_EPOCH && RESTORE_EPOCH < SESSION_START_EPOCH ))

printf '%s\n' \
  "VERIFIED_APP_BACKUP_PATH=$VERIFIED_APP_BACKUP_PATH" \
  "VERIFIED_APP_BACKUP_SHA256=$VERIFIED_APP_BACKUP_SHA256" \
  "VERIFIED_ENV_BACKUP_PATH=$VERIFIED_ENV_BACKUP_PATH" \
  "VERIFIED_ENV_BACKUP_SHA256=$VERIFIED_ENV_BACKUP_SHA256" \
  "VERIFIED_BACKUP_PATH=$VERIFIED_BACKUP_PATH" \
  "VERIFIED_BACKUP_COS_KEY=$VERIFIED_BACKUP_COS_KEY" \
  "VERIFIED_BACKUP_SHA256=$VERIFIED_BACKUP_SHA256" \
  "VERIFIED_DOWNLOADED_SHA256=$VERIFIED_DOWNLOADED_SHA256" \
  "VERIFIED_RESTORE_DRILL=$VERIFIED_RESTORE_DRILL" \
  "VERIFIED_RESTORE_UTC=$VERIFIED_RESTORE_UTC" \
  > "$LOG_DIR/verified-evidence.txt"
chmod 600 "$LOG_DIR/verified-evidence.txt"
```

The local database backup must still be a non-empty regular file, its current SHA must match
the registered SHA, the downloaded-object SHA must match, and the isolated restore drill must
be `PASS`. The backup and restore evidence must predate migration and belong to this release
window. Missing or stale evidence forbids `pm2 stop`.

## Preflight

Before stopping writes, capture and validate the live identities and operational snapshot.
Every command must succeed and the operator must review the generated logs:

```bash
CURRENT_PRODUCTION_COMMIT="$(git -C "$PROJECT_ROOT" rev-parse HEAD)"
[[ "$CURRENT_PRODUCTION_COMMIT" == "$PREVIOUS_PRODUCTION_COMMIT" ]]
[[ "$DB_NAME" == memoryai ]]

PM2_BEFORE_PID="$(pm2 pid "$PM2_APP" | tr '\n' ',' | sed 's/,$//')"
[[ "$PM2_BEFORE_PID" =~ [1-9][0-9]* ]]
pm2 show "$PM2_APP" | tee "$LOG_DIR/pm2-before.txt"
pm2 show "$PM2_APP" | grep -Eiq 'status[[:space:][:punct:]]+online'

PG_VERSION="$(sudo -u "$DB_OS_USER" psql -X -At -d "$DB_NAME" \
  -c 'SHOW server_version')"
[[ "$PG_VERSION" == 14.23 ]]

printf '%s\n' \
  "CURRENT_PRODUCTION_COMMIT=$CURRENT_PRODUCTION_COMMIT" \
  "PREVIOUS_PRODUCTION_COMMIT=$PREVIOUS_PRODUCTION_COMMIT" \
  "MIGRATION_SOURCE_COMMIT=$MIGRATION_SOURCE_COMMIT" \
  "RELEASE_COMMIT=$RELEASE_COMMIT" \
  "REMOTE_RELEASE_COMMIT=$REMOTE_RELEASE_COMMIT" \
  "PM2_APP=$PM2_APP" \
  "PM2_BEFORE_PID=$PM2_BEFORE_PID" \
  "DB_NAME=$DB_NAME" \
  "PG_VERSION=$PG_VERSION" \
  > "$LOG_DIR/window-identities.txt"
chmod 600 "$LOG_DIR/window-identities.txt"

df -h "$VERIFIED_BACKUP_PATH" "$STAGING_ROOT" "$LOG_DIR" \
  | tee "$LOG_DIR/disk-before.txt"

sudo -u "$DB_OS_USER" psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  --file "$SQL_ROOT/verification/sprint15-preflight.sql" \
  | tee "$LOG_DIR/preflight-before-freeze.log"

sudo -u "$DB_OS_USER" psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  | tee "$LOG_DIR/activity-before-freeze.log" <<'SQL'
SELECT pid, usename, application_name, client_addr, state,
       now() - xact_start AS transaction_age, wait_event_type, wait_event,
       left(query, 160) AS query
FROM pg_catalog.pg_stat_activity
WHERE datname = current_database()
ORDER BY xact_start NULLS LAST, query_start NULLS LAST;

SELECT waiting.pid AS waiting_pid, blocking.pid AS blocking_pid,
       now() - waiting.query_start AS waiting_for,
       left(waiting.query, 120) AS waiting_query,
       left(blocking.query, 120) AS blocking_query
FROM pg_catalog.pg_stat_activity waiting
CROSS JOIN LATERAL unnest(pg_catalog.pg_blocking_pids(waiting.pid)) blocker(pid)
JOIN pg_catalog.pg_stat_activity blocking ON blocking.pid = blocker.pid
WHERE waiting.datname = current_database();

SELECT pid, usename, application_name, now() - xact_start AS transaction_age,
       state, wait_event_type, wait_event, left(query, 160) AS query
FROM pg_catalog.pg_stat_activity
WHERE datname = current_database()
  AND xact_start IS NOT NULL
  AND now() - xact_start > interval '30 seconds'
ORDER BY xact_start;
SQL
```

Preflight intentionally aborts if it finds illegal enums, SHA values, active hash conflicts,
null/illegal idempotency keys, or prospective idempotency conflicts. Existing same-name
indexes and constraints are printed for review; the migrations independently verify their
owner table and catalog definition and raise an exception on mismatch.

Stop before migration if any of the following is true:

- Preflight exits non-zero or reports any anomaly count above zero.
- A same-name object has a different owner table, predicate, key order, uniqueness, or CHECK
  expression.
- Long-running transactions or ungranted locks involve `media_assets` or `memories`.
- The backup is missing or its restore path has not been validated.
- Free disk is less than twice the combined table/index size plus normal WAL headroom.
- The exact row-count baseline was not captured.
- The current production Git SHA, PM2 PID/status, application backup path/SHA, environment
  backup path/SHA, database backup evidence, target database, PostgreSQL version, disk,
  connection, lock, long-transaction snapshot, or remote release SHA is missing.

Do not delete, merge, normalize, or infer corrections for anomalous rows. Escalate the exact
row identifiers and values for a separate data-remediation decision.

Only after every preceding field and review is complete may the operator freeze writes. Do
not use an ecosystem file and do not change Nginx:

```bash
pm2 stop "$PM2_APP"
pm2 show "$PM2_APP" | tee "$LOG_DIR/pm2-stopped.txt"
pm2 show "$PM2_APP" | grep -Eiq 'status[[:space:][:punct:]]+stopped'

sudo -u "$DB_OS_USER" psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  | tee "$LOG_DIR/freeze-hard-gate.log" <<'SQL'
DO $$
DECLARE
  app_sessions bigint;
  lock_waiters bigint;
  long_transactions bigint;
BEGIN
  SELECT count(*) INTO app_sessions
  FROM pg_catalog.pg_stat_activity
  WHERE datname = current_database() AND usename = 'memoryai_app';

  SELECT count(*) INTO lock_waiters
  FROM pg_catalog.pg_locks l
  JOIN pg_catalog.pg_stat_activity a ON a.pid = l.pid
  WHERE a.datname = current_database() AND NOT l.granted;

  SELECT count(*) INTO long_transactions
  FROM pg_catalog.pg_stat_activity
  WHERE datname = current_database()
    AND xact_start IS NOT NULL
    AND pid <> pg_backend_pid()
    AND now() - xact_start > interval '30 seconds';

  RAISE NOTICE 'memoryai_app_sessions=%, lock_waiters=%, long_transactions=%',
    app_sessions, lock_waiters, long_transactions;
  IF app_sessions <> 0 OR lock_waiters <> 0 OR long_transactions <> 0 THEN
    RAISE EXCEPTION 'write-freeze hard gate failed';
  END IF;
END
$$;
SQL

sudo -u "$DB_OS_USER" psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  --file "$SQL_ROOT/verification/sprint15-preflight.sql" \
  | tee "$LOG_DIR/preflight-after-freeze.log"

read -r MEDIA_ROWS_BEFORE MEMORIES_ROWS_BEFORE < <(
  sudo -u "$DB_OS_USER" psql -X -At -v ON_ERROR_STOP=1 -d "$DB_NAME" \
    -c "SELECT (SELECT count(*) FROM public.media_assets), (SELECT count(*) FROM public.memories)" \
    | tr '|' ' '
)
[[ "$MEDIA_ROWS_BEFORE" =~ ^[0-9]+$ && "$MEMORIES_ROWS_BEFORE" =~ ^[0-9]+$ ]]
printf 'media_assets=%s\nmemories=%s\n' "$MEDIA_ROWS_BEFORE" "$MEMORIES_ROWS_BEFORE" \
  | tee "$LOG_DIR/exact-row-baseline.txt"
```

After the freeze, PM2 must report stopped, `memoryai_app` sessions must be zero, no lock may
be waiting, and no transaction may be older than 30 seconds. The second preflight and exact
row baseline must succeed before 004 starts.

## Expected duration and availability impact

Each migration has `lock_timeout = 2s` and `statement_timeout = 15min`. Lock acquisition
must complete within two seconds; otherwise the transaction rolls back. Ordinary index
creation blocks writes while the transaction is active. Execute only in an approved low-write
maintenance window.

Runtime depends on row count, dead tuples, storage latency, and WAL throughput. As a planning
range only: under 100,000 rows usually fits within 10-60 seconds per migration; around one
million rows may take 1-10 minutes. The 15-minute statement timeout is a hard stop, not a
target duration.

## Execution

Use separate commands and inspect the result of 004 before starting 005:

```bash
set +e
sudo -u "$DB_OS_USER" psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  --file "$SQL_ROOT/migrations/004_media_storage_foundation.sql" \
  | tee "$LOG_DIR/004.log"
MIGRATION_004_STATUS=${PIPESTATUS[0]}
set -e

if (( MIGRATION_004_STATUS != 0 )); then
  printf 'STOP: 004 exited %s; 005 is forbidden\n' "$MIGRATION_004_STATUS" >&2
  exit "$MIGRATION_004_STATUS"
fi

sudo -u "$DB_OS_USER" psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  | tee "$LOG_DIR/004-hard-gate.log" <<'SQL'
DO $$
DECLARE
  invalid_data bigint;
  invalid_objects bigint;
BEGIN
  SELECT
    count(*) FILTER (
      WHERE status IS NULL
         OR status NOT IN ('pending','uploaded','failed','deleted','cleanup_failed'))
    + count(*) FILTER (
      WHERE media_type IS NULL
         OR media_type NOT IN ('image','audio','video','avatar','document'))
    + count(*) FILTER (WHERE sha256 IS NULL OR sha256 !~ '^[0-9a-f]{64}$')
    + count(*) FILTER (WHERE upload_attempts IS NULL OR upload_attempts < 0)
  INTO invalid_data
  FROM public.media_assets;

  SELECT count(*) INTO invalid_objects
  FROM (VALUES
    ('public.ux_media_assets_active_hash'::regclass),
    ('public.idx_media_assets_cleanup'::regclass)
  ) AS expected(index_oid)
  JOIN pg_catalog.pg_index i ON i.indexrelid = expected.index_oid
  WHERE NOT i.indisvalid OR NOT i.indisready;

  IF invalid_data <> 0 OR invalid_objects <> 0 THEN
    RAISE EXCEPTION '004 hard gate failed: invalid_data=%, invalid_or_unready_indexes=%',
      invalid_data, invalid_objects;
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.media_assets'::regclass
        AND conname IN ('ck_media_assets_sha256','ck_media_assets_status_v2',
                        'ck_media_assets_type_v2','ck_media_assets_upload_attempts')
        AND convalidated) <> 4 THEN
    RAISE EXCEPTION '004 hard gate failed: expected four validated constraints';
  END IF;
END
$$;
SQL

set +e
sudo -u "$DB_OS_USER" psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  --file "$SQL_ROOT/migrations/005_memory_creation_idempotency.sql" \
  | tee "$LOG_DIR/005.log"
MIGRATION_005_STATUS=${PIPESTATUS[0]}
set -e

if (( MIGRATION_005_STATUS != 0 )); then
  printf 'STOP: 005 exited %s; keep memoryai stopped\n' "$MIGRATION_005_STATUS" >&2
  exit "$MIGRATION_005_STATUS"
fi
```

The 004 hard gate is mandatory. A non-zero 004 status or failed/uncertain hard gate forbids
005. A failed 005 transaction does not undo an already committed 004; keep writes frozen.

During execution, monitor from a separate session:

```bash
set -Eeuo pipefail
umask 077
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d memoryai -P pager=off <<'SQL'
SELECT pid, now() - query_start AS duration, state, wait_event_type, wait_event,
       left(query, 160) AS query
FROM pg_catalog.pg_stat_activity
WHERE datname = current_database()
ORDER BY query_start;

SELECT a.pid, c.oid::regclass AS relation, l.mode, l.granted,
       now() - a.xact_start AS transaction_age
FROM pg_catalog.pg_locks l
JOIN pg_catalog.pg_stat_activity a ON a.pid = l.pid
LEFT JOIN pg_catalog.pg_class c ON c.oid = l.relation
WHERE c.oid IN ('public.media_assets'::regclass, 'public.memories'::regclass)
ORDER BY l.granted, a.xact_start;

SELECT pid, relid::regclass, index_relid::regclass, phase,
       blocks_total, blocks_done, tuples_total, tuples_done
FROM pg_catalog.pg_stat_progress_create_index;

SELECT application_name, state, write_lag, flush_lag, replay_lag
FROM pg_catalog.pg_stat_replication;
SQL

sudo journalctl -u postgresql -u postgresql@14-main --since '10 minutes ago' --follow
```

## Failure stop conditions

Stop immediately and do not execute the next migration when:

- PostgreSQL reports lock timeout, statement timeout, uniqueness, CHECK, NOT NULL, catalog
  definition, disk, WAL, or connection errors.
- Application writes time out or their error rate rises.
- Replica replay lag exceeds the existing operational threshold; without one, use 30 seconds.
- The migration session waits on an unexpected lock or exceeds the reviewed duration estimate.
- 004 does not commit successfully. Never continue with 005.
- The migration client disconnects or commit state is uncertain. Do not rerun until catalog
  and transaction state has been established independently.
- Any partial schema/data state, postflight anomaly, invalid/unready index, unvalidated
  constraint, or exact row-count change is observed.

An error before `COMMIT` aborts the transaction; issue `ROLLBACK` if the client remains in an
aborted transaction. Confirm catalog state before any retry. Re-running a successful migration
does not repeat full-table updates: both backfills target only NULL rows, and normalization
targets only values that differ from their lowercase representation.

Do not automatically delete, merge, normalize, infer, or repair unexpected production data.
Preserve logs and catalog evidence and obtain a separate decision.

## Postflight

```bash
sudo -u "$DB_OS_USER" psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  --file "$SQL_ROOT/verification/sprint15-postflight.sql" \
  | tee "$LOG_DIR/postflight.log"

sudo -u "$DB_OS_USER" psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  | tee "$LOG_DIR/final-boolean-hard-gate.log" <<SQL
DO \$\$
DECLARE
  media_rows bigint;
  memory_rows bigint;
  anomaly_count bigint;
  duplicate_count bigint;
  valid_ready_indexes bigint;
  validated_constraints bigint;
  required_columns bigint;
BEGIN
  SELECT count(*) INTO media_rows FROM public.media_assets;
  SELECT count(*) INTO memory_rows FROM public.memories;

  SELECT
    count(*) FILTER (
      WHERE status IS NULL
         OR status NOT IN ('pending','uploaded','failed','deleted','cleanup_failed'))
    + count(*) FILTER (
      WHERE media_type IS NULL
         OR media_type NOT IN ('image','audio','video','avatar','document'))
    + count(*) FILTER (WHERE sha256 IS NULL OR sha256 !~ '^[0-9a-f]{64}$')
    + count(*) FILTER (WHERE upload_attempts IS NULL OR upload_attempts < 0)
    + (SELECT count(*) FROM public.memories
       WHERE creation_idempotency_key IS NULL
          OR creation_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$')
  INTO anomaly_count
  FROM public.media_assets;

  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT user_id::text, memory_id::text, media_type, sha256
    FROM public.media_assets
    WHERE deleted_at IS NULL AND status IN ('pending','uploaded')
    GROUP BY 1,2,3,4 HAVING count(*) > 1
    UNION ALL
    SELECT user_id::text, 'memory', 'memory', creation_idempotency_key
    FROM public.memories
    GROUP BY 1,4 HAVING count(*) > 1
  ) duplicates;

  SELECT count(*) INTO valid_ready_indexes
  FROM pg_catalog.pg_index
  WHERE indexrelid IN (
      'public.ux_media_assets_active_hash'::regclass,
      'public.idx_media_assets_cleanup'::regclass,
      'public.ux_memories_creation_idempotency'::regclass)
    AND indisvalid AND indisready;

  SELECT count(*) INTO validated_constraints
  FROM pg_catalog.pg_constraint
  WHERE connamespace = 'public'::regnamespace
    AND ((conrelid = 'public.media_assets'::regclass
          AND conname IN ('ck_media_assets_sha256','ck_media_assets_status_v2',
                          'ck_media_assets_type_v2','ck_media_assets_upload_attempts'))
      OR (conrelid = 'public.memories'::regclass
          AND conname = 'ck_memories_creation_idempotency_key'))
    AND convalidated;

  SELECT count(*) INTO required_columns
  FROM pg_catalog.pg_attribute
  WHERE NOT attisdropped
    AND ((attrelid = 'public.media_assets'::regclass
          AND attname IN ('sha256','failure_code','upload_attempts','deleted_at',
                          'cleanup_after','cleaned_at'))
      OR (attrelid = 'public.memories'::regclass
          AND attname = 'creation_idempotency_key'));

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.media_assets'::regclass
      AND attname = 'sha256' AND attnotnull AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.memories'::regclass
      AND attname = 'creation_idempotency_key' AND attnotnull AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'final hard gate failed: required NOT NULL state missing';
  END IF;

  IF media_rows <> ${MEDIA_ROWS_BEFORE}
     OR memory_rows <> ${MEMORIES_ROWS_BEFORE}
     OR anomaly_count <> 0
     OR duplicate_count <> 0
     OR valid_ready_indexes <> 3
     OR validated_constraints <> 5
     OR required_columns <> 7 THEN
    RAISE EXCEPTION 'final Sprint15 Boolean hard gate failed';
  END IF;
END
\$\$;
SQL

MEDIA_ROWS_AFTER="$(sudo -u "$DB_OS_USER" psql -X -At -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  -c 'SELECT count(*) FROM public.media_assets')"
MEMORIES_ROWS_AFTER="$(sudo -u "$DB_OS_USER" psql -X -At -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  -c 'SELECT count(*) FROM public.memories')"
[[ "$MEDIA_ROWS_AFTER" == "$MEDIA_ROWS_BEFORE" ]]
[[ "$MEMORIES_ROWS_AFTER" == "$MEMORIES_ROWS_BEFORE" ]]
printf 'media_assets=%s\nmemories=%s\n' "$MEDIA_ROWS_AFTER" "$MEMORIES_ROWS_AFTER" \
  | tee "$LOG_DIR/exact-row-postflight.txt"
```

Acceptance requires:

- `sprint15_schema_complete = true`.
- Every invalid/null/duplicate count is zero.
- All three indexes are valid and ready with the reviewed definitions.
- All five CHECK constraints are validated with the reviewed definitions.
- Exact `media_assets` and `memories` row counts equal the preflight baseline.

## Old-application compatibility decision

Static review of expected production baseline
`b7577f875ee16b581d4b9f174a29546c3f8bf0a0` against the post-004/005 schema found:

- The PostgreSQL Memory creation path writes both `idempotency_key` and
  `creation_idempotency_key`. Without a supplied request key it derives a deterministic
  64-character SHA-256 value; supplied values are checked against
  `^[A-Za-z0-9._:-]{16,128}$`. This is compatible with the 005 NOT NULL, CHECK, and unique
  index, and the unique-conflict path reads the existing Memory.
- The PostgreSQL media path reads and writes lowercase status and media-type values, including
  the definitions accepted by 004. It does not depend on pre-normalization mixed casing.
- The new columns, constraints, and indexes are additive and do not remove or rename fields
  consumed by that baseline.

Decision A applies only when `CURRENT_PRODUCTION_COMMIT` exactly equals the reviewed baseline
and every database gate above passes. The old application may then be restored without
refreshing its environment:

```bash
if [[ "$CURRENT_PRODUCTION_COMMIT" == "$EXPECTED_OLD_APP_COMMIT" ]]; then
  pm2 restart "$PM2_APP"
  pm2 show "$PM2_APP" | tee "$LOG_DIR/pm2-restored.txt"
else
  printf 'DECISION B: unreviewed production SHA; keep memoryai stopped\n' >&2
  exit 1
fi
```

Decision B applies whenever the current production SHA differs, compatibility evidence is
incomplete, or a database gate fails. Never assume compatibility in that state: keep
`memoryai` stopped and enter only the separately approved final-release deployment. An
environment refresh is permitted only for that new deployment after its environment has been
verified.

## Rollback

Before commit, use `ROLLBACK`; PostgreSQL discards the complete migration transaction.

Use this A/B/C/D decision tree and preserve the exact transaction/catalog state before any
action:

- **A — 004 fails before commit:** 004 rolls back as one transaction. Never execute 005.
  Keep writes frozen until catalog state is verified. If commit state is uncertain, do not
  rerun.
- **B — 004 committed and 005 has not run:** do not claim an overall automatic rollback; 004
  remains committed. Keep the application stopped. Compatibility proven for the complete
  post-004/005 schema must not be extrapolated to this partial state.
- **C — 005 fails:** its transaction rolls back, but committed 004 remains. Keep maintenance
  mode, determine the 005 commit state, and obtain a separate decision before retry.
- **D — application fails after both migrations:** stop the application and prefer application
  rollback to a verified compatible commit while leaving additive database schema in place.
  Application rollback has priority over database rollback.

Never directly overwrite the production database. A database switch or restore requires a
separate explicit approval, a new write freeze, verified backup evidence, and a separately
reviewed recovery plan.

After commit, prefer application compatibility rollback while leaving additive schema in
place. A destructive schema rollback requires a new approval, stopped writes, and a verified
backup because it removes values written after migration. The following retained reverse-order
reference is not authorized for automatic execution. If separately approved, reverse 005
before 004:

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.memories
  DROP CONSTRAINT IF EXISTS ck_memories_creation_idempotency_key;
DROP INDEX IF EXISTS public.ux_memories_creation_idempotency;
ALTER TABLE public.memories DROP COLUMN IF EXISTS creation_idempotency_key;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS ck_media_assets_upload_attempts,
  DROP CONSTRAINT IF EXISTS ck_media_assets_type_v2,
  DROP CONSTRAINT IF EXISTS ck_media_assets_status_v2,
  DROP CONSTRAINT IF EXISTS ck_media_assets_sha256;
DROP INDEX IF EXISTS public.idx_media_assets_cleanup;
DROP INDEX IF EXISTS public.ux_media_assets_active_hash;
ALTER TABLE public.media_assets
  DROP COLUMN IF EXISTS cleaned_at,
  DROP COLUMN IF EXISTS cleanup_after,
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS upload_attempts,
  DROP COLUMN IF EXISTS failure_code,
  DROP COLUMN IF EXISTS sha256;
COMMIT;
```

The lowercase normalization performed by 004 cannot reconstruct original casing after commit.
Restore original values from the approved backup if exact casing recovery is required.

## Automated tests

Static safety tests require only Node.js:

```bash
node --test database/tests/sprint15-migration-hardening.test.cjs
```

The full matrix requires an explicitly local isolated database whose name contains `test`:

```bash
MEMORYAI_TEST_DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/memoryai_migration_test \
  node --test database/tests/sprint15-migration-hardening.test.cjs
```

The harness refuses non-loopback hosts and destructively recreates only the `public` schema of
the named test database. It covers empty state, legal history, mixed case, invalid enum/SHA,
active duplicates, invalid/duplicate idempotency keys, wrong same-name objects, repeat runs,
lock timeout, and transaction rollback.
