\set ON_ERROR_STOP on

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION '006 preflight requires public.users; apply migrations 001-005 first';
  END IF;
END;
$$;

SELECT
  c.oid::regclass AS table_name,
  s.n_live_tup AS estimated_live_rows,
  s.n_dead_tup AS estimated_dead_rows,
  pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) AS total_size
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('users', 'auth_verification_challenges')
ORDER BY c.relname;

SELECT
  a.pid,
  c.oid::regclass AS locked_relation,
  l.mode,
  l.granted,
  a.state,
  a.wait_event_type,
  a.wait_event
FROM pg_catalog.pg_locks l
JOIN pg_catalog.pg_stat_activity a ON a.pid = l.pid
JOIN pg_catalog.pg_class c ON c.oid = l.relation
WHERE c.oid = 'public.users'::regclass
  AND a.pid <> pg_catalog.pg_backend_pid()
ORDER BY l.granted, a.xact_start NULLS LAST;

SELECT
  to_regclass('public.auth_verification_challenges') AS existing_table,
  to_regclass('public.idx_auth_challenges_phone_created') AS existing_phone_index,
  to_regclass('public.idx_auth_challenges_ip_created') AS existing_ip_index,
  to_regclass('public.idx_auth_challenges_expires_at') AS existing_expiry_index;

ROLLBACK;
