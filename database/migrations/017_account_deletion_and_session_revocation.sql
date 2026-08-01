-- CANDIDATE ONLY: no automatic runner may execute this migration.
-- Production execution requires the legal/accounting retention review and Owner GO.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

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
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  audit_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ck_account_deletion_status CHECK (status IN ('requested','content_pending','provider_pending','legal_hold','completed','failed')),
  CONSTRAINT ck_account_deletion_schedule CHECK (content_delete_after >= requested_at AND provider_delete_after >= content_delete_after AND backup_expire_after >= provider_delete_after),
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
  completed_at TIMESTAMPTZ,
  receipt JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error_code TEXT,
  CONSTRAINT uq_account_deletion_task UNIQUE (deletion_request_id, kind),
  CONSTRAINT uq_account_deletion_task_idempotency UNIQUE (idempotency_key),
  CONSTRAINT ck_account_deletion_task_kind CHECK (kind IN ('revoke_sessions','content_online','cos_provider','backup_retention','financial_archive','audit_receipt')),
  CONSTRAINT ck_account_deletion_task_status CHECK (status IN ('pending','running','retry','completed','failed','legal_hold')),
  CONSTRAINT ck_account_deletion_task_attempts CHECK (attempt_count >= 0)
);
CREATE INDEX IF NOT EXISTS idx_account_deletion_tasks_ready ON public.account_deletion_tasks (status, next_attempt_at);

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
COMMIT;
