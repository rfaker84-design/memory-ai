-- Candidate-only, read-only verification for Migration 021.
BEGIN READ ONLY;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.video_share_links') IS NULL THEN
    RAISE EXCEPTION 'video_share_links is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid) THEN
    RAISE EXCEPTION 'an invalid public index remains';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated) THEN
    RAISE EXCEPTION 'an unvalidated public constraint remains';
  END IF;
  IF EXISTS (SELECT 1 FROM public.video_share_links s JOIN public.video_generation_jobs j ON j.id=s.video_job_id WHERE s.user_id<>j.user_id OR s.memory_id<>j.memory_id) THEN
    RAISE EXCEPTION 'a share link does not match its owner video job';
  END IF;
END;
$$;

COMMIT;
