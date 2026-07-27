-- ISOLATED VALIDATION ONLY: production execution requires separate approval.
-- This migration establishes one canonical default conversation per owner-memory.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.users') IS NULL
     OR pg_catalog.to_regclass('public.memories') IS NULL
     OR pg_catalog.to_regclass('public.conversations') IS NULL
     OR pg_catalog.to_regclass('public.messages') IS NULL
     OR pg_catalog.to_regclass('public.memory_first_greetings') IS NULL
     OR pg_catalog.to_regclass('public.memory_chat_turns') IS NULL THEN
    RAISE EXCEPTION '015 requires migrations 001-009';
  END IF;
END;
$$;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
  column_type TEXT;
  nullable BOOLEAN;
BEGIN
  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod), NOT a.attnotnull
    INTO column_type, nullable
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.conversations'::regclass
    AND a.attname = 'is_default'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF column_type IS DISTINCT FROM 'boolean' OR nullable THEN
    RAISE EXCEPTION '015 conversations.is_default has an unexpected definition';
  END IF;
END;
$$;

CREATE TEMP TABLE memoryai_default_conversation_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    c.id AS conversation_id,
    c.user_id,
    c.memory_id,
    FIRST_VALUE(c.id) OVER (
      PARTITION BY c.user_id, c.memory_id
      ORDER BY
        CASE WHEN c.is_default THEN 0 ELSE 1 END,
        CASE WHEN EXISTS (
          SELECT 1
          FROM public.memory_first_greetings greeting
          WHERE greeting.conversation_id = c.id
            AND greeting.status = 'completed'
        ) THEN 0 ELSE 1 END,
        c.created_at ASC,
        c.id ASC
    ) AS canonical_id
  FROM public.conversations c
)
SELECT conversation_id, user_id, memory_id, canonical_id
FROM ranked;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.messages message
    JOIN memoryai_default_conversation_map mapped
      ON mapped.conversation_id = message.conversation_id
    WHERE message.user_id <> mapped.user_id
       OR message.memory_id <> mapped.memory_id
  ) THEN
    RAISE EXCEPTION '015 refuses messages with conversation ownership mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.memory_first_greetings greeting
    JOIN memoryai_default_conversation_map mapped
      ON mapped.conversation_id = greeting.conversation_id
    WHERE greeting.user_id <> mapped.user_id
       OR greeting.memory_id <> mapped.memory_id
  ) THEN
    RAISE EXCEPTION '015 refuses first greetings with conversation ownership mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.memory_chat_turns turn
    JOIN memoryai_default_conversation_map mapped
      ON mapped.conversation_id = turn.conversation_id
    WHERE turn.user_id <> mapped.user_id
       OR turn.memory_id <> mapped.memory_id
  ) THEN
    RAISE EXCEPTION '015 refuses chat turns with conversation ownership mismatch';
  END IF;
END;
$$;

UPDATE public.messages message
SET conversation_id = mapped.canonical_id
FROM memoryai_default_conversation_map mapped
WHERE message.conversation_id = mapped.conversation_id
  AND mapped.conversation_id <> mapped.canonical_id;

UPDATE public.memory_first_greetings greeting
SET conversation_id = mapped.canonical_id
FROM memoryai_default_conversation_map mapped
WHERE greeting.conversation_id = mapped.conversation_id
  AND mapped.conversation_id <> mapped.canonical_id;

UPDATE public.memory_chat_turns turn
SET conversation_id = mapped.canonical_id
FROM memoryai_default_conversation_map mapped
WHERE turn.conversation_id = mapped.conversation_id
  AND mapped.conversation_id <> mapped.canonical_id;

UPDATE public.conversations conversation
SET is_default = (mapped.conversation_id = mapped.canonical_id)
FROM memoryai_default_conversation_map mapped
WHERE conversation.id = mapped.conversation_id
  AND conversation.is_default IS DISTINCT FROM (mapped.conversation_id = mapped.canonical_id);

UPDATE public.conversations conversation
SET last_message_at = latest.latest_message_at
FROM (
  SELECT message.conversation_id, MAX(message.created_at) AS latest_message_at
  FROM public.messages message
  GROUP BY message.conversation_id
) latest
WHERE conversation.id = latest.conversation_id
  AND (conversation.last_message_at IS NULL OR conversation.last_message_at < latest.latest_message_at);

CREATE UNIQUE INDEX IF NOT EXISTS ux_conversations_default_owner_memory
  ON public.conversations (user_id, memory_id)
  WHERE is_default;

DO $$
DECLARE
  index_oid OID := pg_catalog.to_regclass('public.ux_conversations_default_owner_memory');
  key_columns TEXT[];
  is_unique BOOLEAN;
  is_valid BOOLEAN;
  predicate TEXT;
BEGIN
  SELECT
    i.indisunique,
    i.indisvalid,
    pg_catalog.pg_get_expr(i.indpred, i.indrelid),
    ARRAY(
      SELECT a.attname
      FROM unnest(i.indkey::SMALLINT[]) WITH ORDINALITY AS key(attnum, position)
      JOIN pg_catalog.pg_attribute a
        ON a.attrelid = i.indrelid AND a.attnum = key.attnum
      ORDER BY key.position
    )
  INTO is_unique, is_valid, predicate, key_columns
  FROM pg_catalog.pg_index i
  WHERE i.indexrelid = index_oid
    AND i.indrelid = 'public.conversations'::regclass;

  IF NOT FOUND
     OR NOT is_unique
     OR NOT is_valid
     OR key_columns IS DISTINCT FROM ARRAY['user_id', 'memory_id']::TEXT[]
     OR predicate IS DISTINCT FROM 'is_default' THEN
    RAISE EXCEPTION '015 default conversation unique index has an unexpected definition';
  END IF;
END;
$$;

COMMIT;
