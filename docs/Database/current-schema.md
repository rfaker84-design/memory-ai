# MemoryAI Current Production Schema

Status: Sprint15A production baseline

Database: self-hosted PostgreSQL on the application CVM

Authoritative migrations: `database/migrations/001_memoryai_core.sql` through `003_memoryai_constraints.sql`

## Runtime boundary

The formal memory write/read path is server-only:

`API -> MemoryService -> MemoryRepository -> MemoryPostgresDataSource -> pg Pool -> PostgreSQL`

The formal conversation path follows the same boundary through `ChatService -> ChatRepository -> ChatPostgresDataSource`. Conversation and message writes are transactional, and message creation updates `last_message_at` in the same transaction.

Browser code must not import `pg`, use `DATABASE_URL`, or connect to PostgreSQL. The Supabase memory datasource remains only as a historical-export compatibility adapter and is not selected by the formal memory API or database health route.

## Core tables

| Table | Purpose | Ownership / primary relations |
|---|---|---|
| `users` | Stable internal user identity mapped from existing external IDs | unique `external_id` |
| `memories` | Person/memory profile currently used by the Memory API | `user_id -> users.id` |
| `memory_fragments` | Source fragments attached to a memory | `memory_id -> memories.id` |
| `conversations` | Conversation sessions | `user_id -> users.id`, `memory_id -> memories.id` |
| `messages` | Conversation messages | optional conversation plus required user and memory |
| `media_assets` | Media metadata and storage keys, not binary payloads | user and memory ownership |
| `consent_records` | Consent metadata for memory use | user and optional memory |
| `provider_jobs` | Asynchronous provider job state | user and memory ownership |
| `audit_logs` | Append-oriented application audit events | user and optional memory |

Every core table uses a UUID primary key and `created_at`; mutable tables also use `updated_at` maintained by triggers. Timestamps are `TIMESTAMPTZ`, and production PostgreSQL runs in UTC.

## Integrity and indexes

- Foreign keys enforce user, memory, conversation, and provider-job ownership.
- Check constraints cover valid years, message roles, non-negative counters/sizes, provider progress, and non-empty required text.
- Memory creation is idempotent through `(user_id, idempotency_key)`.
- Fragment duplicates are constrained by `(memory_id, source_type, content_hash)`.
- User/list/time access paths have explicit indexes in `002_memoryai_indexes.sql`.
- All application SQL is parameterized; memory writes and fragment replacement use transactions.

## Production connection policy

- PostgreSQL listens only on `127.0.0.1:5432`.
- The application role is `memoryai_app`, without superuser, database creation, role creation, or replication privileges.
- Runtime connections use a server-side pool capped at 10 connections.
- The database health endpoint executes `SELECT 1` with a five-second timeout.
- Credentials exist only in server environment files with mode `600`; values are never committed.

## Historical Supabase data

Supabase credentials are retained under `LEGACY_SUPABASE_*` solely for export tooling. Export/import scripts support dry-run, resumable state, private file permissions, optional AES-256-GCM encryption, parameterized imports, and count/integrity verification. Historical export remains pending while the legacy project is paused; no synthetic migration success is recorded.

## Scope note

Historical and experimental routes outside the frozen formal Memory and Chat APIs may still contain Supabase adapters. They are not selected by the Sprint15A memory/chat registry and must be migrated or retired under separately controlled scopes before those routes are promoted to formal production paths.
