-- CANDIDATE ONLY: do not add to an automatic runner or execute in Staging/production.
-- This is not a Commerce ledger. It contains no message text and records only
-- an owner-scoped ordinary-chat admission reservation for a China calendar day.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.users') IS NULL
     OR pg_catalog.to_regclass('public.memories') IS NULL
     OR pg_catalog.to_regclass('public.memory_chat_turns') IS NULL THEN
    RAISE EXCEPTION '023 requires users, memories and memory_chat_turns';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.free_chat_daily_admissions (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  china_day DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved',
  reservation_expires_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_free_chat_daily_admissions_memory_user
    FOREIGN KEY (memory_id, user_id) REFERENCES public.memories(id, user_id) ON DELETE CASCADE,
  CONSTRAINT uq_free_chat_daily_admissions_request UNIQUE (user_id, memory_id, idempotency_key),
  CONSTRAINT ck_free_chat_daily_admissions_status CHECK (status IN ('reserved', 'committed', 'released')),
  CONSTRAINT ck_free_chat_daily_admissions_lifecycle CHECK (
    (status = 'reserved' AND reservation_expires_at IS NOT NULL AND committed_at IS NULL AND released_at IS NULL)
    OR (status = 'committed' AND reservation_expires_at IS NULL AND committed_at IS NOT NULL AND released_at IS NULL)
    OR (status = 'released' AND released_at IS NOT NULL AND committed_at IS NULL)
  ),
  CONSTRAINT ck_free_chat_daily_admissions_key CHECK (char_length(idempotency_key) BETWEEN 16 AND 128)
);

CREATE INDEX IF NOT EXISTS ix_free_chat_daily_admissions_owner_day_active
  ON public.free_chat_daily_admissions (user_id, china_day)
  WHERE status IN ('reserved', 'committed');

COMMIT;
