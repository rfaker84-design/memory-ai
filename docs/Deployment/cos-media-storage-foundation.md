# COS Media Storage Foundation

## Runtime contract

- `POST /api/media/upload` accepts authenticated multipart fields `file` and `memoryId`.
- `GET /api/media/{id}` returns a private signed URL valid for 30–900 seconds (default 300).
- `DELETE /api/media/{id}` soft-deletes metadata and schedules object cleanup after 24 hours.
- PostgreSQL stores the COS key, media type, MIME type, byte size, SHA-256 and lifecycle status. Binary data is never stored in PostgreSQL.
- COS credentials are read only by the Node.js server. No credential uses a `NEXT_PUBLIC_` prefix.

Apply `database/migrations/004_media_storage_foundation.sql` with an administrative PostgreSQL role after testing it against a temporary database. The migration is transactional and idempotent. It is intentionally not claimed as applied to production by this change.

Schedule cleanup hourly, for example:

```bash
0 * * * * cd /home/ubuntu/memory-ai && /usr/bin/npx tsx scripts/ops/cleanup-deleted-media.ts
```

The COS bucket must remain private. Do not configure a public-read policy or return a permanent COS domain from the API.

## Failure behavior

- Validation occurs before a database reservation or COS call.
- SHA-256 and a transaction advisory lock make active uploads idempotent per user, memory and media type.
- COS upload failure marks the row `failed`.
- PostgreSQL finalization failure triggers a best-effort COS delete and records `DATABASE_COMMIT_FAILED`.
- Cleanup failures become `cleanup_failed`, are retried after one hour, and emit an alert log.
