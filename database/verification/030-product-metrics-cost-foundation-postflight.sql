BEGIN;
SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'product_interaction_events', 'product_metrics_subject_flags',
    'product_first_touch_attributions', 'cost_rate_cards',
    'cost_ledger_entries', 'campaign_spend_imports', 'product_metrics_coverage'
  ] LOOP
    IF pg_catalog.to_regclass('public.' || table_name) IS NULL THEN
      RAISE EXCEPTION '030 postflight: % is missing', table_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index
    WHERE indexrelid='public.ux_product_interaction_events_idempotency'::regclass
      AND indisvalid
  ) THEN
    RAISE EXCEPTION '030 postflight: interaction idempotency index is missing or invalid';
  END IF;
END;
$$;

ROLLBACK;
