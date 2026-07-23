BEGIN READ ONLY;

SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  target_oid OID := pg_catalog.to_regclass('public.long_term_memories');
  actual_columns TEXT[];
  unique_columns TEXT[];
  recall_columns TEXT[];
  recall_options SMALLINT[];
BEGIN
  IF target_oid IS NULL THEN
    RAISE EXCEPTION '007 postflight: public.long_term_memories is missing';
  END IF;

  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum)
  INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = target_oid AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM ARRAY[
    'id', 'memory_id', 'content', 'content_hash', 'source_type', 'source_id',
    'importance', 'tags', 'metadata', 'created_at', 'updated_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '007 postflight: unexpected long_term_memories columns';
  END IF;

  SELECT ARRAY(
    SELECT a.attname
    FROM pg_catalog.pg_index i
    JOIN unnest(i.indkey::SMALLINT[]) WITH ORDINALITY AS key(attnum, position) ON TRUE
    JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
    WHERE i.indexrelid = 'public.uq_long_term_memories_memory_source_hash'::regclass
    ORDER BY key.position
  ) INTO unique_columns;
  IF unique_columns IS DISTINCT FROM ARRAY['memory_id', 'source_type', 'content_hash']::TEXT[] THEN
    RAISE EXCEPTION '007 postflight: content deduplication constraint is invalid';
  END IF;

  SELECT ARRAY(
      SELECT a.attname
      FROM pg_catalog.pg_index i
      JOIN unnest(i.indkey::SMALLINT[]) WITH ORDINALITY AS key(attnum, position) ON TRUE
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
      WHERE i.indexrelid = 'public.idx_long_term_memories_memory_importance_created'::regclass
      ORDER BY key.position
    ), i.indoption
  INTO recall_columns, recall_options
  FROM pg_catalog.pg_index i
  WHERE i.indexrelid = 'public.idx_long_term_memories_memory_importance_created'::regclass;
  IF recall_columns IS DISTINCT FROM ARRAY['memory_id', 'importance', 'created_at']::TEXT[]
     OR recall_options IS DISTINCT FROM ARRAY[0, 3, 3]::SMALLINT[] THEN
    RAISE EXCEPTION '007 postflight: recall index is invalid';
  END IF;
END;
$$;

COMMIT;
