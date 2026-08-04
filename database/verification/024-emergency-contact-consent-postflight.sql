-- Read-only candidate postflight for Migration 024.
-- It is intentionally not an automatic migration runner input.
BEGIN TRANSACTION READ ONLY;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  expected_constraints integer;
  validated_constraints integer;
  pending_index integer;
BEGIN
  IF pg_catalog.to_regclass('public.crisis_contact_consents') IS NULL THEN
    RAISE EXCEPTION '024 postflight: crisis_contact_consents missing';
  END IF;

  SELECT count(*) INTO expected_constraints
    FROM pg_constraint
   WHERE conrelid='public.crisis_contact_consents'::regclass
     AND conname IN ('uq_crisis_contact_consent', 'ck_crisis_contact_distinct', 'ck_crisis_contact_status', 'ck_crisis_contact_lifecycle');
  IF expected_constraints <> 4 THEN
    RAISE EXCEPTION '024 postflight: required constraints missing';
  END IF;

  SELECT count(*) INTO validated_constraints
    FROM pg_constraint
   WHERE conrelid='public.crisis_contact_consents'::regclass
     AND conname IN ('uq_crisis_contact_consent', 'ck_crisis_contact_distinct', 'ck_crisis_contact_status', 'ck_crisis_contact_lifecycle')
     AND convalidated;
  IF validated_constraints <> 4 THEN
    RAISE EXCEPTION '024 postflight: required constraints unvalidated';
  END IF;

  SELECT count(*) INTO pending_index
    FROM pg_index i
    JOIN pg_class c ON c.oid=i.indexrelid
   WHERE c.relname='ix_crisis_contact_consents_contact_pending' AND i.indisvalid;
  IF pending_index <> 1 THEN
    RAISE EXCEPTION '024 postflight: pending-contact index missing or invalid';
  END IF;
END;
$$;

SELECT count(*) AS invalid_indexes
  FROM pg_index i
  JOIN pg_class c ON c.oid=i.indexrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT i.indisvalid;

SELECT count(*) AS unvalidated_constraints
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid=c.connamespace
 WHERE n.nspname='public' AND NOT c.convalidated;

COMMIT;
