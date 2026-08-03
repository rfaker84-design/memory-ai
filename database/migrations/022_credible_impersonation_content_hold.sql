-- CANDIDATE ONLY: no automatic runner, Staging, or production approval.
-- A trusted internal reviewer may place a narrowly-scoped, auditable hold on
-- the public surface of an allegedly impersonating TA before full verification.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.user_reports') IS NULL
     OR pg_catalog.to_regclass('public.video_share_links') IS NULL THEN
    RAISE EXCEPTION '022 requires candidate migrations 019 and 021';
  END IF;
END;
$$;

ALTER TABLE public.user_reports DROP CONSTRAINT IF EXISTS ck_user_reports_subject_type;
ALTER TABLE public.user_reports ADD CONSTRAINT ck_user_reports_subject_type
  CHECK (subject_type IN ('memory','media','video','account','payment','public_share','other'));

CREATE TABLE IF NOT EXISTS public.content_visibility_holds (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.user_reports(id) ON DELETE RESTRICT,
  memory_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE RESTRICT,
  video_job_id UUID NOT NULL REFERENCES public.video_generation_jobs(id) ON DELETE RESTRICT,
  share_link_id UUID NOT NULL REFERENCES public.video_share_links(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'hidden',
  applied_by TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restored_by TEXT,
  restored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_content_visibility_holds_report UNIQUE (report_id),
  CONSTRAINT ck_content_visibility_holds_status CHECK (status IN ('hidden','restored')),
  CONSTRAINT ck_content_visibility_holds_actor CHECK (char_length(applied_by) BETWEEN 3 AND 256 AND applied_by !~ '[[:space:]]'),
  CONSTRAINT ck_content_visibility_holds_restore CHECK (
    (status = 'hidden' AND restored_by IS NULL AND restored_at IS NULL)
    OR (status = 'restored' AND char_length(restored_by) BETWEEN 3 AND 256 AND restored_by !~ '[[:space:]]' AND restored_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_content_visibility_holds_active_memory
  ON public.content_visibility_holds (memory_id) WHERE status = 'hidden';
CREATE INDEX IF NOT EXISTS ix_content_visibility_holds_active_video
  ON public.content_visibility_holds (video_job_id) WHERE status = 'hidden';
CREATE INDEX IF NOT EXISTS ix_content_visibility_holds_active_share
  ON public.content_visibility_holds (share_link_id) WHERE status = 'hidden';

COMMIT;
