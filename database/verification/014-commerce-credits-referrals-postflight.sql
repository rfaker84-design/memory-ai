-- Read-only postflight. Run only after Window 1 has separately approved and
-- applied migration 014.

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'commerce_orders',
    'commerce_order_events',
    'commerce_refund_requests',
    'commerce_credit_lots',
    'commerce_generation_reservations',
    'commerce_save_rights',
    'commerce_photo_remedies',
    'commerce_referral_codes',
    'commerce_referral_qualifications',
    'commerce_referral_rewards'
  ]
  LOOP
    IF pg_catalog.to_regclass('public.' || table_name) IS NULL THEN
      RAISE EXCEPTION '014 postflight: public.% is missing', table_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'uq_commerce_orders_user_request'
      AND conrelid = 'public.commerce_orders'::regclass
      AND contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'uq_commerce_order_events_rail_event'
      AND conrelid = 'public.commerce_order_events'::regclass
      AND contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'uq_commerce_generation_reservations_request'
      AND conrelid = 'public.commerce_generation_reservations'::regclass
      AND contype = 'u'
  ) THEN
    RAISE EXCEPTION '014 postflight: commerce idempotency constraints are invalid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.commerce_credit_lots
    WHERE expires_at IS NOT NULL
       OR reserved_credits + consumed_credits > total_credits
  ) THEN
    RAISE EXCEPTION '014 postflight: credit ledger invariant failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commerce_orders o
    LEFT JOIN public.commerce_credit_lots l
      ON l.source_kind = 'paid_package' AND l.source_key = o.id::text
    WHERE o.status = 'paid'
      AND (l.id IS NULL OR l.total_credits <> o.generation_credits)
  ) THEN
    RAISE EXCEPTION '014 postflight: paid order reconciliation failed';
  END IF;
END;
$$;
