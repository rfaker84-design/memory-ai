BEGIN TRANSACTION READ ONLY;

SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  constraint_definition TEXT;
BEGIN
  IF pg_catalog.to_regclass('public.commerce_refund_requests') IS NULL THEN
    RAISE EXCEPTION '025 postflight: commerce_refund_requests is missing';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(c.oid)
    INTO constraint_definition
    FROM pg_catalog.pg_constraint c
   WHERE c.conrelid = 'public.commerce_refund_requests'::regclass
     AND c.conname = 'ck_commerce_refund_requests_reason'
     AND c.contype = 'c'
     AND c.convalidated;

  IF constraint_definition IS NULL
     OR constraint_definition NOT LIKE '%unused_purchase%'
     OR constraint_definition NOT LIKE '%duplicate_charge%'
     OR constraint_definition NOT LIKE '%entitlement_missing%'
     OR constraint_definition NOT LIKE '%service_failure%' THEN
    RAISE EXCEPTION '025 postflight: refund-reason constraint is invalid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.commerce_refund_requests
     WHERE reason NOT IN ('unused_purchase', 'duplicate_charge', 'entitlement_missing', 'service_failure')
  ) THEN
    RAISE EXCEPTION '025 postflight: unexpected refund reason exists';
  END IF;
END;
$$;

COMMIT;
