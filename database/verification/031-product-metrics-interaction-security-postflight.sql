BEGIN;
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.ux_product_interaction_events_subject_idempotency') IS NULL THEN
    RAISE EXCEPTION '031 postflight: subject-scoped interaction idempotency index is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='public.product_interaction_events'::regclass
      AND attname='subject_key' AND attnotnull
  ) THEN
    RAISE EXCEPTION '031 postflight: subject_key is not required';
  END IF;
END;
$$;

ROLLBACK;
