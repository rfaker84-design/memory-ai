BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  actual_type TEXT;
  source_type TEXT;
  source_not_null BOOLEAN;
  target_default TEXT;
BEGIN
  IF to_regclass('public.memories') IS NULL THEN
    RAISE EXCEPTION '005 requires public.memories; apply migrations 001-004 first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.memories'::regclass
      AND attname = 'idempotency_key'
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION '005 requires public.memories.idempotency_key from migration 001';
  END IF;


  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull
    INTO source_type, source_not_null
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.memories'::regclass
    AND a.attname = 'idempotency_key'
    AND NOT a.attisdropped;

  IF source_type IS DISTINCT FROM 'character(64)' OR NOT source_not_null THEN
    RAISE EXCEPTION '005 source public.memories.idempotency_key must be CHARACTER(64) NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.memories'::regclass
      AND attname = 'creation_idempotency_key'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE public.memories ADD COLUMN creation_idempotency_key TEXT;
  END IF;

  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO actual_type
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.memories'::regclass
    AND a.attname = 'creation_idempotency_key'
    AND NOT a.attisdropped;

  IF actual_type IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION '005 column public.memories.creation_idempotency_key has type %, expected text', actual_type;
  END IF;


  SELECT pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    INTO target_default
  FROM pg_catalog.pg_attribute a
  LEFT JOIN pg_catalog.pg_attrdef d
    ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.memories'::regclass
    AND a.attname = 'creation_idempotency_key'
    AND NOT a.attisdropped;

  IF target_default IS NOT NULL THEN
    RAISE EXCEPTION '005 column public.memories.creation_idempotency_key has unexpected default %', target_default;
  END IF;
END;
$$;

DO $$
DECLARE
  null_source_keys BIGINT;
  invalid_source_keys BIGINT;
  invalid_target_keys BIGINT;
  target_duplicates BIGINT;
BEGIN
  SELECT count(*) FILTER (WHERE idempotency_key IS NULL),
         count(*) FILTER (
           WHERE idempotency_key IS NOT NULL
             AND idempotency_key::text !~ '^[A-Za-z0-9._:-]{16,128}$'
         )
  INTO null_source_keys, invalid_source_keys
  FROM public.memories
  WHERE creation_idempotency_key IS NULL;

  SELECT count(*) INTO invalid_target_keys
  FROM public.memories
  WHERE creation_idempotency_key IS NOT NULL
    AND creation_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$';

  SELECT count(*) INTO target_duplicates
  FROM (
    SELECT user_id, COALESCE(creation_idempotency_key, idempotency_key::text)
    FROM public.memories
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) duplicates;

  IF null_source_keys > 0 THEN
    RAISE EXCEPTION '005 preflight failed: % rows needing backfill have NULL source idempotency_key', null_source_keys;
  END IF;
  IF invalid_source_keys > 0 THEN
    RAISE EXCEPTION '005 preflight failed: % source idempotency keys have invalid format', invalid_source_keys;
  END IF;
  IF invalid_target_keys > 0 THEN
    RAISE EXCEPTION '005 preflight failed: % existing creation idempotency keys have invalid format', invalid_target_keys;
  END IF;
  IF target_duplicates > 0 THEN
    RAISE EXCEPTION '005 preflight failed: % creation idempotency groups violate target uniqueness', target_duplicates;
  END IF;
END;
$$;

UPDATE public.memories
SET creation_idempotency_key = idempotency_key::text
WHERE creation_idempotency_key IS NULL;

DO $$
DECLARE
  target_oid OID := 'public.memories'::regclass;
  constraint_oid OID;
  definition TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = target_oid AND attname = 'creation_idempotency_key' AND attnotnull
  ) THEN
    SELECT c.oid INTO constraint_oid
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::regnamespace
      AND c.conname = 'ck_memories_creation_key_not_null_migration';

    IF constraint_oid IS NULL THEN
      ALTER TABLE public.memories
        ADD CONSTRAINT ck_memories_creation_key_not_null_migration
        CHECK (creation_idempotency_key IS NOT NULL) NOT VALID;
    ELSE
      SELECT pg_catalog.regexp_replace(
        pg_catalog.pg_get_expr(c.conbin, c.conrelid), '\s+', '', 'g'
      ) INTO definition
      FROM pg_catalog.pg_constraint c
      WHERE c.oid = constraint_oid AND c.conrelid = target_oid AND c.contype = 'c';

      IF definition IS DISTINCT FROM '(creation_idempotency_keyISNOTNULL)' THEN
        RAISE EXCEPTION '005 constraint public.ck_memories_creation_key_not_null_migration has an unexpected owner or definition';
      END IF;
    END IF;

    ALTER TABLE public.memories
      VALIDATE CONSTRAINT ck_memories_creation_key_not_null_migration;
    ALTER TABLE public.memories ALTER COLUMN creation_idempotency_key SET NOT NULL;
    ALTER TABLE public.memories
      DROP CONSTRAINT ck_memories_creation_key_not_null_migration;
  END IF;
END;
$$;

DO $$
DECLARE
  index_oid OID := to_regclass('public.ux_memories_creation_idempotency');
  key_columns TEXT[];
  is_unique BOOLEAN;
  is_valid BOOLEAN;
BEGIN
  IF index_oid IS NULL THEN
    CREATE UNIQUE INDEX ux_memories_creation_idempotency
      ON public.memories (user_id, creation_idempotency_key);
    index_oid := 'public.ux_memories_creation_idempotency'::regclass;
  END IF;

  SELECT i.indisunique, i.indisvalid,
    ARRAY(
      SELECT a.attname
      FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS key(attnum, position)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
      ORDER BY key.position
    )
  INTO is_unique, is_valid, key_columns
  FROM pg_catalog.pg_index i
  WHERE i.indexrelid = index_oid AND i.indrelid = 'public.memories'::regclass
    AND i.indpred IS NULL;

  IF NOT FOUND OR NOT is_unique OR NOT is_valid
     OR key_columns IS DISTINCT FROM ARRAY['user_id', 'creation_idempotency_key']::TEXT[] THEN
    RAISE EXCEPTION '005 index public.ux_memories_creation_idempotency has an unexpected owner or definition';
  END IF;
END;
$$;

DO $$
DECLARE
  target_oid OID := 'public.memories'::regclass;
  constraint_oid OID;
  actual_definition TEXT;
BEGIN
  SELECT c.oid INTO constraint_oid
  FROM pg_catalog.pg_constraint c
  WHERE c.connamespace = 'public'::regnamespace
    AND c.conname = 'ck_memories_creation_idempotency_key';

  IF constraint_oid IS NULL THEN
    ALTER TABLE public.memories
      ADD CONSTRAINT ck_memories_creation_idempotency_key
      CHECK (creation_idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$') NOT VALID;
  ELSE
    SELECT pg_catalog.regexp_replace(
      pg_catalog.pg_get_expr(c.conbin, c.conrelid), '\s+', '', 'g'
    ) INTO actual_definition
    FROM pg_catalog.pg_constraint c
    WHERE c.oid = constraint_oid AND c.conrelid = target_oid AND c.contype = 'c';

    IF actual_definition IS DISTINCT FROM '(creation_idempotency_key~''^[A-Za-z0-9._:-]{16,128}$''::text)' THEN
      RAISE EXCEPTION '005 constraint public.ck_memories_creation_idempotency_key has an unexpected owner or definition';
    END IF;
  END IF;

  ALTER TABLE public.memories
    VALIDATE CONSTRAINT ck_memories_creation_idempotency_key;
END;
$$;

COMMIT;
