# Self-hosted PostgreSQL Operations

## Topology and safety boundary

- Application and PostgreSQL run on the same Tencent CVM.
- PostgreSQL listens on `127.0.0.1` only; public port 5432 must remain closed in host and Tencent security-group policy.
- Runtime role: `memoryai_app`; administrative migrations and backups run through the local `postgres` system account.
- Secrets remain in server environment files with mode `600` and must never be printed or committed.

## Runtime limits

- `max_connections = 40`
- application pool maximum: 10
- `shared_buffers = 256MB`
- `effective_cache_size = 1GB`
- `maintenance_work_mem = 64MB`
- `work_mem = 4MB`
- statement timeout: 30 seconds
- idle transaction timeout: 60 seconds
- slow-query log threshold: 1 second
- database and log timezone: UTC

## Migrations

Run `scripts/postgresql/apply-migrations.sh` from the project root on the server. Each numbered migration uses a transaction and is safe to run repeatedly. Test on a temporary database before production application.

## Backups

- Command: `/usr/local/sbin/memoryai-postgresql-backup`
- Daily schedule: 02:30 UTC
- Daily retention: 7 days
- Sunday copies retained for 4 weeks
- Root-only directory: `/home/ubuntu/memoryai-backups/postgresql`
- Each dump must be non-empty and pass `pg_restore --list`.
- Restore drill: `/usr/local/sbin/memoryai-postgresql-restore-drill`

The COS upload helper intentionally exits without success when destination settings or tooling are absent. Configure and test COS separately before scheduling off-site uploads.

## Monitoring

`/usr/local/sbin/memoryai-postgresql-monitor` runs every five minutes and checks service readiness, at least 5 GiB free disk, and at least 512 MiB available memory. Failures are written to a protected log and system logger.

## Rollback

1. Stop writes to the formal Memory API.
2. Restore the pre-install/application archive listed in the Sprint15A acceptance record.
3. Restore the previous application package/build and restart `memoryai` through PM2.
4. If database rollback is required, retain PostgreSQL files, restore the selected verified custom dump into a temporary database first, then perform a controlled database switch.
5. Do not delete legacy Supabase credentials or historical data until export reconciliation is complete.
