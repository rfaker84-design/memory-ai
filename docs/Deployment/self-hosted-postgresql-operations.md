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
- Daily schedule: 02:30 UTC (`CRON_TZ=UTC`)
- Daily retention: 7 days
- Sunday copies retained for 4 weeks
- Root-only directory: `/home/ubuntu/memoryai-backups/postgresql`
- Each dump must be non-empty and pass `pg_restore --list`.
- Restore drill: `/usr/local/sbin/memoryai-postgresql-restore-drill`
- Formal COS entrypoint: `/home/ubuntu/memory-ai/scripts/backup/postgresql-to-cos.sh`
- Controlled cron installer: `/home/ubuntu/memory-ai/scripts/backup/install-postgresql-cos-backup-cron.sh`
- Cron target: `/etc/cron.d/memoryai-postgresql-cos-backup` (`root:root`, mode `644`)
- Production COS bucket: `memoryai-pg-backup-prod-1442603693`
- Production COS region: `ap-guangzhou`
- COS credential configuration: `/etc/memoryai/coscmd-backup.conf` (`root:root`, mode `400` or `600`)
- COSCMD log: `/var/log/memoryai/coscmd-backup.log` (mode `600`)
- COS lifecycle: daily prefix expires after 8 days; weekly prefix expires after 35 days; incomplete multipart uploads expire after 1 day

The formal COS entrypoint owns its non-blocking flock and fails closed when its dedicated configuration, destination, tooling, upload, download, or hash verification is invalid. It never reads `~/.cos.conf`, generic Tencent credential variables, or a default SDK credential chain, and it never performs remote list/delete retention. Configure and verify COS lifecycle rules separately before scheduling off-site uploads. The legacy `scripts/postgresql/cos-upload.sh` only delegates to the formal entrypoint.

## Monitoring

`/usr/local/sbin/memoryai-postgresql-monitor` runs every five minutes and checks service readiness, at least 5 GiB free disk, and at least 512 MiB available memory. Failures are written to a protected log and system logger.

## Rollback

1. Stop writes to the formal Memory API.
2. Restore the pre-install/application archive listed in the Sprint15A acceptance record.
3. Restore the previous application package/build and restart `memoryai` through PM2.
4. If database rollback is required, retain PostgreSQL files, restore the selected verified custom dump into a temporary database first, then perform a controlled database switch.
5. Do not delete legacy Supabase credentials or historical data until export reconciliation is complete.
