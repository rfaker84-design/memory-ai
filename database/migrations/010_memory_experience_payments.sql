BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.users') IS NULL
     OR pg_catalog.to_regclass('public.memories') IS NULL
     OR pg_catalog.to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION '010 requires migrations 001-009';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.payment_orders (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  order_no TEXT NOT NULL,
  request_key TEXT NOT NULL,
  product_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'wechat_h5',
  amount_fen INTEGER NOT NULL,
  currency CHARACTER(3) NOT NULL DEFAULT 'CNY',
  duration_days INTEGER NOT NULL,
  chat_quota INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_prepay_id TEXT,
  payment_url TEXT,
  provider_transaction_id TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_payment_orders PRIMARY KEY (id),
  CONSTRAINT fk_payment_orders_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_orders_memory FOREIGN KEY (memory_id) REFERENCES public.memories(id) ON DELETE CASCADE,
  CONSTRAINT ck_payment_orders_order_no CHECK (order_no ~ '^YM[0-9]{14}[0-9A-F]{12}$'),
  CONSTRAINT ck_payment_orders_request_key CHECK (request_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_payment_orders_product_id CHECK (length(product_id) BETWEEN 1 AND 100),
  CONSTRAINT ck_payment_orders_provider CHECK (provider = 'wechat_h5'),
  CONSTRAINT ck_payment_orders_amount CHECK (amount_fen BETWEEN 1 AND 100000000),
  CONSTRAINT ck_payment_orders_currency CHECK (currency = 'CNY'),
  CONSTRAINT ck_payment_orders_duration CHECK (duration_days BETWEEN 1 AND 366),
  CONSTRAINT ck_payment_orders_quota CHECK (chat_quota BETWEEN 1 AND 1000000),
  CONSTRAINT ck_payment_orders_status CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded', 'expired')),
  CONSTRAINT ck_payment_orders_paid_state CHECK (
    (status IN ('paid', 'refunded') AND provider_transaction_id IS NOT NULL AND paid_at IS NOT NULL)
    OR (status NOT IN ('paid', 'refunded') AND provider_transaction_id IS NULL AND paid_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_orders_order_no
  ON public.payment_orders (order_no);
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_orders_owner_memory_request
  ON public.payment_orders (user_id, memory_id, request_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_orders_provider_transaction
  ON public.payment_orders (provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_payment_orders_owner_memory_created
  ON public.payment_orders (user_id, memory_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.memory_entitlements (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  order_id UUID NOT NULL,
  user_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  product_id TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  chat_quota INTEGER NOT NULL,
  chat_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_memory_entitlements PRIMARY KEY (id),
  CONSTRAINT fk_memory_entitlements_order FOREIGN KEY (order_id) REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_memory_entitlements_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_memory_entitlements_memory FOREIGN KEY (memory_id) REFERENCES public.memories(id) ON DELETE CASCADE,
  CONSTRAINT uq_memory_entitlements_order UNIQUE (order_id),
  CONSTRAINT ck_memory_entitlements_product_id CHECK (length(product_id) BETWEEN 1 AND 100),
  CONSTRAINT ck_memory_entitlements_window CHECK (ends_at > starts_at),
  CONSTRAINT ck_memory_entitlements_quota CHECK (chat_quota BETWEEN 1 AND 1000000 AND chat_used BETWEEN 0 AND chat_quota),
  CONSTRAINT ck_memory_entitlements_status CHECK (status IN ('active', 'refunded'))
);

CREATE INDEX IF NOT EXISTS ix_memory_entitlements_owner_memory_end
  ON public.memory_entitlements (user_id, memory_id, ends_at DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.memory_entitlement_usages (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  entitlement_id UUID NOT NULL,
  user_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_memory_entitlement_usages PRIMARY KEY (id),
  CONSTRAINT fk_memory_entitlement_usages_entitlement FOREIGN KEY (entitlement_id) REFERENCES public.memory_entitlements(id) ON DELETE CASCADE,
  CONSTRAINT fk_memory_entitlement_usages_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_memory_entitlement_usages_memory FOREIGN KEY (memory_id) REFERENCES public.memories(id) ON DELETE CASCADE,
  CONSTRAINT ck_memory_entitlement_usages_key CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT uq_memory_entitlement_usages_turn UNIQUE (user_id, memory_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.payment_callback_events (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  order_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash CHARACTER(64) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_payment_callback_events PRIMARY KEY (id),
  CONSTRAINT fk_payment_callback_events_order FOREIGN KEY (order_id) REFERENCES public.payment_orders(id) ON DELETE CASCADE,
  CONSTRAINT ck_payment_callback_events_provider CHECK (provider = 'wechat_h5'),
  CONSTRAINT ck_payment_callback_events_event_id CHECK (length(provider_event_id) BETWEEN 1 AND 128),
  CONSTRAINT ck_payment_callback_events_type CHECK (event_type IN ('transaction', 'refund')),
  CONSTRAINT ck_payment_callback_events_payload_hash CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_payment_callback_events_provider_event UNIQUE (provider, provider_event_id)
);

DO $$
DECLARE
  expected_orders TEXT[] := ARRAY[
    'id', 'user_id', 'memory_id', 'order_no', 'request_key', 'product_id', 'provider',
    'amount_fen', 'currency', 'duration_days', 'chat_quota', 'status', 'provider_prepay_id',
    'payment_url', 'provider_transaction_id', 'provider_payload', 'expires_at', 'paid_at',
    'failed_at', 'cancelled_at', 'refunded_at', 'created_at', 'updated_at'
  ];
  actual_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum) INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.payment_orders'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM expected_orders THEN
    RAISE EXCEPTION '010 payment_orders has an unexpected column definition';
  END IF;

  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum) INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.memory_entitlements'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM ARRAY[
    'id', 'order_id', 'user_id', 'memory_id', 'product_id', 'starts_at', 'ends_at',
    'chat_quota', 'chat_used', 'status', 'created_at', 'updated_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '010 memory_entitlements has an unexpected column definition';
  END IF;

  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum) INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.memory_entitlement_usages'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM ARRAY[
    'id', 'entitlement_id', 'user_id', 'memory_id', 'idempotency_key', 'created_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '010 memory_entitlement_usages has an unexpected column definition';
  END IF;

  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum) INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.payment_callback_events'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM ARRAY[
    'id', 'provider', 'provider_event_id', 'order_id', 'event_type', 'payload_hash',
    'processed_at', 'created_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '010 payment_callback_events has an unexpected column definition';
  END IF;
END;
$$;

COMMIT;
