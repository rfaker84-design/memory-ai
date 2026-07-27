BEGIN READ ONLY;

SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  default_column_exists BOOLEAN;
  default_index_valid BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid = 'public.conversations'::regclass
      AND attribute.attname = 'is_default'
      AND attribute.atttypid = 'pg_catalog.bool'::regtype
      AND attribute.attnotnull
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) INTO default_column_exists;

  IF NOT default_column_exists THEN
    RAISE EXCEPTION '015 postflight: conversations.is_default is missing or invalid';
  END IF;

  SELECT i.indisvalid AND i.indisready AND i.indisunique
    INTO default_index_valid
  FROM pg_catalog.pg_index i
  WHERE i.indexrelid = 'public.ux_conversations_default_owner_memory'::regclass
    AND i.indrelid = 'public.conversations'::regclass
    AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) = 'is_default';

  IF NOT COALESCE(default_index_valid, FALSE) THEN
    RAISE EXCEPTION '015 postflight: canonical default conversation index is invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.conversations
    GROUP BY user_id, memory_id
    HAVING COUNT(*) FILTER (WHERE is_default) <> 1
  ) THEN
    RAISE EXCEPTION '015 postflight: owner-memory has multiple default conversations';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.messages message
    JOIN public.conversations conversation ON conversation.id = message.conversation_id
    WHERE message.user_id <> conversation.user_id
       OR message.memory_id <> conversation.memory_id
  ) THEN
    RAISE EXCEPTION '015 postflight: message conversation ownership mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.memory_first_greetings greeting
    JOIN public.conversations conversation ON conversation.id = greeting.conversation_id
    WHERE greeting.user_id <> conversation.user_id
       OR greeting.memory_id <> conversation.memory_id
  ) THEN
    RAISE EXCEPTION '015 postflight: first greeting conversation ownership mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.memory_chat_turns turn
    JOIN public.conversations conversation ON conversation.id = turn.conversation_id
    WHERE turn.user_id <> conversation.user_id
       OR turn.memory_id <> conversation.memory_id
  ) THEN
    RAISE EXCEPTION '015 postflight: chat turn conversation ownership mismatch';
  END IF;
END;
$$;

SELECT
  pg_catalog.current_setting('server_version') AS server_version,
  COUNT(*) FILTER (WHERE is_default) AS canonical_default_session_count
FROM public.conversations;

COMMIT;
