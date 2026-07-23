BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$ BEGIN
  IF pg_catalog.to_regclass('public.payment_orders') IS NULL
     OR pg_catalog.to_regclass('public.memory_entitlements') IS NULL
     OR pg_catalog.to_regclass('public.payment_callback_events') IS NULL THEN
    RAISE EXCEPTION '012 requires migrations 001-011';
  END IF;
END; $$;

CREATE TABLE IF NOT EXISTS public.refund_requests (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  request_key TEXT NOT NULL,
  -- Applicant-supplied explanation: it is never used as eligibility evidence.
  reason TEXT NOT NULL,
  merchant_refund_no TEXT NOT NULL,
  status TEXT NOT NULL,
  eligibility TEXT NOT NULL,
  decision_code TEXT,
  provider_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_refund_requests_order UNIQUE (order_id),
  CONSTRAINT uq_refund_requests_request_key UNIQUE (user_id, memory_id, request_key),
  CONSTRAINT uq_refund_requests_merchant_refund_no UNIQUE (merchant_refund_no),
  CONSTRAINT ck_refund_requests_request_key CHECK (request_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_refund_requests_reason CHECK (length(reason) BETWEEN 1 AND 500),
  CONSTRAINT ck_refund_requests_merchant_refund_no CHECK (merchant_refund_no ~ '^YR[0-9]{14}[0-9A-F]{12}$'),
  CONSTRAINT ck_refund_requests_status CHECK (status IN ('processing', 'requested', 'manual_review', 'succeeded', 'rejected')),
  CONSTRAINT ck_refund_requests_eligibility CHECK (eligibility IN ('eligible', 'manual_review', 'ineligible')),
  CONSTRAINT ck_refund_requests_decision_code CHECK (decision_code IS NULL OR decision_code ~ '^[A-Z0-9_]{1,64}$'),
  CONSTRAINT ck_refund_requests_state CHECK (
    (status = 'processing' AND eligibility = 'eligible' AND decision_code IS NULL AND requested_at IS NULL AND resolved_at IS NULL)
    OR (status = 'requested' AND eligibility = 'eligible' AND decision_code IS NULL AND requested_at IS NOT NULL AND resolved_at IS NULL)
    OR (status = 'manual_review' AND eligibility = 'manual_review' AND decision_code IS NOT NULL AND resolved_at IS NULL)
    OR (status = 'succeeded' AND eligibility = 'eligible' AND decision_code IS NULL AND resolved_at IS NOT NULL)
    OR (status = 'rejected' AND eligibility = 'ineligible' AND decision_code IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_refund_requests_owner_memory_created
  ON public.refund_requests (user_id, memory_id, created_at DESC);

COMMIT;
