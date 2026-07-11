# Sprint15A China PostgreSQL Production Acceptance

Date: 2026-07-11

Production: `https://yijianmemory.cn`

Application directory: `/home/ubuntu/memory-ai`

## Result

PASS. The formal Memory API and database health route now use self-hosted PostgreSQL on the existing Tencent CVM. Sprint14 UI files were not modified.

## Server resources

| Item | Observed |
|---|---|
| OS | Ubuntu 22.04.5 LTS |
| CPU | 2 vCPU |
| Memory | 4 GB CVM allocation; 3.6 GiB visible to Ubuntu, 2.7 GiB available during acceptance |
| Root disk | 59 GB total, 35 GB available after installation/build |

## PostgreSQL

- Version: PostgreSQL 14.23, Ubuntu-supported package.
- Service: active and enabled at boot.
- Listener: `127.0.0.1:5432` only.
- Database: `memoryai`, UTF-8, UTC.
- Runtime role: least-privilege `memoryai_app`.
- Runtime pool cap: 10; server `max_connections`: 40.
- Public TCP test to `193.112.152.178:5432`: connection not established within 5 seconds.

## Migration and data-path tests

- Temporary schema migration pass 1: PASS.
- Temporary schema migration pass 2: PASS (idempotency).
- Core table count: 9.
- Production migrations: PASS.
- Memory create/read/update/delete/list: PASS.
- Conversation create and message create/list: PASS.
- Idempotent create: PASS.
- Intentional transaction rollback: PASS.
- PostgreSQL restart and subsequent `SELECT 1`: PASS.

Formal call chain:

`/api/memories -> MemoryService -> MemoryRepository -> MemoryPostgresDataSource -> pg Pool -> PostgreSQL`

`/api/memory-chat -> ChatService -> ChatRepository -> ChatPostgresDataSource -> pg Pool -> PostgreSQL`

## Backup and recovery

- Pre-install archive: `/home/ubuntu/memoryai-backups/sprint15a-postgres-pre-20260711-171724.tar.gz`
- Pre-install archive integrity: PASS; SHA-256 recorded in the restricted operations record.
- Pre-deploy application archive: `/home/ubuntu/memoryai-backups/sprint15a-app-pre-20260711T094102Z.tar.gz`
- Verified PostgreSQL dump: `/home/ubuntu/memoryai-backups/postgresql/daily/memoryai-20260711T093949Z.dump`
- Restore drill: PASS into a temporary database; 9 tables verified; temporary database removed.
- Backup directory owner/mode: `root:root`, `700`; backup files/logs are protected.
- COS helper: prepared but not scheduled and does not report success without configuration.

## Build and service checks

- `git diff --check`: PASS.
- `npx tsc --noEmit`: PASS locally and on the server.
- `npm run build`: PASS locally and on the server.
- PostgreSQL architecture guard: PASS.
- Legacy export and PostgreSQL import dry-run: PASS; no source rows were fabricated.
- Production schema integrity verification: PASS for all 9 tables and ownership relations.
- PM2 `memoryai`: online.
- Nginx configuration test: PASS.
- HTTPS health access: PASS.
- `/`, `/dialogue`, `/memory`, and `/create-memory`: HTTP 200 over verified HTTPS.

The in-app visual automation backend timed out during responsive screenshot capture. No Sprint14 UI, Motion, component, or page files changed; route-level HTTPS regression and the changed-file audit passed. A separate visual capture can be repeated when the browser backend is available without affecting the database release.

The server contains a pre-existing untracked visual-runtime file (`PresenceTimeline`) that is absent from the canonical repository and depends on `gsap`. It was not removed or modified in this database sprint; its existing runtime dependency was restored server-side to avoid visual regression. This deployment drift requires a separate controlled reconciliation.

## Consecutive health verification

Five consecutive runs returned:

| Endpoint | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---:|---:|---:|---:|---:|
| `/api/health` | 200 | 200 | 200 | 200 | 200 |
| `/api/health/database` | 200 | 200 | 200 | 200 | 200 |
| `/api/health/ai` | 200 | 200 | 200 | 200 | 200 |

## Historical migration status

Legacy Supabase variables were retained under `LEGACY_SUPABASE_*`; values were not printed. Export/import/verification tooling is ready, but historical export is not marked complete while the legacy project is paused. No fake migration or COS success is reported.

## Rollback

Restore the pre-deploy application archive, rebuild, and restart the same PM2 application. PostgreSQL changes are additive; preserve the database and restore only from a verified dump after a temporary restore drill. The pre-install archive is the full infrastructure fallback. Never expose 5432 or remove legacy export credentials during rollback.
