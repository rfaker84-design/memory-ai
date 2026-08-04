-- Read-only candidate postflight for Migration 022; never an automatic runner input.
BEGIN TRANSACTION READ ONLY;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog, public;
DO $$
DECLARE constraints_ok integer; indexes_ok integer;
BEGIN
  IF pg_catalog.to_regclass('public.content_visibility_holds') IS NULL THEN RAISE EXCEPTION '022 postflight: holds table missing'; END IF;
  SELECT count(*) INTO constraints_ok FROM pg_constraint WHERE conrelid='public.content_visibility_holds'::regclass AND conname IN ('uq_content_visibility_holds_report','ck_content_visibility_holds_status','ck_content_visibility_holds_actor','ck_content_visibility_holds_restore') AND convalidated;
  IF constraints_ok <> 4 THEN RAISE EXCEPTION '022 postflight: hold constraints missing or unvalidated'; END IF;
  SELECT count(*) INTO indexes_ok FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname IN ('ix_content_visibility_holds_active_memory','ix_content_visibility_holds_active_video','ix_content_visibility_holds_active_share') AND i.indisvalid;
  IF indexes_ok <> 3 THEN RAISE EXCEPTION '022 postflight: active-hold indexes missing or invalid'; END IF;
END;
$$;
SELECT count(*) AS invalid_indexes FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid;
SELECT count(*) AS unvalidated_constraints FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated;
COMMIT;
