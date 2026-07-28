# Sprint22 production schema-drift reconciliation plan

## Scope and prerequisite

This plan reconciles the reported production state without connecting this
repository's test harness to production:

| Migration range | Reported state |
| --- | --- |
| 001-003 | complete |
| 004-005 | incomplete |
| 006-009 | complete |
| 010-015 | not executed |

Production has no migration ledger. Treat the catalog and the preflight output
as the source of truth; do not infer state from deployment history or file
timestamps. Record the operator, SHA-256 of every SQL file, start/end time,
`psql` exit code, and postflight output in the change record.

The isolated PostgreSQL 14.23 gate is run with:

```powershell
pwsh -File scripts/e2e/run-schema-drift-reconciliation-postgres14.ps1 `
  -PostgresBin <postgres-14.23-bin-directory>
```

It creates a new loopback-only PostgreSQL cluster, recreates the exact drift,
tests 004 -> 005 -> 010 -> 011 -> 012 -> 013 -> 014 -> 015 twice, injects an
`ACCESS EXCLUSIVE` lock failure for every catch-up migration and checks that its
first new catalog object is absent after rollback, runs the new read-only
001-003 core postflight plus the existing 004-015 postflight set, and exercises
media, creation/recovery, first greeting, default sessions, and Commerce gates.
It never accepts a non-14.23 runtime.

## Production change sequence

1. Put the application into a write freeze and remove background workers that
   write media, Memories, chat, payments, or Commerce tables. Keep the service
   on a maintenance response; do not run a new deployment concurrently.
2. Capture a physical backup or a consistent logical backup, record its
   checksum, and perform a restore drill to an isolated instance. Capture row
   counts for `memories`, `media_assets`, `conversations`, `messages`, and
   payment/Commerce tables.
3. Run `database/verification/sprint15-preflight.sql` and the 006-015
   postflights read-only against production. Verify the reported drift exactly;
   any unexpected column, constraint, index definition, invalid data, duplicate
   group, or active lock is a stop condition.
4. In separate `psql -X -v ON_ERROR_STOP=1` invocations, apply and capture
   output for: 004, 005, 010, 011, 012, 013. After each committed migration,
   run its postflight before proceeding.
5. Stop for separate production approval of 014 and 015. Both files explicitly
   state that they are isolated-validation-only and cannot be put in an
   automatic production runner. If approved in a later change, run 014 then
   015 individually, with their postflights and application-level smoke tests.
6. Restore workers and writes only after every approved postflight and smoke
   test succeeds. Archive the operator evidence with the backup identifier.

## Lock and downtime budget

004 and 005 use `lock_timeout = 2s` and `statement_timeout = 15min`, but they
perform `ALTER TABLE`, validation, and non-concurrent index work. Treat them
as a maintenance-window operation with a full write freeze, not as zero-downtime
DDL. Use a 15-minute maximum per migration plus postflight time; do not extend
the timeout in production. 010-013 also set the same bounded timeouts and must
run serially. Exact lock duration is data-size dependent and must be estimated
from the preflight's relation sizes and restored-drill timings.

## Stop conditions and rollback

Stop immediately on a lock timeout, statement timeout, nonzero `psql` exit,
postflight mismatch, invalid source data, duplicate target key/hash group, or
an unexpected catalog owner/definition. Do not hand-edit a schema to bypass a
migration assertion.

Each migration is one transaction, so a failure before `COMMIT` rolls back its
own DDL and DML. There are no down migrations after a committed change. For a
post-commit failure, retain the write freeze and restore the verified backup to
a replacement instance, or perform a separately reviewed forward reconciliation;
never attempt an ad-hoc reverse DDL on production.

## Explicit non-actions

This plan does not create a migration ledger in production, deploy code, alter
application configuration, or connect any automated test to production.
