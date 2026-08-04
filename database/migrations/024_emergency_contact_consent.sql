-- CANDIDATE ONLY: do not add to an automatic runner or execute in Staging/production.
-- A crisis contact must be an existing verified account and explicitly accept
-- the relationship. This table intentionally stores no phone number, message,
-- or external-delivery claim.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION '024 requires users';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.crisis_contact_consents (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contact_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_crisis_contact_consent UNIQUE (owner_user_id, contact_user_id),
  CONSTRAINT ck_crisis_contact_distinct CHECK (owner_user_id <> contact_user_id),
  CONSTRAINT ck_crisis_contact_status CHECK (status IN ('pending', 'accepted', 'revoked')),
  CONSTRAINT ck_crisis_contact_lifecycle CHECK (
    (status='pending' AND accepted_at IS NULL AND revoked_at IS NULL)
    OR (status='accepted' AND accepted_at IS NOT NULL AND revoked_at IS NULL)
    OR (status='revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_crisis_contact_consents_contact_pending
  ON public.crisis_contact_consents (contact_user_id, requested_at)
  WHERE status='pending';

COMMIT;
