-- CANDIDATE ONLY: not approved for Staging or production and intentionally
-- excluded from the automatic migration runner.  It extends the existing
-- Commerce ledger; it does not create a second video-credit system.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.commerce_credit_lots') IS NULL
     OR pg_catalog.to_regclass('public.commerce_generation_reservations') IS NULL
     OR pg_catalog.to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION '020 requires the Commerce credit ledger and users';
  END IF;
END;
$$;

ALTER TABLE public.commerce_credit_lots
  DROP CONSTRAINT IF EXISTS ck_commerce_credit_lots_source,
  DROP CONSTRAINT IF EXISTS ck_commerce_credit_lots_permanent,
  DROP CONSTRAINT IF EXISTS ck_commerce_credit_lots_expiry_boundary,
  DROP CONSTRAINT IF EXISTS ck_commerce_credit_lots_save_boundary;

ALTER TABLE public.commerce_credit_lots
  ADD CONSTRAINT ck_commerce_credit_lots_source
    CHECK (source_kind IN (
      'paid_package', 'free_preview', 'photo_remedy', 'referral_reward', 'occasion_reward'
    )),
  ADD CONSTRAINT ck_commerce_credit_lots_expiry_boundary
    CHECK (
      (source_kind = 'occasion_reward' AND expires_at IS NOT NULL)
      OR (source_kind <> 'occasion_reward' AND expires_at IS NULL)
    ),
  ADD CONSTRAINT ck_commerce_credit_lots_save_boundary
    CHECK (
      (source_kind IN ('paid_package', 'occasion_reward') AND save_allowed)
      OR (source_kind NOT IN ('paid_package', 'occasion_reward') AND NOT save_allowed)
    );

ALTER TABLE public.commerce_generation_reservations
  DROP CONSTRAINT IF EXISTS ck_commerce_generation_reservations_purpose;

ALTER TABLE public.commerce_generation_reservations
  ADD CONSTRAINT ck_commerce_generation_reservations_purpose
    CHECK (purpose IN (
      'first_preview', 'new_video', 'photo_remedy', 'referral_experience', 'occasion_experience'
    ));

CREATE TABLE IF NOT EXISTS public.commerce_occasion_rewards (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  occasion TEXT NOT NULL,
  calendar_year INTEGER NOT NULL,
  request_key TEXT NOT NULL,
  eligible_on DATE NOT NULL,
  claim_deadline DATE NOT NULL,
  credit_lot_id UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_commerce_occasion_rewards PRIMARY KEY (id),
  CONSTRAINT fk_commerce_occasion_rewards_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_commerce_occasion_rewards_lot_user
    FOREIGN KEY (credit_lot_id, user_id)
    REFERENCES public.commerce_credit_lots(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT uq_commerce_occasion_rewards_user_occasion_year
    UNIQUE (user_id, occasion, calendar_year),
  CONSTRAINT uq_commerce_occasion_rewards_user_request
    UNIQUE (user_id, request_key),
  CONSTRAINT uq_commerce_occasion_rewards_lot UNIQUE (credit_lot_id),
  CONSTRAINT ck_commerce_occasion_rewards_occasion
    CHECK (occasion IN ('birthday', 'mothers_day', 'fathers_day')),
  CONSTRAINT ck_commerce_occasion_rewards_year
    CHECK (calendar_year BETWEEN 2026 AND 9999),
  CONSTRAINT ck_commerce_occasion_rewards_request_key
    CHECK (request_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  CONSTRAINT ck_commerce_occasion_rewards_window
    CHECK (
      eligible_on >= pg_catalog.make_date(calendar_year, 1, 1)
      AND claim_deadline >= eligible_on
      AND claim_deadline <= pg_catalog.make_date(calendar_year, 12, 31)
    )
);

CREATE INDEX IF NOT EXISTS ix_commerce_occasion_rewards_user_claimed
  ON public.commerce_occasion_rewards (user_id, claimed_at DESC);

DROP TRIGGER IF EXISTS trg_commerce_occasion_rewards_updated_at
  ON public.commerce_occasion_rewards;
CREATE TRIGGER trg_commerce_occasion_rewards_updated_at
  BEFORE UPDATE ON public.commerce_occasion_rewards
  FOR EACH ROW EXECUTE FUNCTION public.memoryai_set_updated_at();

COMMIT;
