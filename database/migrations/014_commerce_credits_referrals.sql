-- ISOLATED VALIDATION ONLY: this migration is not approved for production.
-- Production execution or automatic-runner inclusion requires separate Window 1 approval.
-- This migration creates the server-side source of truth for Sprint21 commerce.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.users') IS NULL
     OR pg_catalog.to_regclass('public.memories') IS NULL THEN
    RAISE EXCEPTION '014 requires the core users and memories tables';
  END IF;
END;
$$;

-- Composite ownership keys let child ledgers prove that their user_id belongs
-- to the referenced TA/order/credit lot instead of trusting application code.
CREATE UNIQUE INDEX IF NOT EXISTS ux_memories_id_user
  ON public.memories (id, user_id);

CREATE TABLE IF NOT EXISTS public.commerce_orders (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  order_no TEXT NOT NULL,
  request_key TEXT NOT NULL,
  product_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  payment_rail TEXT NOT NULL,
  amount_fen INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  generation_credits INTEGER NOT NULL,
  grants_first_preview_save BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_transaction_id TEXT,
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_commerce_orders PRIMARY KEY (id),
  CONSTRAINT fk_commerce_orders_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT uq_commerce_orders_id_user UNIQUE (id, user_id),
  CONSTRAINT uq_commerce_orders_order_no UNIQUE (order_no),
  CONSTRAINT uq_commerce_orders_user_request UNIQUE (user_id, request_key),
  CONSTRAINT ck_commerce_orders_order_no
    CHECK (order_no ~ '^YC[0-9]{14}[0-9A-F]{12}$'),
  CONSTRAINT ck_commerce_orders_request_key
    CHECK (request_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_commerce_orders_product
    CHECK (product_id IN ('memory_video_49', 'memory_video_99', 'memory_video_199')),
  CONSTRAINT ck_commerce_orders_platform
    CHECK (platform IN ('web', 'android', 'ios')),
  CONSTRAINT ck_commerce_orders_payment_rail
    CHECK (payment_rail IN ('test', 'storekit_iap')),
  CONSTRAINT ck_commerce_orders_ios_rail
    CHECK (platform <> 'ios' OR payment_rail = 'storekit_iap'),
  CONSTRAINT ck_commerce_orders_amount
    CHECK (amount_fen IN (4900, 9900, 19900)),
  CONSTRAINT ck_commerce_orders_currency CHECK (currency = 'CNY'),
  CONSTRAINT ck_commerce_orders_credits
    CHECK (generation_credits IN (2, 6, 15)),
  CONSTRAINT ck_commerce_orders_status
    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  CONSTRAINT ck_commerce_orders_product_snapshot CHECK (
    (product_id = 'memory_video_49' AND amount_fen = 4900 AND generation_credits = 2)
    OR (product_id = 'memory_video_99' AND amount_fen = 9900 AND generation_credits = 6)
    OR (product_id = 'memory_video_199' AND amount_fen = 19900 AND generation_credits = 15)
  ),
  CONSTRAINT ck_commerce_orders_paid_evidence CHECK (
    (status IN ('paid', 'refunded')
      AND provider_transaction_id IS NOT NULL
      AND paid_at IS NOT NULL)
    OR status NOT IN ('paid', 'refunded')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_commerce_orders_rail_transaction
  ON public.commerce_orders (payment_rail, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_commerce_orders_user_created
  ON public.commerce_orders (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_order_events (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  payment_rail TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  order_id UUID NOT NULL,
  event_kind TEXT NOT NULL,
  payload_hash CHARACTER(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_commerce_order_events PRIMARY KEY (id),
  CONSTRAINT fk_commerce_order_events_order
    FOREIGN KEY (order_id) REFERENCES public.commerce_orders(id) ON DELETE CASCADE,
  CONSTRAINT uq_commerce_order_events_rail_event
    UNIQUE (payment_rail, provider_event_id),
  CONSTRAINT ck_commerce_order_events_rail
    CHECK (payment_rail IN ('test', 'storekit_iap')),
  CONSTRAINT ck_commerce_order_events_kind
    CHECK (event_kind IN ('payment', 'refund')),
  CONSTRAINT ck_commerce_order_events_payload_hash
    CHECK (payload_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS ix_commerce_order_events_order_created
  ON public.commerce_order_events (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_refund_requests (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id UUID NOT NULL,
  request_key TEXT NOT NULL,
  request_no TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'manual_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_commerce_refund_requests PRIMARY KEY (id),
  CONSTRAINT fk_commerce_refund_requests_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_commerce_refund_requests_order_user
    FOREIGN KEY (order_id, user_id)
    REFERENCES public.commerce_orders(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT uq_commerce_refund_requests_order UNIQUE (order_id),
  CONSTRAINT uq_commerce_refund_requests_user_request UNIQUE (user_id, request_key),
  CONSTRAINT uq_commerce_refund_requests_no UNIQUE (request_no),
  CONSTRAINT ck_commerce_refund_requests_key
    CHECK (request_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_commerce_refund_requests_no
    CHECK (request_no ~ '^YCR[0-9]{14}[0-9A-F]{10}$'),
  CONSTRAINT ck_commerce_refund_requests_reason
    CHECK (reason IN ('unused_purchase', 'duplicate_charge', 'service_failure')),
  CONSTRAINT ck_commerce_refund_requests_status
    CHECK (status IN ('manual_review', 'requested', 'succeeded', 'rejected'))
);

CREATE TABLE IF NOT EXISTS public.commerce_credit_lots (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  source_kind TEXT NOT NULL,
  source_key TEXT NOT NULL,
  total_credits INTEGER NOT NULL,
  reserved_credits INTEGER NOT NULL DEFAULT 0,
  consumed_credits INTEGER NOT NULL DEFAULT 0,
  save_allowed BOOLEAN NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_commerce_credit_lots PRIMARY KEY (id),
  CONSTRAINT fk_commerce_credit_lots_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT uq_commerce_credit_lots_id_user UNIQUE (id, user_id),
  CONSTRAINT uq_commerce_credit_lots_source UNIQUE (source_kind, source_key),
  CONSTRAINT ck_commerce_credit_lots_source
    CHECK (source_kind IN (
      'paid_package', 'free_preview', 'photo_remedy', 'referral_reward'
    )),
  CONSTRAINT ck_commerce_credit_lots_counts CHECK (
    total_credits > 0
    AND reserved_credits >= 0
    AND consumed_credits >= 0
    AND reserved_credits + consumed_credits <= total_credits
  ),
  CONSTRAINT ck_commerce_credit_lots_permanent
    CHECK (expires_at IS NULL),
  CONSTRAINT ck_commerce_credit_lots_save_boundary CHECK (
    (source_kind = 'paid_package' AND save_allowed)
    OR (source_kind <> 'paid_package' AND NOT save_allowed)
  )
);

CREATE INDEX IF NOT EXISTS ix_commerce_credit_lots_available
  ON public.commerce_credit_lots (user_id, source_kind, created_at)
  WHERE active;

CREATE TABLE IF NOT EXISTS public.commerce_generation_reservations (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  credit_lot_id UUID NOT NULL,
  request_key TEXT NOT NULL,
  generation_key TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved',
  outcome TEXT,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_commerce_generation_reservations PRIMARY KEY (id),
  CONSTRAINT fk_commerce_generation_reservations_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_commerce_generation_reservations_memory_user
    FOREIGN KEY (memory_id, user_id)
    REFERENCES public.memories(id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_commerce_generation_reservations_lot_user
    FOREIGN KEY (credit_lot_id, user_id)
    REFERENCES public.commerce_credit_lots(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT uq_commerce_generation_reservations_id_user UNIQUE (id, user_id),
  CONSTRAINT uq_commerce_generation_reservations_request
    UNIQUE (user_id, request_key),
  CONSTRAINT uq_commerce_generation_reservations_generation
    UNIQUE (generation_key),
  CONSTRAINT ck_commerce_generation_reservations_request_key
    CHECK (request_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_commerce_generation_reservations_generation_key
    CHECK (generation_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_commerce_generation_reservations_purpose
    CHECK (purpose IN (
      'first_preview', 'new_video', 'photo_remedy', 'referral_experience'
    )),
  CONSTRAINT ck_commerce_generation_reservations_status
    CHECK (status IN ('reserved', 'consumed', 'released')),
  CONSTRAINT ck_commerce_generation_reservations_outcome
    CHECK (outcome IS NULL OR outcome IN (
      'succeeded', 'system_failed', 'invalidated'
    )),
  CONSTRAINT ck_commerce_generation_reservations_terminal CHECK (
    (status = 'reserved' AND outcome IS NULL AND settled_at IS NULL)
    OR (status = 'consumed' AND outcome = 'succeeded' AND settled_at IS NOT NULL)
    OR (
      status = 'released'
      AND outcome IN ('system_failed', 'invalidated')
      AND settled_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS ix_commerce_generation_reservations_user_created
  ON public.commerce_generation_reservations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_commerce_generation_reservations_memory_user
  ON public.commerce_generation_reservations (memory_id, user_id);
CREATE INDEX IF NOT EXISTS ix_commerce_generation_reservations_lot_user
  ON public.commerce_generation_reservations (credit_lot_id, user_id);

CREATE TABLE IF NOT EXISTS public.commerce_save_rights (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  source_order_id UUID NOT NULL,
  reservation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_commerce_save_rights PRIMARY KEY (id),
  CONSTRAINT fk_commerce_save_rights_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_commerce_save_rights_order_user
    FOREIGN KEY (source_order_id, user_id)
    REFERENCES public.commerce_orders(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_commerce_save_rights_reservation
    FOREIGN KEY (reservation_id)
    REFERENCES public.commerce_generation_reservations(id) ON DELETE SET NULL,
  CONSTRAINT fk_commerce_save_rights_reservation_user
    FOREIGN KEY (reservation_id, user_id)
    REFERENCES public.commerce_generation_reservations(id, user_id),
  CONSTRAINT uq_commerce_save_rights_user UNIQUE (user_id),
  CONSTRAINT uq_commerce_save_rights_order UNIQUE (source_order_id)
);

CREATE INDEX IF NOT EXISTS ix_commerce_save_rights_reservation_user
  ON public.commerce_save_rights (reservation_id, user_id)
  WHERE reservation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.commerce_photo_remedies (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  credit_lot_id UUID NOT NULL,
  request_key TEXT NOT NULL,
  original_generation_key TEXT NOT NULL,
  replacement_photo_digest CHARACTER(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_commerce_photo_remedies PRIMARY KEY (id),
  CONSTRAINT fk_commerce_photo_remedies_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_commerce_photo_remedies_memory_user
    FOREIGN KEY (memory_id, user_id)
    REFERENCES public.memories(id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_commerce_photo_remedies_lot_user
    FOREIGN KEY (credit_lot_id, user_id)
    REFERENCES public.commerce_credit_lots(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT uq_commerce_photo_remedies_memory UNIQUE (user_id, memory_id),
  CONSTRAINT uq_commerce_photo_remedies_request UNIQUE (user_id, request_key),
  CONSTRAINT ck_commerce_photo_remedies_request_key
    CHECK (request_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_commerce_photo_remedies_generation_key
    CHECK (original_generation_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_commerce_photo_remedies_digest
    CHECK (replacement_photo_digest ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS ix_commerce_photo_remedies_memory_user
  ON public.commerce_photo_remedies (memory_id, user_id);
CREATE INDEX IF NOT EXISTS ix_commerce_photo_remedies_lot_user
  ON public.commerce_photo_remedies (credit_lot_id, user_id);

CREATE TABLE IF NOT EXISTS public.commerce_referral_codes (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  inviter_user_id UUID NOT NULL,
  request_key TEXT NOT NULL,
  code CHARACTER(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_commerce_referral_codes PRIMARY KEY (id),
  CONSTRAINT fk_commerce_referral_codes_inviter
    FOREIGN KEY (inviter_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT uq_commerce_referral_codes_inviter UNIQUE (inviter_user_id),
  CONSTRAINT uq_commerce_referral_codes_code UNIQUE (code),
  CONSTRAINT uq_commerce_referral_codes_request UNIQUE (inviter_user_id, request_key),
  CONSTRAINT ck_commerce_referral_codes_request_key
    CHECK (request_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_commerce_referral_codes_code
    CHECK (code ~ '^[A-HJ-NP-Z2-9]{10}$')
);

CREATE TABLE IF NOT EXISTS public.commerce_referral_qualifications (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  inviter_user_id UUID NOT NULL,
  invitee_user_id UUID NOT NULL,
  request_key TEXT NOT NULL,
  phone_hash CHARACTER(64) NOT NULL,
  device_key_hash CHARACTER(64) NOT NULL,
  reward_cohort INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_commerce_referral_qualifications PRIMARY KEY (id),
  CONSTRAINT fk_commerce_referral_qualifications_inviter
    FOREIGN KEY (inviter_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_commerce_referral_qualifications_invitee
    FOREIGN KEY (invitee_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT uq_commerce_referral_qualifications_invitee UNIQUE (invitee_user_id),
  CONSTRAINT uq_commerce_referral_qualifications_phone UNIQUE (phone_hash),
  CONSTRAINT uq_commerce_referral_qualifications_device UNIQUE (device_key_hash),
  CONSTRAINT uq_commerce_referral_qualifications_request
    UNIQUE (invitee_user_id, request_key),
  CONSTRAINT ck_commerce_referral_qualifications_not_self
    CHECK (inviter_user_id <> invitee_user_id),
  CONSTRAINT ck_commerce_referral_qualifications_request_key
    CHECK (request_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_commerce_referral_qualifications_phone
    CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_commerce_referral_qualifications_device
    CHECK (device_key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_commerce_referral_qualifications_cohort
    CHECK (reward_cohort IS NULL OR reward_cohort > 0)
);

CREATE INDEX IF NOT EXISTS ix_commerce_referral_qualifications_inviter
  ON public.commerce_referral_qualifications (inviter_user_id, created_at);

CREATE TABLE IF NOT EXISTS public.commerce_referral_rewards (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  inviter_user_id UUID NOT NULL,
  cohort INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_commerce_referral_rewards PRIMARY KEY (id),
  CONSTRAINT fk_commerce_referral_rewards_inviter
    FOREIGN KEY (inviter_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT uq_commerce_referral_rewards_cohort
    UNIQUE (inviter_user_id, cohort),
  CONSTRAINT ck_commerce_referral_rewards_cohort CHECK (cohort > 0)
);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'commerce_orders',
    'commerce_refund_requests',
    'commerce_credit_lots',
    'commerce_generation_reservations',
    'commerce_save_rights',
    'commerce_photo_remedies',
    'commerce_referral_codes',
    'commerce_referral_qualifications'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'DROP TRIGGER IF EXISTS %I ON public.%I',
      'trg_' || table_name || '_updated_at',
      table_name
    );
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER %I
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.memoryai_set_updated_at()',
      'trg_' || table_name || '_updated_at',
      table_name
    );
  END LOOP;
END;
$$;

COMMIT;
