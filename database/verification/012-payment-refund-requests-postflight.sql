BEGIN READ ONLY;

SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  target_oid OID := pg_catalog.to_regclass('public.refund_requests');
  actual_columns TEXT[];
BEGIN
  IF target_oid IS NULL THEN
    RAISE EXCEPTION '012 postflight: refund_requests is missing';
  END IF;

  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum) INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = target_oid AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM ARRAY[
    'id', 'user_id', 'memory_id', 'order_id', 'request_key', 'reason',
    'merchant_refund_no', 'status', 'eligibility', 'decision_code',
    'provider_refund_id', 'created_at', 'requested_at', 'resolved_at', 'updated_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '012 postflight: refund request columns are invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    WHERE i.indexrelid = 'public.uq_refund_requests_order'::regclass
      AND i.indrelid = target_oid AND i.indisunique AND i.indisvalid
  ) THEN
    RAISE EXCEPTION '012 postflight: refund order idempotency is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    WHERE i.indexrelid = 'public.uq_refund_requests_merchant_refund_no'::regclass
      AND i.indrelid = target_oid AND i.indisunique AND i.indisvalid
  ) THEN
    RAISE EXCEPTION '012 postflight: merchant refund idempotency is invalid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.refund_requests r JOIN public.payment_orders o ON o.id = r.order_id
    WHERE r.user_id <> o.user_id OR r.memory_id <> o.memory_id
  ) THEN
    RAISE EXCEPTION '012 postflight: refund ownership is invalid';
  END IF;
END; $$;

COMMIT;
