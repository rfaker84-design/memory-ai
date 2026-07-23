BEGIN READ ONLY;

SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  target_oid OID := pg_catalog.to_regclass('public.business_funnel_events');
  actual_columns TEXT[];
BEGIN
  IF target_oid IS NULL THEN
    RAISE EXCEPTION '011 postflight: business_funnel_events is missing';
  END IF;

  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum) INTO actual_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = target_oid AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM ARRAY[
    'id', 'user_id', 'memory_id', 'event_type', 'event_key', 'occurred_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '011 postflight: business_funnel_events columns are invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    WHERE i.indexrelid = 'public.ux_business_funnel_events_type_key'::regclass
      AND i.indrelid = target_oid AND i.indisunique AND i.indisvalid
  ) THEN
    RAISE EXCEPTION '011 postflight: funnel event deduplication index is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    WHERE i.indexrelid = 'public.ix_business_funnel_events_type_occurred'::regclass
      AND i.indrelid = target_oid AND i.indisvalid
  ) THEN
    RAISE EXCEPTION '011 postflight: funnel time index is invalid';
  END IF;
END;
$$;

COMMIT;
