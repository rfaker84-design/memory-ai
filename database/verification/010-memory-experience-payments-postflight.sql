BEGIN READ ONLY;

SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  orders_oid OID := pg_catalog.to_regclass('public.payment_orders');
  entitlements_oid OID := pg_catalog.to_regclass('public.memory_entitlements');
  callbacks_oid OID := pg_catalog.to_regclass('public.payment_callback_events');
  usages_oid OID := pg_catalog.to_regclass('public.memory_entitlement_usages');
  actual_columns TEXT[];
  invalid_paid BIGINT;
  duplicate_entitlements BIGINT;
BEGIN
  IF orders_oid IS NULL OR entitlements_oid IS NULL OR callbacks_oid IS NULL OR usages_oid IS NULL THEN
    RAISE EXCEPTION '010 postflight: payment tables are missing';
  END IF;

  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum) INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = orders_oid AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM ARRAY[
    'id', 'user_id', 'memory_id', 'order_no', 'request_key', 'product_id', 'provider',
    'amount_fen', 'currency', 'duration_days', 'chat_quota', 'status', 'provider_prepay_id',
    'payment_url', 'provider_transaction_id', 'provider_payload', 'expires_at', 'paid_at',
    'failed_at', 'cancelled_at', 'refunded_at', 'created_at', 'updated_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '010 postflight: payment_orders columns are invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    WHERE i.indexrelid = 'public.ux_payment_orders_owner_memory_request'::regclass
      AND i.indrelid = orders_oid AND i.indisunique AND i.indisvalid
  ) THEN
    RAISE EXCEPTION '010 postflight: order idempotency index is invalid';
  END IF;

  SELECT count(*) INTO invalid_paid
  FROM public.payment_orders
  WHERE status IN ('paid', 'refunded')
    AND (provider_transaction_id IS NULL OR paid_at IS NULL);
  IF invalid_paid <> 0 THEN
    RAISE EXCEPTION '010 postflight: paid order is missing provider settlement evidence';
  END IF;

  SELECT count(*) INTO duplicate_entitlements
  FROM (
    SELECT order_id FROM public.memory_entitlements GROUP BY order_id HAVING count(*) > 1
  ) duplicates;
  IF duplicate_entitlements <> 0 THEN
    RAISE EXCEPTION '010 postflight: an order granted multiple entitlements';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.memory_entitlement_usages usage
    JOIN public.memory_entitlements entitlement ON entitlement.id = usage.entitlement_id
    WHERE usage.user_id <> entitlement.user_id OR usage.memory_id <> entitlement.memory_id
  ) THEN
    RAISE EXCEPTION '010 postflight: entitlement usage ownership is invalid';
  END IF;
END;
$$;

COMMIT;
