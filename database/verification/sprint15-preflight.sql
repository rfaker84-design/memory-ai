\set ON_ERROR_STOP on

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF to_regclass('public.media_assets') IS NULL OR to_regclass('public.memories') IS NULL THEN
    RAISE EXCEPTION 'Sprint15 preflight requires public.media_assets and public.memories; verify 001-003 first';
  END IF;
END;
$$;

SELECT
  c.oid::regclass AS table_name,
  s.n_live_tup AS estimated_live_rows,
  s.n_dead_tup AS estimated_dead_rows,
  pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(c.oid)) AS heap_size,
  pg_catalog.pg_size_pretty(pg_catalog.pg_indexes_size(c.oid)) AS indexes_size,
  pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) AS total_size
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public' AND c.relname IN ('media_assets', 'memories')
ORDER BY c.relname;

SELECT
  d.datname,
  pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname)) AS database_size,
  t.spcname AS default_tablespace,
  NULLIF(pg_catalog.pg_tablespace_location(t.oid), '') AS tablespace_location,
  pg_catalog.pg_size_pretty(pg_catalog.pg_tablespace_size(t.oid)) AS tablespace_size,
  pg_catalog.current_setting('data_directory') AS data_directory,
  pg_catalog.current_setting('max_wal_size') AS max_wal_size,
  pg_catalog.current_setting('temp_file_limit') AS temp_file_limit
FROM pg_catalog.pg_database d
JOIN pg_catalog.pg_tablespace t ON t.oid = d.dattablespace
WHERE d.datname = pg_catalog.current_database();

SELECT
  a.pid,
  c.oid::regclass AS locked_relation,
  l.mode,
  l.granted,
  a.state,
  a.wait_event_type,
  a.wait_event,
  pg_catalog.now() - a.xact_start AS transaction_age,
  left(a.query, 160) AS query
FROM pg_catalog.pg_locks l
JOIN pg_catalog.pg_stat_activity a ON a.pid = l.pid
JOIN pg_catalog.pg_class c ON c.oid = l.relation
WHERE c.oid IN ('public.media_assets'::regclass, 'public.memories'::regclass)
  AND a.pid <> pg_catalog.pg_backend_pid()
ORDER BY l.granted, a.xact_start NULLS LAST;

DO $$
DECLARE
  has_sha BOOLEAN;
  has_deleted_at BOOLEAN;
  has_creation_key BOOLEAN;
  invalid_status BIGINT;
  invalid_type BIGINT;
  invalid_sha BIGINT := 0;
  active_duplicates BIGINT;
  null_source_keys BIGINT;
  invalid_source_keys BIGINT;
  invalid_target_keys BIGINT := 0;
  idempotency_duplicates BIGINT;
  hash_expression TEXT;
  active_expression TEXT;
  creation_expression TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.media_assets'::regclass AND attname = 'sha256' AND NOT attisdropped
  ) INTO has_sha;
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.media_assets'::regclass AND attname = 'deleted_at' AND NOT attisdropped
  ) INTO has_deleted_at;
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.memories'::regclass AND attname = 'creation_idempotency_key' AND NOT attisdropped
  ) INTO has_creation_key;

  SELECT count(*) INTO invalid_status
  FROM public.media_assets
  WHERE status IS NULL
     OR lower(status) NOT IN ('pending', 'uploaded', 'failed', 'deleted', 'cleanup_failed');

  SELECT count(*) INTO invalid_type
  FROM public.media_assets
  WHERE media_type IS NULL
     OR lower(media_type) NOT IN ('image', 'audio', 'video', 'avatar', 'document');

  IF has_sha THEN
    EXECUTE 'SELECT count(*) FROM public.media_assets WHERE sha256 IS NOT NULL AND sha256 !~ ''^[0-9a-f]{64}$'''
      INTO invalid_sha;
    hash_expression := 'COALESCE(sha256, encode(public.digest(id::text, ''sha256''), ''hex''))';
  ELSE
    hash_expression := 'encode(public.digest(id::text, ''sha256''), ''hex'')';
  END IF;

  active_expression := CASE WHEN has_deleted_at THEN 'deleted_at IS NULL' ELSE 'TRUE' END;
  EXECUTE format(
    'SELECT count(*) FROM (' ||
    ' SELECT user_id, memory_id, lower(media_type), %s' ||
    ' FROM public.media_assets' ||
    ' WHERE %s AND lower(status) IN (''pending'', ''uploaded'')' ||
    ' GROUP BY 1, 2, 3, 4 HAVING count(*) > 1' ||
    ') duplicates', hash_expression, active_expression
  ) INTO active_duplicates;

  SELECT count(*) FILTER (WHERE idempotency_key IS NULL),
         count(*) FILTER (
           WHERE idempotency_key IS NOT NULL
             AND idempotency_key::text !~ '^[A-Za-z0-9._:-]{16,128}$'
         )
  INTO null_source_keys, invalid_source_keys
  FROM public.memories;

  IF has_creation_key THEN
    EXECUTE 'SELECT count(*) FROM public.memories WHERE creation_idempotency_key IS NOT NULL AND creation_idempotency_key !~ ''^[A-Za-z0-9._:-]{16,128}$'''
      INTO invalid_target_keys;
    creation_expression := 'COALESCE(creation_idempotency_key, idempotency_key::text)';
  ELSE
    creation_expression := 'idempotency_key::text';
  END IF;

  EXECUTE format(
    'SELECT count(*) FROM (' ||
    ' SELECT user_id, %s FROM public.memories GROUP BY 1, 2 HAVING count(*) > 1' ||
    ') duplicates', creation_expression
  ) INTO idempotency_duplicates;

  RAISE NOTICE 'invalid_status=%, invalid_media_type=%, invalid_sha256=%, active_duplicates=%',
    invalid_status, invalid_type, invalid_sha, active_duplicates;
  RAISE NOTICE 'null_source_keys=%, invalid_source_keys=%, invalid_target_keys=%, idempotency_duplicates=%',
    null_source_keys, invalid_source_keys, invalid_target_keys, idempotency_duplicates;

  IF invalid_status + invalid_type + invalid_sha + active_duplicates
     + null_source_keys + invalid_source_keys + invalid_target_keys + idempotency_duplicates > 0 THEN
    RAISE EXCEPTION 'Sprint15 preflight failed; no production data was modified';
  END IF;
END;
$$;

SELECT
  n.nspname AS schema_name,
  t.relname AS table_name,
  i.relname AS index_name,
  pg_catalog.pg_get_indexdef(i.oid) AS actual_definition
FROM pg_catalog.pg_class i
JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
JOIN pg_catalog.pg_class t ON t.oid = x.indrelid
WHERE i.relname IN (
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
  pg_catalog.pg_get_constraintdef(c.oid, true) AS actual_definition
FROM pg_catalog.pg_constraint c
JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
WHERE c.conname IN (
  'ck_media_assets_sha256',
  'ck_media_assets_status_v2',
  'ck_media_assets_type_v2',
  'ck_media_assets_upload_attempts',
  'ck_memories_creation_idempotency_key',
  'ck_media_assets_sha256_not_null_migration',
  'ck_memories_creation_key_not_null_migration'
)
ORDER BY c.conname;

ROLLBACK;
