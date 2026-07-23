BEGIN READ ONLY;

SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  target_oid OID := pg_catalog.to_regclass('public.memory_first_greetings');
  actual_columns TEXT[];
  key_columns TEXT[];
  greeting_count BIGINT;
BEGIN
  IF target_oid IS NULL THEN
    RAISE EXCEPTION '008 postflight: public.memory_first_greetings is missing';
  END IF;

  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum)
    INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = target_oid AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM ARRAY[
    'id', 'user_id', 'memory_id', 'conversation_id', 'idempotency_key',
    'status', 'assistant_message_id', 'created_at', 'updated_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '008 postflight: unexpected memory_first_greetings columns';
  END IF;

  SELECT ARRAY(
    SELECT a.attname
    FROM pg_catalog.pg_index i
    JOIN unnest(i.indkey::SMALLINT[]) WITH ORDINALITY AS key(attnum, position) ON TRUE
    JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
    WHERE i.indexrelid = 'public.ux_memory_first_greetings_owner_key'::regclass
    ORDER BY key.position
  ) INTO key_columns;
  IF key_columns IS DISTINCT FROM ARRAY['user_id', 'memory_id', 'idempotency_key']::TEXT[] THEN
    RAISE EXCEPTION '008 postflight: idempotency index is invalid';
  END IF;

  SELECT count(*) INTO greeting_count
  FROM public.memory_first_greetings
  WHERE status = 'completed' AND assistant_message_id IS NULL;
  IF greeting_count <> 0 THEN
    RAISE EXCEPTION '008 postflight: completed greeting lacks assistant message';
  END IF;
END;
$$;

COMMIT;
