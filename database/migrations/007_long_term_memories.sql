BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.memories') IS NULL THEN
    RAISE EXCEPTION '007 requires public.memories; apply migrations 001-006 first';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.long_term_memories (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  memory_id UUID NOT NULL,
  content TEXT NOT NULL,
  content_hash CHARACTER(64) NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  importance INTEGER NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_long_term_memories PRIMARY KEY (id),
  CONSTRAINT fk_long_term_memories_memory
    FOREIGN KEY (memory_id) REFERENCES public.memories(id) ON DELETE CASCADE,
  CONSTRAINT uq_long_term_memories_memory_source_hash
    UNIQUE (memory_id, source_type, content_hash),
  CONSTRAINT ck_long_term_memories_content CHECK (char_length(content) > 0),
  CONSTRAINT ck_long_term_memories_content_hash CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_long_term_memories_source_type CHECK (char_length(source_type) > 0),
  CONSTRAINT ck_long_term_memories_importance CHECK (importance BETWEEN 0 AND 100)
);

DO $$
DECLARE
  target_oid OID := 'public.long_term_memories'::regclass;
  actual_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum)
  INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = target_oid AND a.attnum > 0 AND NOT a.attisdropped;

  IF actual_columns IS DISTINCT FROM ARRAY[
    'id', 'memory_id', 'content', 'content_hash', 'source_type', 'source_id',
    'importance', 'tags', 'metadata', 'created_at', 'updated_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '007 table public.long_term_memories has an unexpected column definition';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_long_term_memories_memory_importance_created
  ON public.long_term_memories (memory_id, importance DESC, created_at DESC);

DO $$
DECLARE
  target_oid OID := 'public.long_term_memories'::regclass;
  index_oid OID := 'public.idx_long_term_memories_memory_importance_created'::regclass;
  key_columns TEXT[];
  key_options SMALLINT[];
  key_count SMALLINT;
  total_count SMALLINT;
  is_unique BOOLEAN;
  is_valid BOOLEAN;
  is_ready BOOLEAN;
  is_live BOOLEAN;
  is_primary BOOLEAN;
  access_method TEXT;
  has_predicate BOOLEAN;
  has_expression BOOLEAN;
BEGIN
  SELECT i.indisunique, i.indisvalid, i.indisready, i.indislive, i.indisprimary,
    am.amname, i.indpred IS NOT NULL, i.indexprs IS NOT NULL,
    i.indnkeyatts, i.indnatts,
    ARRAY(
      SELECT a.attname
      FROM pg_catalog.generate_series(0, i.indnkeyatts - 1) AS key(position)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[key.position]
      ORDER BY key.position
    ),
    ARRAY(
      SELECT i.indoption[key.position]::SMALLINT
      FROM pg_catalog.generate_series(0, i.indnkeyatts - 1) AS key(position)
      ORDER BY key.position
    )
  INTO is_unique, is_valid, is_ready, is_live, is_primary,
    access_method, has_predicate, has_expression, key_count, total_count,
    key_columns, key_options
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class index_class ON index_class.oid = i.indexrelid
  JOIN pg_catalog.pg_am am ON am.oid = index_class.relam
  WHERE i.indexrelid = index_oid AND i.indrelid = target_oid AND i.indpred IS NULL;

  IF NOT FOUND OR is_unique OR is_primary OR NOT is_valid OR NOT is_ready OR NOT is_live
     OR access_method IS DISTINCT FROM 'btree' OR has_predicate OR has_expression
     OR key_count IS DISTINCT FROM 3 OR total_count IS DISTINCT FROM 3
     OR key_columns IS DISTINCT FROM ARRAY['memory_id', 'importance', 'created_at']::TEXT[]
     OR key_options IS DISTINCT FROM ARRAY[0, 3, 3]::SMALLINT[] THEN
    RAISE EXCEPTION '007 index public.idx_long_term_memories_memory_importance_created has an unexpected definition';
  END IF;
END;
$$;

COMMIT;
