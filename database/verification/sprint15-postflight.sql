\set ON_ERROR_STOP on

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

SELECT
  'public.media_assets' AS table_name,
  count(*) AS exact_row_count,
  pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size('public.media_assets'::regclass)) AS total_size
FROM public.media_assets
UNION ALL
SELECT
  'public.memories',
  count(*),
  pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size('public.memories'::regclass))
FROM public.memories;

SELECT
  a.attrelid::regclass AS table_name,
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  a.attnotnull AS not_null,
  pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_catalog.pg_attribute a
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid IN ('public.media_assets'::regclass, 'public.memories'::regclass)
  AND a.attname IN (
    'sha256', 'failure_code', 'upload_attempts', 'deleted_at',
    'cleanup_after', 'cleaned_at', 'creation_idempotency_key'
  )
  AND NOT a.attisdropped
ORDER BY a.attrelid::regclass::text, a.attnum;

SELECT
  n.nspname AS schema_name,
  t.relname AS table_name,
  i.relname AS index_name,
  x.indisvalid,
  x.indisready,
  pg_catalog.pg_get_indexdef(i.oid) AS definition
FROM pg_catalog.pg_class i
JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
JOIN pg_catalog.pg_class t ON t.oid = x.indrelid
WHERE n.nspname = 'public'
  AND i.relname IN (
    'ux_media_assets_active_hash',
    'idx_media_assets_cleanup',
    'ux_memories_creation_idempotency'
  )
ORDER BY i.relname;

SELECT
  n.nspname AS schema_name,
  t.relname AS table_name,
  c.conname AS constraint_name,
  c.convalidated,
  pg_catalog.pg_get_constraintdef(c.oid, true) AS definition
FROM pg_catalog.pg_constraint c
JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
WHERE n.nspname = 'public'
  AND c.conname IN (
    'ck_media_assets_sha256',
    'ck_media_assets_status_v2',
    'ck_media_assets_type_v2',
    'ck_media_assets_upload_attempts',
    'ck_memories_creation_idempotency_key'
  )
ORDER BY c.conname;

SELECT
  count(*) FILTER (WHERE sha256 IS NULL) AS null_sha256,
  count(*) FILTER (WHERE sha256 !~ '^[0-9a-f]{64}$') AS invalid_sha256,
  count(*) FILTER (WHERE status NOT IN ('pending', 'uploaded', 'failed', 'deleted', 'cleanup_failed')) AS invalid_status,
  count(*) FILTER (WHERE media_type NOT IN ('image', 'audio', 'video', 'avatar', 'document')) AS invalid_media_type,
  count(*) FILTER (WHERE upload_attempts < 0) AS invalid_upload_attempts
FROM public.media_assets;

SELECT count(*) AS active_duplicate_groups
FROM (
  SELECT user_id, memory_id, media_type, sha256
  FROM public.media_assets
  WHERE deleted_at IS NULL AND status IN ('pending', 'uploaded')
  GROUP BY 1, 2, 3, 4
  HAVING count(*) > 1
) duplicates;

SELECT
  count(*) FILTER (WHERE creation_idempotency_key IS NULL) AS null_creation_keys,
  count(*) FILTER (
    WHERE creation_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
  ) AS invalid_creation_keys
FROM public.memories;

SELECT count(*) AS creation_idempotency_duplicate_groups
FROM (
  SELECT user_id, creation_idempotency_key
  FROM public.memories
  GROUP BY 1, 2
  HAVING count(*) > 1
) duplicates;

SELECT
  to_regclass('public.ux_media_assets_active_hash') IS NOT NULL
    AND to_regclass('public.idx_media_assets_cleanup') IS NOT NULL
    AND to_regclass('public.ux_memories_creation_idempotency') IS NOT NULL
    AND (
      SELECT count(*) = 5
      FROM pg_catalog.pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND convalidated
        AND conname IN (
          'ck_media_assets_sha256',
          'ck_media_assets_status_v2',
          'ck_media_assets_type_v2',
          'ck_media_assets_upload_attempts',
          'ck_memories_creation_idempotency_key'
        )
    ) AS sprint15_schema_complete;

ROLLBACK;
