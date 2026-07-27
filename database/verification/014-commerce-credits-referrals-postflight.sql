-- Read-only postflight. Run only after Window 1 has separately approved and
-- applied migration 014.

DO $$
DECLARE
  expected_table TEXT;
  expected_index TEXT;
  expected_fk TEXT;
  commerce_tables CONSTANT TEXT[] := ARRAY[
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
  ];
BEGIN
  FOREACH expected_table IN ARRAY commerce_tables
  LOOP
    IF pg_catalog.to_regclass('public.' || expected_table) IS NULL THEN
      RAISE EXCEPTION '014 postflight: public.% is missing', expected_table;
    END IF;
  END LOOP;

  IF (
    SELECT COUNT(*)
    FROM pg_catalog.pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relkind = 'r'
      AND relname LIKE 'commerce_%'
  ) <> pg_catalog.array_length(commerce_tables, 1) THEN
    RAISE EXCEPTION '014 postflight: expected exactly 10 commerce tables';
  END IF;

  FOREACH expected_index IN ARRAY ARRAY[
    'ux_memories_id_user',
    'ux_commerce_orders_rail_transaction',
    'ix_commerce_orders_user_created',
    'ix_commerce_order_events_order_created',
    'ix_commerce_credit_lots_available',
    'ix_commerce_generation_reservations_user_created',
    'ix_commerce_generation_reservations_memory_user',
    'ix_commerce_generation_reservations_lot_user',
    'ix_commerce_save_rights_reservation_user',
    'ix_commerce_photo_remedies_memory_user',
    'ix_commerce_photo_remedies_lot_user',
    'ix_commerce_referral_qualifications_inviter'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class index_class
      JOIN pg_catalog.pg_index index_state
        ON index_state.indexrelid = index_class.oid
      WHERE index_class.relnamespace = 'public'::regnamespace
        AND index_class.relname = expected_index
        AND index_state.indisvalid
        AND index_state.indisready
    ) THEN
      RAISE EXCEPTION '014 postflight: required index % is missing or invalid',
        expected_index;
    END IF;
  END LOOP;

  FOREACH expected_fk IN ARRAY ARRAY[
    'fk_commerce_orders_user',
    'fk_commerce_order_events_order',
    'fk_commerce_refund_requests_user',
    'fk_commerce_refund_requests_order_user',
    'fk_commerce_credit_lots_user',
    'fk_commerce_generation_reservations_user',
    'fk_commerce_generation_reservations_memory_user',
    'fk_commerce_generation_reservations_lot_user',
    'fk_commerce_save_rights_user',
    'fk_commerce_save_rights_order_user',
    'fk_commerce_save_rights_reservation',
    'fk_commerce_save_rights_reservation_user',
    'fk_commerce_photo_remedies_user',
    'fk_commerce_photo_remedies_memory_user',
    'fk_commerce_photo_remedies_lot_user',
    'fk_commerce_referral_codes_inviter',
    'fk_commerce_referral_qualifications_inviter',
    'fk_commerce_referral_qualifications_invitee',
    'fk_commerce_referral_rewards_inviter'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conname = expected_fk
        AND contype = 'f'
        AND convalidated
    ) THEN
      RAISE EXCEPTION '014 postflight: required foreign key % is missing or invalid',
        expected_fk;
    END IF;
  END LOOP;

  IF (
    SELECT COUNT(*)
    FROM pg_catalog.pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND contype = 'p'
      AND conrelid IN (
        SELECT oid
        FROM pg_catalog.pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relname = ANY(commerce_tables)
      )
  ) <> 10 THEN
    RAISE EXCEPTION '014 postflight: every commerce table must have one primary key';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND NOT convalidated
      AND conrelid IN (
        SELECT oid
        FROM pg_catalog.pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relname = ANY(commerce_tables)
      )
  ) THEN
    RAISE EXCEPTION '014 postflight: an unvalidated commerce constraint remains';
  END IF;

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
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'uq_commerce_referral_qualifications_phone'
      AND conrelid = 'public.commerce_referral_qualifications'::regclass
      AND contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'uq_commerce_referral_qualifications_device'
      AND conrelid = 'public.commerce_referral_qualifications'::regclass
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
    FROM public.commerce_generation_reservations reservation
    JOIN public.memories memory ON memory.id = reservation.memory_id
    JOIN public.commerce_credit_lots lot ON lot.id = reservation.credit_lot_id
    WHERE reservation.user_id <> memory.user_id
       OR reservation.user_id <> lot.user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.commerce_refund_requests refund
    JOIN public.commerce_orders commerce_order ON commerce_order.id = refund.order_id
    WHERE refund.user_id <> commerce_order.user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.commerce_save_rights save_right
    JOIN public.commerce_orders commerce_order
      ON commerce_order.id = save_right.source_order_id
    LEFT JOIN public.commerce_generation_reservations reservation
      ON reservation.id = save_right.reservation_id
    WHERE save_right.user_id <> commerce_order.user_id
       OR (
         save_right.reservation_id IS NOT NULL
         AND save_right.user_id <> reservation.user_id
       )
  ) OR EXISTS (
    SELECT 1
    FROM public.commerce_photo_remedies remedy
    JOIN public.memories memory ON memory.id = remedy.memory_id
    JOIN public.commerce_credit_lots lot ON lot.id = remedy.credit_lot_id
    WHERE remedy.user_id <> memory.user_id
       OR remedy.user_id <> lot.user_id
  ) THEN
    RAISE EXCEPTION '014 postflight: cross-user ownership invariant failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commerce_orders commerce_order
    LEFT JOIN public.commerce_credit_lots lot
      ON lot.source_kind = 'paid_package'
     AND lot.source_key = commerce_order.id::text
     AND lot.user_id = commerce_order.user_id
    WHERE commerce_order.status = 'paid'
      AND (
        lot.id IS NULL
        OR lot.total_credits <> commerce_order.generation_credits
        OR NOT lot.active
      )
  ) THEN
    RAISE EXCEPTION '014 postflight: paid order reconciliation failed';
  END IF;
END;
$$;

SELECT
  pg_catalog.current_setting('server_version') AS server_version,
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relkind = 'r'
      AND relname LIKE 'commerce_%'
  ) AS commerce_table_count,
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND conrelid IN (
        SELECT oid
        FROM pg_catalog.pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relname LIKE 'commerce_%'
      )
  ) AS commerce_constraint_count,
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND contype = 'f'
      AND convalidated
      AND conrelid IN (
        SELECT oid
        FROM pg_catalog.pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relname LIKE 'commerce_%'
      )
  ) AS validated_foreign_key_count,
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_index index_state
    JOIN pg_catalog.pg_class table_class
      ON table_class.oid = index_state.indrelid
    WHERE table_class.relnamespace = 'public'::regnamespace
      AND table_class.relname LIKE 'commerce_%'
      AND index_state.indisvalid
      AND index_state.indisready
  ) AS valid_index_count;
