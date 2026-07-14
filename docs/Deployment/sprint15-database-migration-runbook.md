# Sprint15 Database Migration Runbook

## Purpose and boundaries

This runbook covers migrations `004_media_storage_foundation.sql` and
`005_memory_creation_idempotency.sql`. It does not authorize deployment, server changes,
automatic data repair, or modification of backup automation owned by another workstream.

The required order is `001 → 002 → 003 → 004 → 005`. Never execute 005 after a failed
004. Both migrations remain single transactions. They deliberately use ordinary indexes
instead of `CREATE INDEX CONCURRENTLY`; the two-second `lock_timeout` makes a busy table a
safe stop condition rather than allowing an unbounded writer outage.

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

## Preflight

Run from the repository root with a read-only-capable account:

```bash
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" \
  --file database/verification/sprint15-preflight.sql \
  | tee sprint15-preflight.log
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

Do not delete, merge, normalize, or infer corrections for anomalous rows. Escalate the exact
row identifiers and values for a separate data-remediation decision.

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
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" \
  --file database/migrations/004_media_storage_foundation.sql \
  | tee sprint15-004.log

psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" \
  --file database/migrations/005_memory_creation_idempotency.sql \
  | tee sprint15-005.log
```

During execution, monitor from a separate session:

```sql
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
```

## Failure stop conditions

Stop immediately and do not execute the next migration when:

- PostgreSQL reports lock timeout, statement timeout, uniqueness, CHECK, NOT NULL, catalog
  definition, disk, WAL, or connection errors.
- Application writes time out or their error rate rises.
- Replica replay lag exceeds the existing operational threshold; without one, use 30 seconds.
- The migration session waits on an unexpected lock or exceeds the reviewed duration estimate.
- 004 does not commit successfully. Never continue with 005.

An error before `COMMIT` aborts the transaction; issue `ROLLBACK` if the client remains in an
aborted transaction. Confirm catalog state before any retry. Re-running a successful migration
does not repeat full-table updates: both backfills target only NULL rows, and normalization
targets only values that differ from their lowercase representation.

## Postflight

```bash
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" \
  --file database/verification/sprint15-postflight.sql \
  | tee sprint15-postflight.log
```

Acceptance requires:

- `sprint15_schema_complete = true`.
- Every invalid/null/duplicate count is zero.
- All three indexes are valid and ready with the reviewed definitions.
- All five CHECK constraints are validated with the reviewed definitions.
- Exact `media_assets` and `memories` row counts equal the preflight baseline.

## Rollback

Before commit, use `ROLLBACK`; PostgreSQL discards the complete migration transaction.

After commit, prefer application compatibility rollback while leaving additive schema in
place. A destructive schema rollback requires a new approval, stopped writes, and a verified
backup because it removes values written after migration. If explicitly approved, reverse 005
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
