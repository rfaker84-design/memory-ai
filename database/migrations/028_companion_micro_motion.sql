-- CANDIDATE ONLY: apply to Staging only under an explicit deployment change.
-- This extends the existing video ledger; it does not create a second video system.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.video_generation_jobs') IS NULL
     OR pg_catalog.to_regclass('public.commerce_orders') IS NULL
     OR pg_catalog.to_regclass('public.commerce_credit_lots') IS NULL THEN
    RAISE EXCEPTION '028 requires video_generation_jobs and the current Commerce ledger';
  END IF;
END;
$$;

ALTER TABLE public.video_generation_jobs
  ADD COLUMN IF NOT EXISTS use_case TEXT NOT NULL DEFAULT 'first_presence',
  ADD COLUMN IF NOT EXISTS motion_variant TEXT,
  ADD COLUMN IF NOT EXISTS pack_version SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE public.video_generation_jobs
  DROP CONSTRAINT IF EXISTS ck_video_generation_jobs_use_case,
  DROP CONSTRAINT IF EXISTS ck_video_generation_jobs_motion_variant,
  DROP CONSTRAINT IF EXISTS ck_video_generation_jobs_pack_version,
  DROP CONSTRAINT IF EXISTS ck_video_generation_jobs_micro_no_reservation;

ALTER TABLE public.video_generation_jobs
  ADD CONSTRAINT ck_video_generation_jobs_use_case
    CHECK (use_case IN ('first_presence', 'companion_micro_motion')),
  ADD CONSTRAINT ck_video_generation_jobs_motion_variant
    CHECK (
      (use_case = 'first_presence' AND motion_variant IS NULL)
      OR (
        use_case = 'companion_micro_motion'
        AND motion_variant IN ('idle', 'attentive', 'reflective')
      )
    ),
  ADD CONSTRAINT ck_video_generation_jobs_pack_version
    CHECK (pack_version BETWEEN 1 AND 32767),
  ADD CONSTRAINT ck_video_generation_jobs_micro_no_reservation
    CHECK (use_case <> 'companion_micro_motion' OR reservation_id IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS ux_video_generation_jobs_micro_motion_slot
  ON public.video_generation_jobs
    (user_id, memory_id, pack_version, motion_variant)
  WHERE use_case = 'companion_micro_motion';

CREATE INDEX IF NOT EXISTS ix_video_generation_jobs_micro_motion_owner
  ON public.video_generation_jobs
    (user_id, memory_id, pack_version, status, created_at DESC)
  WHERE use_case = 'companion_micro_motion';

CREATE TABLE IF NOT EXISTS public.companion_motion_review_grants (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  grant_key TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_companion_motion_review_grants PRIMARY KEY (id),
  CONSTRAINT fk_companion_motion_review_grants_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_companion_motion_review_grants_memory_user
    FOREIGN KEY (memory_id, user_id)
    REFERENCES public.memories(id, user_id) ON DELETE CASCADE,
  CONSTRAINT uq_companion_motion_review_grants_key
    UNIQUE (user_id, memory_id, grant_key),
  CONSTRAINT ck_companion_motion_review_grants_key
    CHECK (char_length(grant_key) BETWEEN 16 AND 128 AND grant_key ~ '^[-A-Za-z0-9._:]+$'),
  CONSTRAINT ck_companion_motion_review_grants_actor
    CHECK (char_length(granted_by) BETWEEN 3 AND 256 AND granted_by !~ '[[:space:]]'),
  CONSTRAINT ck_companion_motion_review_grants_reason
    CHECK (char_length(reason) BETWEEN 1 AND 1000),
  CONSTRAINT ck_companion_motion_review_grants_window
    CHECK (expires_at > starts_at AND expires_at <= starts_at + INTERVAL '24 hours'),
  CONSTRAINT ck_companion_motion_review_grants_revoke
    CHECK (revoked_at IS NULL OR revoked_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS ix_companion_motion_review_grants_active
  ON public.companion_motion_review_grants (user_id, memory_id, expires_at)
  WHERE revoked_at IS NULL;

-- The caller controls p_allow_staging_review. Application code passes true
-- only in a production-built Staging runtime with an explicit server flag;
-- Production always passes false, so even copied grant rows are inert there.
CREATE OR REPLACE FUNCTION public.memoryai_companion_motion_eligible(
  p_user_id UUID,
  p_memory_id UUID,
  p_allow_staging_review BOOLEAN,
  p_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.memories m
    WHERE m.id = p_memory_id
      AND m.user_id = p_user_id
      AND m.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public.commerce_orders o
          JOIN public.commerce_credit_lots l
            ON l.user_id = o.user_id
           AND l.source_kind = 'paid_package'
           AND l.source_key = o.id::text
          WHERE o.user_id = p_user_id
            AND o.status = 'paid'
            AND o.paid_at IS NOT NULL
            AND o.provider_transaction_id IS NOT NULL
            AND o.refunded_at IS NULL
            AND l.active
            AND l.save_allowed
            AND l.expires_at IS NULL
            AND l.total_credits = o.generation_credits
        )
        OR (
          p_allow_staging_review
          AND EXISTS (
            SELECT 1 FROM public.companion_motion_review_grants g
            WHERE g.user_id = p_user_id AND g.memory_id = p_memory_id
              AND g.revoked_at IS NULL
              AND g.starts_at <= p_at AND g.expires_at > p_at
          )
        )
      )
  );
$function$;

COMMIT;
