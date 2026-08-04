-- Read-only candidate postflight for Migration 027.
-- It is intentionally not an automatic migration runner input.
BEGIN TRANSACTION READ ONLY;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  preference_column integer;
BEGIN
  IF pg_catalog.to_regclass('public.notification_preferences') IS NULL THEN
    RAISE EXCEPTION '027 postflight: notification_preferences missing';
  END IF;

  SELECT count(*) INTO preference_column
    FROM pg_attribute
   WHERE attrelid='public.notification_preferences'::regclass
     AND attname='greeting_notifications_enabled'
     AND NOT attisdropped
     AND atttypid='pg_catalog.bool'::regtype;
  IF preference_column <> 1 THEN
    RAISE EXCEPTION '027 postflight: greeting preference column missing or invalid';
  END IF;
END;
$$;

SELECT count(*) AS invalid_indexes
  FROM pg_index i
  JOIN pg_class c ON c.oid=i.indexrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT i.indisvalid;

SELECT count(*) AS unvalidated_constraints
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid=c.connamespace
 WHERE n.nspname='public' AND NOT c.convalidated;

COMMIT;
