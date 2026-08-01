-- CANDIDATE ONLY: this migration is deliberately excluded from every automatic
-- migration runner. Staging and production execution require separate approval.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  request_key TEXT NOT NULL,
  category TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id UUID,
  requested_action TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  disposition TEXT,
  handled_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_reports_reporter_request_key UNIQUE (reporter_user_id, request_key),
  CONSTRAINT ck_user_reports_category CHECK (category IN ('rights','privacy','safety','payment','account','other')),
  CONSTRAINT ck_user_reports_subject_type CHECK (subject_type IN ('memory','media','video','account','payment','other')),
  CONSTRAINT ck_user_reports_subject_id CHECK ((subject_type = 'other' AND subject_id IS NULL) OR (subject_type <> 'other' AND subject_id IS NOT NULL)),
  CONSTRAINT ck_user_reports_requested_action CHECK (requested_action IN ('review','remove_content','refund','account_help','other')),
  CONSTRAINT ck_user_reports_details CHECK (char_length(details) BETWEEN 1 AND 2000),
  CONSTRAINT ck_user_reports_status CHECK (status IN ('received','triaged','actioned','closed')),
  CONSTRAINT ck_user_reports_resolution CHECK (
    (status = 'received' AND resolved_at IS NULL AND disposition IS NULL)
    OR (status = 'triaged' AND resolved_at IS NULL AND disposition IS NOT NULL)
    OR (status IN ('actioned','closed') AND resolved_at IS NOT NULL AND disposition IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_created ON public.user_reports (reporter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_reports_queue ON public.user_reports (status, created_at) WHERE status IN ('received', 'triaged');

COMMIT;
