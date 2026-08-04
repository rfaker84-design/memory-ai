BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.initial_encounter_playback_claims') IS NULL THEN
    RAISE EXCEPTION '026 postflight: playback-claim table is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conrelid='public.initial_encounter_playback_claims'::regclass
       AND contype='p' AND conkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid='public.initial_encounter_playback_claims'::regclass AND attname='job_id')]
  ) THEN RAISE EXCEPTION '026 postflight: job claim is not unique'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_index WHERE indrelid='public.initial_encounter_playback_claims'::regclass AND NOT indisvalid) THEN
    RAISE EXCEPTION '026 postflight: invalid index';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.initial_encounter_playback_claims'::regclass AND NOT convalidated) THEN
    RAISE EXCEPTION '026 postflight: unvalidated constraint';
  END IF;
END;
$$;
COMMIT;
