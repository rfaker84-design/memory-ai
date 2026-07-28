-- ISOLATED VALIDATION ONLY: this migration is not approved for production.
-- Production execution or automatic-runner inclusion requires separate Window 1 approval.
-- This uses Migration 014 reservations as the only entitlement ledger.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.users') IS NULL
     OR pg_catalog.to_regclass('public.memories') IS NULL
     OR pg_catalog.to_regclass('public.commerce_generation_reservations') IS NULL THEN
    RAISE EXCEPTION '016 requires core ownership tables and Migration 014 commerce reservations';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.video_generation_jobs (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  reservation_id UUID,
  idempotency_key TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'vidu-cn-q2-pro-fast',
  status TEXT NOT NULL DEFAULT 'queued',
  provider_submission_state TEXT NOT NULL DEFAULT 'not_started',
  provider_task_id TEXT,
  provider_state TEXT,
  input_sha256 CHARACTER(64) NOT NULL,
  actual_credits INTEGER,
  artifact_key TEXT,
  quality_status TEXT NOT NULL DEFAULT 'pending',
  quality_payload JSONB,
  entitlement_settlement TEXT NOT NULL DEFAULT 'reserved',
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_video_generation_jobs PRIMARY KEY (id),
  CONSTRAINT fk_video_generation_jobs_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_video_generation_jobs_memory_user
    FOREIGN KEY (memory_id, user_id) REFERENCES public.memories(id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_video_generation_jobs_reservation_user
    FOREIGN KEY (reservation_id, user_id)
    REFERENCES public.commerce_generation_reservations(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT uq_video_generation_jobs_id_user UNIQUE (id, user_id),
  CONSTRAINT uq_video_generation_jobs_request UNIQUE (user_id, memory_id, idempotency_key),
  CONSTRAINT uq_video_generation_jobs_reservation UNIQUE (reservation_id),
  CONSTRAINT ck_video_generation_jobs_key
    CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_video_generation_jobs_provider
    CHECK (provider = 'vidu-cn-q2-pro-fast'),
  CONSTRAINT ck_video_generation_jobs_status
    CHECK (status IN ('queued', 'submitting', 'submission_uncertain', 'submitted', 'running', 'quality_pending', 'manual_review_required', 'succeeded', 'rejected', 'failed')),
  CONSTRAINT ck_video_generation_jobs_submission
    CHECK (provider_submission_state IN ('not_started', 'submitting', 'accepted', 'uncertain')),
  CONSTRAINT ck_video_generation_jobs_quality
    CHECK (quality_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT ck_video_generation_jobs_settlement
    CHECK (entitlement_settlement IN ('reserved', 'committed', 'released')),
  CONSTRAINT ck_video_generation_jobs_hash
    CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_video_generation_jobs_credits
    CHECK (actual_credits IS NULL OR actual_credits >= 0),
  CONSTRAINT ck_video_generation_jobs_terminal
    CHECK (
      (status = 'succeeded' AND provider_task_id IS NOT NULL AND quality_status = 'approved' AND entitlement_settlement = 'committed')
      OR (status = 'rejected' AND quality_status = 'rejected' AND entitlement_settlement = 'released')
      OR (status = 'failed' AND entitlement_settlement = 'released')
      OR (status IN ('queued', 'submitting', 'submission_uncertain', 'submitted', 'running', 'quality_pending', 'manual_review_required') AND entitlement_settlement = 'reserved')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_video_generation_jobs_provider_task
  ON public.video_generation_jobs (provider, provider_task_id)
  WHERE provider_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_video_generation_jobs_recovery
  ON public.video_generation_jobs (status, updated_at)
  WHERE status IN ('submitting', 'submitted', 'running', 'quality_pending', 'submission_uncertain');
CREATE INDEX IF NOT EXISTS ix_video_generation_jobs_owner_memory
  ON public.video_generation_jobs (user_id, memory_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.video_generation_quality_reviews (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  job_id UUID NOT NULL,
  review_key TEXT NOT NULL,
  reviewer_kind TEXT NOT NULL DEFAULT 'system',
  reviewer_account TEXT,
  reviewed_at TIMESTAMPTZ,
  decision TEXT NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  quality_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_video_generation_quality_reviews PRIMARY KEY (id),
  CONSTRAINT fk_video_generation_quality_reviews_job
    FOREIGN KEY (job_id) REFERENCES public.video_generation_jobs(id) ON DELETE CASCADE,
  CONSTRAINT uq_video_generation_quality_reviews_job_key UNIQUE (job_id, review_key),
  CONSTRAINT ck_video_generation_quality_reviews_key
    CHECK (review_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_video_generation_quality_reviews_kind CHECK (reviewer_kind IN ('system', 'manual')),
  CONSTRAINT ck_video_generation_quality_reviews_reviewer
    CHECK (
      (reviewer_kind = 'system' AND reviewer_account IS NULL)
      OR (reviewer_kind = 'manual' AND reviewer_account ~ '^[^[:space:]]{3,256}$')
    ),
  CONSTRAINT ck_video_generation_quality_reviews_reviewed_at
    CHECK (
      (reviewer_kind = 'system' AND reviewed_at IS NULL)
      OR (reviewer_kind = 'manual' AND reviewed_at IS NOT NULL)
    ),
  CONSTRAINT ck_video_generation_quality_reviews_decision CHECK (decision IN ('pending', 'approved', 'rejected')),
  CONSTRAINT ck_video_generation_quality_reviews_reasons CHECK (jsonb_typeof(reason_codes) = 'array'),
  CONSTRAINT ck_video_generation_quality_reviews_payload CHECK (jsonb_typeof(quality_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS ix_video_generation_quality_reviews_job_created
  ON public.video_generation_quality_reviews (job_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_video_generation_jobs_updated_at ON public.video_generation_jobs;
CREATE TRIGGER trg_video_generation_jobs_updated_at
  BEFORE UPDATE ON public.video_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.memoryai_set_updated_at();

COMMIT;
