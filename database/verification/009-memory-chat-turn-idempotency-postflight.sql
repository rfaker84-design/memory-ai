BEGIN READ ONLY;

SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  target_oid OID := pg_catalog.to_regclass('public.memory_chat_turns');
  actual_columns TEXT[];
  key_columns TEXT[];
  incomplete_completed BIGINT;
BEGIN
  IF target_oid IS NULL THEN
    RAISE EXCEPTION '009 postflight: public.memory_chat_turns is missing';
  END IF;

  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum)
  INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = target_oid AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM ARRAY[
    'id', 'user_id', 'memory_id', 'conversation_id', 'idempotency_key',
    'request_hash', 'status', 'user_message_id', 'assistant_message_id',
    'created_at', 'updated_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '009 postflight: unexpected memory_chat_turns columns';
  END IF;

  SELECT ARRAY(
    SELECT a.attname
    FROM pg_catalog.pg_index i
    JOIN unnest(i.indkey::SMALLINT[]) WITH ORDINALITY AS key(attnum, position) ON TRUE
    JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
    WHERE i.indexrelid = 'public.ux_memory_chat_turns_owner_key'::regclass
    ORDER BY key.position
  ) INTO key_columns;
  IF key_columns IS DISTINCT FROM ARRAY['user_id', 'memory_id', 'idempotency_key']::TEXT[] THEN
    RAISE EXCEPTION '009 postflight: idempotency index is invalid';
  END IF;

  SELECT count(*) INTO incomplete_completed
  FROM public.memory_chat_turns
  WHERE status = 'completed'
    AND (user_message_id IS NULL OR assistant_message_id IS NULL);
  IF incomplete_completed <> 0 THEN
    RAISE EXCEPTION '009 postflight: completed turn lacks persisted messages';
  END IF;
END;
$$;

COMMIT;
