BEGIN READ ONLY;

SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  target_oid OID := pg_catalog.to_regclass('public.long_term_memories');
  actual_columns TEXT[];
  unique_columns TEXT[];
  recall_columns TEXT[];
  recall_options SMALLINT[];
  recall_key_count SMALLINT;
  recall_total_count SMALLINT;
  recall_is_unique BOOLEAN;
  recall_is_primary BOOLEAN;
  recall_is_valid BOOLEAN;
  recall_is_ready BOOLEAN;
  recall_is_live BOOLEAN;
  recall_access_method TEXT;
  recall_has_predicate BOOLEAN;
  recall_has_expression BOOLEAN;
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

  SELECT i.indisunique, i.indisprimary, i.indisvalid, i.indisready, i.indislive,
      am.amname, i.indpred IS NOT NULL, i.indexprs IS NOT NULL,
      i.indnkeyatts, i.indnatts,
      ARRAY(
      SELECT a.attname
      FROM pg_catalog.generate_series(0, i.indnkeyatts - 1) AS key(position)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[key.position]
      ORDER BY key.position
    ), ARRAY(
      SELECT i.indoption[key.position]::SMALLINT
      FROM pg_catalog.generate_series(0, i.indnkeyatts - 1) AS key(position)
      ORDER BY key.position
    )
  INTO recall_is_unique, recall_is_primary, recall_is_valid, recall_is_ready, recall_is_live,
    recall_access_method, recall_has_predicate, recall_has_expression,
    recall_key_count, recall_total_count, recall_columns, recall_options
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class index_class ON index_class.oid = i.indexrelid
  JOIN pg_catalog.pg_am am ON am.oid = index_class.relam
  WHERE i.indexrelid = 'public.idx_long_term_memories_memory_importance_created'::regclass
    AND i.indrelid = target_oid;
  IF NOT FOUND OR recall_is_unique OR recall_is_primary OR NOT recall_is_valid
     OR NOT recall_is_ready OR NOT recall_is_live
     OR recall_access_method IS DISTINCT FROM 'btree'
     OR recall_has_predicate OR recall_has_expression
     OR recall_key_count IS DISTINCT FROM 3 OR recall_total_count IS DISTINCT FROM 3
     OR recall_columns IS DISTINCT FROM ARRAY['memory_id', 'importance', 'created_at']::TEXT[]
     OR recall_options IS DISTINCT FROM ARRAY[0, 3, 3]::SMALLINT[] THEN
    RAISE EXCEPTION '007 postflight: recall index is invalid';
  END IF;
END;
$$;

COMMIT;
