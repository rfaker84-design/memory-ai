BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.users') IS NULL
     OR pg_catalog.to_regclass('public.memories') IS NULL THEN
    RAISE EXCEPTION '011 requires migrations 001-010';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.business_funnel_events (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  memory_id UUID,
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_business_funnel_events PRIMARY KEY (id),
  CONSTRAINT fk_business_funnel_events_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_business_funnel_events_memory FOREIGN KEY (memory_id) REFERENCES public.memories(id) ON DELETE CASCADE,
  CONSTRAINT ck_business_funnel_events_type CHECK (event_type IN (
    'login_completed', 'memory_created', 'first_greeting_viewed',
    'first_conversation_completed', 'payment_entry_viewed', 'order_created',
    'payment_completed', 'payment_refunded'
  )),
  CONSTRAINT ck_business_funnel_events_key CHECK (event_key ~ '^[a-z0-9:_-]{1,160}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_business_funnel_events_type_key
  ON public.business_funnel_events (event_type, event_key);
CREATE INDEX IF NOT EXISTS ix_business_funnel_events_type_occurred
  ON public.business_funnel_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_business_funnel_events_user_occurred
  ON public.business_funnel_events (user_id, occurred_at DESC);

DO $$
DECLARE
  target_oid OID := 'public.business_funnel_events'::regclass;
  actual_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum) INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = target_oid AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM ARRAY[
    'id', 'user_id', 'memory_id', 'event_type', 'event_key', 'occurred_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '011 business_funnel_events has an unexpected column definition';
  END IF;
END;
$$;

COMMIT;
