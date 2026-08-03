-- Candidate-only Migration 020 postflight.  It is deliberately read-only and
-- may be run only after the migration has committed in an isolated database.
BEGIN READ ONLY;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.commerce_occasion_rewards') IS NULL THEN
    RAISE EXCEPTION 'commerce_occasion_rewards is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT i.indisvalid
  ) THEN
    RAISE EXCEPTION 'an invalid public index remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND NOT c.convalidated
  ) THEN
    RAISE EXCEPTION 'an unvalidated public constraint remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('commerce_occasion_rewards', 'commerce_credit_lots')
      AND c.relowner <> current_user::regrole
  ) THEN
    RAISE EXCEPTION 'Commerce occasion object owner differs from migration role';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.commerce_occasion_rewards r
    JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id
    WHERE l.user_id <> r.user_id
       OR l.source_kind <> 'occasion_reward'
       OR NOT l.save_allowed
       OR l.expires_at IS NULL
       OR r.claim_deadline < r.eligible_on
       OR r.claim_deadline > pg_catalog.make_date(r.calendar_year, 12, 31)
  ) THEN
    RAISE EXCEPTION 'an occasion reward ledger invariant is invalid';
  END IF;
END;
$$;

COMMIT;
