\set ON_ERROR_STOP on

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  required_table TEXT;
  required_index TEXT;
  required_constraint TEXT;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'users', 'memories', 'memory_fragments', 'conversations', 'messages',
    'media_assets', 'consent_records', 'provider_jobs', 'audit_logs'
  ] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', required_table)) IS NULL THEN
      RAISE EXCEPTION '001-003 postflight missing public.%', required_table;
    END IF;
  END LOOP;

  IF pg_catalog.to_regprocedure('public.memoryai_set_updated_at()') IS NULL THEN
    RAISE EXCEPTION '001-003 postflight missing public.memoryai_set_updated_at()';
  END IF;

  FOREACH required_index IN ARRAY ARRAY[
    'ux_users_external_id', 'ux_memories_idempotency',
    'idx_messages_conversation_time', 'idx_media_assets_memory'
  ] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', required_index)) IS NULL THEN
      RAISE EXCEPTION '001-003 postflight missing public.%', required_index;
    END IF;
  END LOOP;

  FOREACH required_constraint IN ARRAY ARRAY[
    'fk_memories_user', 'fk_conversations_user', 'fk_conversations_memory',
    'fk_messages_conversation', 'fk_media_assets_user', 'fk_media_assets_memory',
    'ck_memories_name', 'ck_messages_role', 'ck_media_assets_size'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.connamespace = 'public'::pg_catalog.regnamespace
        AND c.conname = required_constraint
        AND c.convalidated
    ) THEN
      RAISE EXCEPTION '001-003 postflight missing or unvalidated public.%', required_constraint;
    END IF;
  END LOOP;
END;
$$;

SELECT
  pg_catalog.current_setting('server_version') AS server_version,
  (SELECT count(*) FROM pg_catalog.pg_class c
   WHERE c.relnamespace = 'public'::pg_catalog.regnamespace
     AND c.relkind = 'r') AS public_table_count,
  (SELECT count(*) FROM pg_catalog.pg_index i
   JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
   WHERE c.relnamespace = 'public'::pg_catalog.regnamespace
     AND i.indisvalid) AS valid_index_count;

ROLLBACK;
