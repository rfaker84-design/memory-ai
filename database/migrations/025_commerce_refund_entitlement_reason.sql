-- CANDIDATE ONLY: do not add to an automatic runner or execute in Staging/production.
-- Keeps historical reasons readable while allowing the formal Commerce contract
-- to record an explicit entitlement-missing request.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.commerce_refund_requests') IS NULL THEN
    RAISE EXCEPTION '025 requires commerce_refund_requests';
  END IF;
END;
$$;

LOCK TABLE public.commerce_refund_requests IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.commerce_refund_requests
  DROP CONSTRAINT IF EXISTS ck_commerce_refund_requests_reason;

ALTER TABLE public.commerce_refund_requests
  ADD CONSTRAINT ck_commerce_refund_requests_reason
  CHECK (reason IN ('unused_purchase', 'duplicate_charge', 'entitlement_missing', 'service_failure'));

COMMIT;
