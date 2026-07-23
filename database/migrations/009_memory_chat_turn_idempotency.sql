BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.users') IS NULL
     OR pg_catalog.to_regclass('public.memories') IS NULL
     OR pg_catalog.to_regclass('public.conversations') IS NULL
     OR pg_catalog.to_regclass('public.messages') IS NULL THEN
    RAISE EXCEPTION '009 requires migrations 001-008';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.memory_chat_turns (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash CHARACTER(64) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  user_message_id UUID,
  assistant_message_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_memory_chat_turns PRIMARY KEY (id),
  CONSTRAINT fk_memory_chat_turns_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_memory_chat_turns_memory
    FOREIGN KEY (memory_id) REFERENCES public.memories(id) ON DELETE CASCADE,
  CONSTRAINT fk_memory_chat_turns_conversation
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_memory_chat_turns_user_message
    FOREIGN KEY (user_message_id) REFERENCES public.messages(id) ON DELETE RESTRICT,
  CONSTRAINT fk_memory_chat_turns_assistant_message
    FOREIGN KEY (assistant_message_id) REFERENCES public.messages(id) ON DELETE RESTRICT,
  CONSTRAINT ck_memory_chat_turns_idempotency_key
    CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_memory_chat_turns_request_hash
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_memory_chat_turns_status
    CHECK (status IN ('pending', 'completed', 'failed')),
  CONSTRAINT ck_memory_chat_turns_completion
    CHECK (
      (status = 'completed' AND user_message_id IS NOT NULL AND assistant_message_id IS NOT NULL)
      OR (status IN ('pending', 'failed') AND user_message_id IS NULL AND assistant_message_id IS NULL)
    )
);

DO $$
DECLARE
  target_oid OID := 'public.memory_chat_turns'::regclass;
  actual_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum)
  INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = target_oid AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM ARRAY[
    'id', 'user_id', 'memory_id', 'conversation_id', 'idempotency_key',
    'request_hash', 'status', 'user_message_id', 'assistant_message_id',
    'created_at', 'updated_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '009 table public.memory_chat_turns has an unexpected column definition';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_memory_chat_turns_owner_key
  ON public.memory_chat_turns (user_id, memory_id, idempotency_key);

DO $$
DECLARE
  target_oid OID := 'public.memory_chat_turns'::regclass;
  index_oid OID := 'public.ux_memory_chat_turns_owner_key'::regclass;
  key_columns TEXT[];
  is_unique BOOLEAN;
  is_valid BOOLEAN;
BEGIN
  SELECT i.indisunique, i.indisvalid,
    ARRAY(
      SELECT a.attname
      FROM unnest(i.indkey::SMALLINT[]) WITH ORDINALITY AS key(attnum, position)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
      ORDER BY key.position
    )
  INTO is_unique, is_valid, key_columns
  FROM pg_catalog.pg_index i
  WHERE i.indexrelid = index_oid AND i.indrelid = target_oid AND i.indpred IS NULL;

  IF NOT FOUND OR NOT is_unique OR NOT is_valid
     OR key_columns IS DISTINCT FROM ARRAY['user_id', 'memory_id', 'idempotency_key']::TEXT[] THEN
    RAISE EXCEPTION '009 index public.ux_memory_chat_turns_owner_key has an unexpected definition';
  END IF;
END;
$$;

COMMIT;
