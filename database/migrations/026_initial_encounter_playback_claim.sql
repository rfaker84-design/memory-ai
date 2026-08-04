-- CANDIDATE ONLY: do not add to an automatic runner or execute in Staging/production.
-- A first encounter is an Owner-only, one-time product moment. The durable
-- claim prevents another browser or device from obtaining a second autoplay URL.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.video_generation_jobs') IS NULL
     OR pg_catalog.to_regclass('public.commerce_generation_reservations') IS NULL THEN
    RAISE EXCEPTION '026 requires video jobs and commerce reservations';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.initial_encounter_playback_claims (
  job_id UUID PRIMARY KEY REFERENCES public.video_generation_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_initial_encounter_claim_memory_user
    FOREIGN KEY (memory_id, user_id) REFERENCES public.memories(id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_initial_encounter_claims_owner_memory
  ON public.initial_encounter_playback_claims (user_id, memory_id, claimed_at DESC);

COMMIT;
