BEGIN;

CREATE TABLE IF NOT EXISTS public.refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  request_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  eligibility TEXT NOT NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT uq_refund_requests_order UNIQUE (order_id),
  CONSTRAINT uq_refund_requests_request_key UNIQUE (user_id, memory_id, request_key),
  CONSTRAINT ck_refund_requests_request_key CHECK (request_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_refund_requests_reason CHECK (length(reason) BETWEEN 1 AND 500),
  CONSTRAINT ck_refund_requests_status CHECK (status IN ('processing', 'succeeded', 'rejected')),
  CONSTRAINT ck_refund_requests_eligibility CHECK (eligibility IN ('eligible', 'ineligible')),
  CONSTRAINT ck_refund_requests_state CHECK (
    (status = 'processing' AND eligibility = 'eligible' AND rejection_reason IS NULL AND resolved_at IS NULL)
    OR (status = 'succeeded' AND eligibility = 'eligible' AND rejection_reason IS NULL AND resolved_at IS NOT NULL)
    OR (status = 'rejected' AND eligibility = 'ineligible' AND rejection_reason IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_refund_requests_owner_memory_created
  ON public.refund_requests (user_id, memory_id, created_at DESC);

COMMIT;
