-- CANDIDATE ONLY: no automatic runner may execute this migration.
-- Production execution requires the legal/accounting retention review and Owner GO.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

-- Payment/refund records retain a memory foreign key.  Logical deletion makes
-- the content unavailable without breaking those statutory records.
ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_memories_active_owner ON public.memories (user_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'requested',
  content_delete_after TIMESTAMPTZ NOT NULL,
  provider_delete_after TIMESTAMPTZ NOT NULL,
  backup_expire_after TIMESTAMPTZ NOT NULL,
  legal_hold BOOLEAN NOT NULL DEFAULT false,
  legal_hold_reason TEXT,
  legal_hold_scope TEXT[],
  legal_hold_approved_by TEXT,
  legal_hold_expires_at TIMESTAMPTZ,
  guardian_confirmed_at TIMESTAMPTZ,
  receipt_access_hash TEXT NOT NULL,
  receipt_access_expires_at TIMESTAMPTZ NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  audit_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_account_deletion_status CHECK (status IN ('requested','content_pending','provider_pending','legal_hold','completed','failed')),
  CONSTRAINT ck_account_deletion_schedule CHECK (content_delete_after >= requested_at AND provider_delete_after >= content_delete_after AND backup_expire_after >= provider_delete_after),
  CONSTRAINT ck_account_deletion_receipt_expiry CHECK (receipt_access_expires_at >= requested_at AND receipt_access_expires_at <= backup_expire_after),
  CONSTRAINT ck_account_deletion_hold CHECK (
    (legal_hold AND legal_hold_reason IS NOT NULL AND legal_hold_scope IS NOT NULL
      AND cardinality(legal_hold_scope) > 0 AND legal_hold_approved_by IS NOT NULL
      AND legal_hold_expires_at IS NOT NULL)
    OR (NOT legal_hold AND legal_hold_reason IS NULL AND legal_hold_scope IS NULL
      AND legal_hold_approved_by IS NULL AND legal_hold_expires_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.account_deletion_tasks (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  deletion_request_id UUID NOT NULL REFERENCES public.account_deletion_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  receipt JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error_code TEXT,
  CONSTRAINT uq_account_deletion_task UNIQUE (deletion_request_id, kind),
  CONSTRAINT uq_account_deletion_task_idempotency UNIQUE (idempotency_key),
  CONSTRAINT ck_account_deletion_task_kind CHECK (kind IN ('revoke_sessions','content_online','cos_provider','backup_retention','financial_archive','audit_receipt')),
  CONSTRAINT ck_account_deletion_task_status CHECK (status IN ('pending','running','retry','completed','failed','legal_hold')),
  CONSTRAINT ck_account_deletion_task_attempts CHECK (attempt_count >= 0)
);
CREATE INDEX IF NOT EXISTS idx_account_deletion_tasks_ready ON public.account_deletion_tasks (status, next_attempt_at, claimed_at);

-- A dependent account never self-attests a guardian approval. The protected
-- profile must identify a verified guardian user, whose freshly authenticated
-- confirmation is recorded separately and expires before request creation.
CREATE TABLE IF NOT EXISTS public.account_deletion_guardian_confirmations (
  dependent_user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  guardian_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  confirmation_method TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  audit_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_account_deletion_guardian_method CHECK (confirmation_method IN ('verified_guardian_session')),
  CONSTRAINT ck_account_deletion_guardian_expiry CHECK (expires_at > confirmed_at AND expires_at <= confirmed_at + INTERVAL '30 minutes')
);
CREATE INDEX IF NOT EXISTS idx_account_deletion_guardian_expiry ON public.account_deletion_guardian_confirmations (expires_at);

-- This private ledger preserves only the locator needed to delete a remote
-- object after online content rows are removed. It is never returned through
-- the customer receipt endpoint.
CREATE TABLE IF NOT EXISTS public.account_deletion_object_ledger (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  deletion_request_id UUID NOT NULL REFERENCES public.account_deletion_requests(id) ON DELETE CASCADE,
  object_kind TEXT NOT NULL,
  object_key TEXT,
  provider TEXT,
  provider_task_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  deleted_at TIMESTAMPTZ,
  receipt JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error_code TEXT,
  CONSTRAINT ck_account_deletion_object_kind CHECK (object_kind IN ('media_object','video_artifact','provider_task')),
  CONSTRAINT ck_account_deletion_object_locator CHECK (
    (object_kind IN ('media_object','video_artifact') AND object_key IS NOT NULL AND provider_task_id IS NULL)
    OR (object_kind = 'provider_task' AND provider IS NOT NULL AND provider_task_id IS NOT NULL AND object_key IS NULL)
  ),
  CONSTRAINT ck_account_deletion_object_status CHECK (status IN ('pending','deleted','retry','blocked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_account_deletion_object_locator
  ON public.account_deletion_object_ledger (
    deletion_request_id, object_kind,
    COALESCE(object_key, ''), COALESCE(provider, ''), COALESCE(provider_task_id, '')
  );
CREATE INDEX IF NOT EXISTS idx_account_deletion_object_pending ON public.account_deletion_object_ledger (deletion_request_id, status);

CREATE TABLE IF NOT EXISTS public.auth_session_revocations (
  jti UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL,
  CONSTRAINT ck_auth_session_revocation_expiry CHECK (expires_at > revoked_at),
  CONSTRAINT ck_auth_session_revocation_reason CHECK (reason IN ('account_deletion','logout_all','security_incident'))
);
CREATE INDEX IF NOT EXISTS idx_auth_session_revocations_expiry ON public.auth_session_revocations (expires_at);

-- A per-token revocation cannot invalidate other active devices.  This user-wide
-- tombstone makes every session issued at or before invalid_before unusable at
-- every authentication entry point, while keeping the audit record minimal.
CREATE TABLE IF NOT EXISTS public.auth_session_invalidations (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  invalid_before TIMESTAMPTZ NOT NULL,
  invalidated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL,
  CONSTRAINT ck_auth_session_invalidation_reason CHECK (reason IN ('account_deletion','logout_all','security_incident')),
  CONSTRAINT ck_auth_session_invalidation_time CHECK (invalid_before <= invalidated_at + INTERVAL '5 minutes')
);
COMMIT;
