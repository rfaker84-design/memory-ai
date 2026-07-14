BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  column_name TEXT;
  expected_type TEXT;
  actual_type TEXT;
  actual_not_null BOOLEAN;
  actual_default TEXT;
BEGIN
  IF to_regclass('public.media_assets') IS NULL THEN
    RAISE EXCEPTION '004 requires public.media_assets; apply migrations 001-003 first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.media_assets'::regclass AND attname = 'sha256' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN sha256 CHARACTER(64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.media_assets'::regclass AND attname = 'failure_code' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN failure_code TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.media_assets'::regclass AND attname = 'upload_attempts' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN upload_attempts INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.media_assets'::regclass AND attname = 'deleted_at' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.media_assets'::regclass AND attname = 'cleanup_after' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN cleanup_after TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.media_assets'::regclass AND attname = 'cleaned_at' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN cleaned_at TIMESTAMPTZ;
  END IF;

  FOR column_name, expected_type IN
    SELECT * FROM (VALUES
      ('sha256', 'character(64)'),
      ('failure_code', 'text'),
      ('upload_attempts', 'integer'),
      ('deleted_at', 'timestamp with time zone'),
      ('cleanup_after', 'timestamp with time zone'),
      ('cleaned_at', 'timestamp with time zone')
    ) AS expected(column_name, expected_type)
  LOOP
    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
      INTO actual_type
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.media_assets'::regclass
      AND a.attname = column_name
      AND NOT a.attisdropped;

    IF actual_type IS DISTINCT FROM expected_type THEN
      RAISE EXCEPTION '004 column public.media_assets.% has type %, expected %',
        column_name, actual_type, expected_type;
    END IF;

    SELECT a.attnotnull, pg_catalog.pg_get_expr(d.adbin, d.adrelid)
      INTO actual_not_null, actual_default
    FROM pg_catalog.pg_attribute a
    LEFT JOIN pg_catalog.pg_attrdef d
      ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.media_assets'::regclass
      AND a.attname = column_name
      AND NOT a.attisdropped;

    IF column_name <> 'upload_attempts'
       AND column_name <> 'sha256'
       AND (actual_not_null OR actual_default IS NOT NULL) THEN
      RAISE EXCEPTION '004 column public.media_assets.% has unexpected nullability or default', column_name;
    END IF;

    IF column_name = 'sha256' AND actual_default IS NOT NULL THEN
      RAISE EXCEPTION '004 column public.media_assets.sha256 has unexpected default %', actual_default;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    LEFT JOIN pg_catalog.pg_attrdef d
      ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.media_assets'::regclass
      AND a.attname = 'upload_attempts'
      AND a.attnotnull
      AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) = '0'
  ) THEN
    RAISE EXCEPTION '004 column public.media_assets.upload_attempts must be INTEGER NOT NULL DEFAULT 0';
  END IF;
END;
$$;

DO $$
DECLARE
  invalid_status BIGINT;
  invalid_type BIGINT;
  invalid_sha BIGINT;
  active_duplicates BIGINT;
BEGIN
  SELECT count(*) INTO invalid_status
  FROM public.media_assets
  WHERE status IS NULL
     OR lower(status) NOT IN ('pending', 'uploaded', 'failed', 'deleted', 'cleanup_failed');

  SELECT count(*) INTO invalid_type
  FROM public.media_assets
  WHERE media_type IS NULL
     OR lower(media_type) NOT IN ('image', 'audio', 'video', 'avatar', 'document');

  SELECT count(*) INTO invalid_sha
  FROM public.media_assets
  WHERE sha256 IS NOT NULL AND sha256 !~ '^[0-9a-f]{64}$';

  SELECT count(*) INTO active_duplicates
  FROM (
    SELECT user_id, memory_id, lower(media_type),
      COALESCE(sha256, encode(public.digest(id::text, 'sha256'), 'hex'))
    FROM public.media_assets
    WHERE deleted_at IS NULL AND lower(status) IN ('pending', 'uploaded')
    GROUP BY 1, 2, 3, 4
    HAVING count(*) > 1
  ) duplicates;

  IF invalid_status > 0 THEN
    RAISE EXCEPTION '004 preflight failed: % media_assets rows have unsupported status values', invalid_status;
  END IF;
  IF invalid_type > 0 THEN
    RAISE EXCEPTION '004 preflight failed: % media_assets rows have unsupported media_type values', invalid_type;
  END IF;
  IF invalid_sha > 0 THEN
    RAISE EXCEPTION '004 preflight failed: % media_assets rows have invalid sha256 values', invalid_sha;
  END IF;
  IF active_duplicates > 0 THEN
    RAISE EXCEPTION '004 preflight failed: % active media hash groups violate target uniqueness', active_duplicates;
  END IF;
END;
$$;

UPDATE public.media_assets
SET sha256 = encode(public.digest(id::text, 'sha256'), 'hex')
WHERE sha256 IS NULL;

UPDATE public.media_assets
SET media_type = lower(media_type),
    status = lower(status)
WHERE media_type IS DISTINCT FROM lower(media_type)
   OR status IS DISTINCT FROM lower(status);

DO $$
DECLARE
  target_oid OID := 'public.media_assets'::regclass;
  constraint_oid OID;
  definition TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = target_oid AND attname = 'sha256' AND attnotnull
  ) THEN
    SELECT c.oid INTO constraint_oid
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::regnamespace
      AND c.conname = 'ck_media_assets_sha256_not_null_migration';

    IF constraint_oid IS NULL THEN
      ALTER TABLE public.media_assets
        ADD CONSTRAINT ck_media_assets_sha256_not_null_migration
        CHECK (sha256 IS NOT NULL) NOT VALID;
    ELSE
      SELECT pg_catalog.regexp_replace(
        pg_catalog.pg_get_expr(c.conbin, c.conrelid), '\s+', '', 'g'
      ) INTO definition
      FROM pg_catalog.pg_constraint c
      WHERE c.oid = constraint_oid AND c.conrelid = target_oid AND c.contype = 'c';

      IF definition IS DISTINCT FROM '(sha256ISNOTNULL)' THEN
        RAISE EXCEPTION '004 constraint public.ck_media_assets_sha256_not_null_migration has an unexpected owner or definition';
      END IF;
    END IF;

    ALTER TABLE public.media_assets
      VALIDATE CONSTRAINT ck_media_assets_sha256_not_null_migration;
    ALTER TABLE public.media_assets ALTER COLUMN sha256 SET NOT NULL;
    ALTER TABLE public.media_assets
      DROP CONSTRAINT ck_media_assets_sha256_not_null_migration;
  END IF;
END;
$$;

DO $$
DECLARE
  index_oid OID;
  key_columns TEXT[];
  predicate TEXT;
  is_unique BOOLEAN;
  is_valid BOOLEAN;
BEGIN
  index_oid := to_regclass('public.ux_media_assets_active_hash');
  IF index_oid IS NULL THEN
    CREATE UNIQUE INDEX ux_media_assets_active_hash
      ON public.media_assets (user_id, memory_id, media_type, sha256)
      WHERE deleted_at IS NULL AND status IN ('pending', 'uploaded');
    index_oid := 'public.ux_media_assets_active_hash'::regclass;
  END IF;

  SELECT i.indisunique, i.indisvalid,
    ARRAY(
      SELECT a.attname
      FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS key(attnum, position)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
      ORDER BY key.position
    ),
    pg_catalog.regexp_replace(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '\s+', '', 'g')
  INTO is_unique, is_valid, key_columns, predicate
  FROM pg_catalog.pg_index i
  WHERE i.indexrelid = index_oid AND i.indrelid = 'public.media_assets'::regclass;

  IF NOT FOUND OR NOT is_unique OR NOT is_valid
     OR key_columns IS DISTINCT FROM ARRAY['user_id', 'memory_id', 'media_type', 'sha256']::TEXT[]
     OR predicate IS DISTINCT FROM '((deleted_atISNULL)AND(status=ANY(ARRAY[''pending''::text,''uploaded''::text])))' THEN
    RAISE EXCEPTION '004 index public.ux_media_assets_active_hash has an unexpected owner or definition';
  END IF;

  index_oid := to_regclass('public.idx_media_assets_cleanup');
  IF index_oid IS NULL THEN
    CREATE INDEX idx_media_assets_cleanup
      ON public.media_assets (cleanup_after ASC)
      WHERE status IN ('deleted', 'cleanup_failed') AND cleaned_at IS NULL;
    index_oid := 'public.idx_media_assets_cleanup'::regclass;
  END IF;

  SELECT i.indisunique, i.indisvalid,
    ARRAY(
      SELECT a.attname
      FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS key(attnum, position)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
      ORDER BY key.position
    ),
    pg_catalog.regexp_replace(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '\s+', '', 'g')
  INTO is_unique, is_valid, key_columns, predicate
  FROM pg_catalog.pg_index i
  WHERE i.indexrelid = index_oid AND i.indrelid = 'public.media_assets'::regclass;

  IF NOT FOUND OR is_unique OR NOT is_valid
     OR key_columns IS DISTINCT FROM ARRAY['cleanup_after']::TEXT[]
     OR predicate IS DISTINCT FROM '((status=ANY(ARRAY[''deleted''::text,''cleanup_failed''::text]))AND(cleaned_atISNULL))' THEN
    RAISE EXCEPTION '004 index public.idx_media_assets_cleanup has an unexpected owner or definition';
  END IF;
END;
$$;

DO $$
DECLARE
  target_oid OID := 'public.media_assets'::regclass;
  constraint_name TEXT;
  expected_definition TEXT;
  constraint_oid OID;
  actual_definition TEXT;
BEGIN
  FOR constraint_name, expected_definition IN
    SELECT * FROM (VALUES
      ('ck_media_assets_sha256', '(sha256~''^[0-9a-f]{64}$''::text)'),
      ('ck_media_assets_status_v2', '(status=ANY(ARRAY[''pending''::text,''uploaded''::text,''failed''::text,''deleted''::text,''cleanup_failed''::text]))'),
      ('ck_media_assets_type_v2', '(media_type=ANY(ARRAY[''image''::text,''audio''::text,''video''::text,''avatar''::text,''document''::text]))'),
      ('ck_media_assets_upload_attempts', '(upload_attempts>=0)')
    ) AS expected(constraint_name, expected_definition)
  LOOP
    SELECT c.oid INTO constraint_oid
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::regnamespace AND c.conname = constraint_name;

    IF constraint_oid IS NULL THEN
      CASE constraint_name
        WHEN 'ck_media_assets_sha256' THEN
          ALTER TABLE public.media_assets ADD CONSTRAINT ck_media_assets_sha256
            CHECK (sha256 ~ '^[0-9a-f]{64}$') NOT VALID;
        WHEN 'ck_media_assets_status_v2' THEN
          ALTER TABLE public.media_assets ADD CONSTRAINT ck_media_assets_status_v2
            CHECK (status IN ('pending', 'uploaded', 'failed', 'deleted', 'cleanup_failed')) NOT VALID;
        WHEN 'ck_media_assets_type_v2' THEN
          ALTER TABLE public.media_assets ADD CONSTRAINT ck_media_assets_type_v2
            CHECK (media_type IN ('image', 'audio', 'video', 'avatar', 'document')) NOT VALID;
        WHEN 'ck_media_assets_upload_attempts' THEN
          ALTER TABLE public.media_assets ADD CONSTRAINT ck_media_assets_upload_attempts
            CHECK (upload_attempts >= 0) NOT VALID;
      END CASE;
    ELSE
      SELECT pg_catalog.regexp_replace(
        pg_catalog.pg_get_expr(c.conbin, c.conrelid), '\s+', '', 'g'
      ) INTO actual_definition
      FROM pg_catalog.pg_constraint c
      WHERE c.oid = constraint_oid AND c.conrelid = target_oid AND c.contype = 'c';

      IF constraint_name = 'ck_media_assets_sha256'
         AND actual_definition NOT IN (
           '(sha256~''^[0-9a-f]{64}$''::text)',
           '((sha256)::text~''^[0-9a-f]{64}$''::text)'
         ) THEN
        RAISE EXCEPTION '004 constraint public.% has an unexpected owner or definition', constraint_name;
      ELSIF constraint_name <> 'ck_media_assets_sha256'
         AND actual_definition IS DISTINCT FROM expected_definition THEN
        RAISE EXCEPTION '004 constraint public.% has an unexpected owner or definition', constraint_name;
      END IF;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.media_assets VALIDATE CONSTRAINT %I', constraint_name
    );
  END LOOP;
END;
$$;

COMMIT;
