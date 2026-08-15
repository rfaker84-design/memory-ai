-- CANDIDATE ONLY: apply to Staging only under an explicit deployment change.
-- Add acknowledgement as a fourth durable companion-motion slot. Existing
-- idle/attentive/reflective rows and approved artifacts remain untouched.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.video_generation_jobs') IS NULL THEN
    RAISE EXCEPTION '029 requires video_generation_jobs';
  END IF;
END;
$$;

ALTER TABLE public.video_generation_jobs
  DROP CONSTRAINT IF EXISTS ck_video_generation_jobs_motion_variant;

ALTER TABLE public.video_generation_jobs
  ADD CONSTRAINT ck_video_generation_jobs_motion_variant
    CHECK (
      (use_case = 'first_presence' AND motion_variant IS NULL)
      OR (
        use_case = 'companion_micro_motion'
        AND motion_variant IN ('idle', 'attentive', 'reflective', 'acknowledgement')
      )
    );

COMMIT;
