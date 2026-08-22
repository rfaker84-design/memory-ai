-- CANDIDATE ONLY: apply to Staging under an explicit metrics deployment.
-- Production execution requires a separate finance/privacy review.
-- Domain tables remain the source of truth for product facts.  These tables
-- record only otherwise-unobservable interactions, attribution and costs.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.users') IS NULL
     OR pg_catalog.to_regclass('public.memories') IS NULL
     OR pg_catalog.to_regclass('public.video_generation_jobs') IS NULL
     OR pg_catalog.to_regclass('public.commerce_orders') IS NULL THEN
    RAISE EXCEPTION '030 requires users, memories, video jobs and commerce orders';
  END IF;
END;
$$;

-- This is intentionally a narrow schema rather than arbitrary analytics JSON.
-- No customer content, media locator, contact data or free-form text can be
-- stored by this validator.
CREATE OR REPLACE FUNCTION public.memoryai_metrics_properties_allowed(payload JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT jsonb_typeof(payload) = 'object'
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_each(payload) AS property(key, value)
       WHERE key NOT IN ('surface', 'video_kind', 'package_id', 'source_channel', 'elapsed_ms')
          OR jsonb_typeof(value) NOT IN ('string', 'number')
          OR (key = 'elapsed_ms' AND (
                jsonb_typeof(value) <> 'number'
                OR (value #>> '{}') !~ '^[0-9]+$'
                OR (value #>> '{}')::bigint < 0
                OR (value #>> '{}')::bigint > 10800000
              ))
          OR (key <> 'elapsed_ms' AND (
                jsonb_typeof(value) <> 'string'
                OR char_length(value #>> '{}') > 64
                OR (value #>> '{}') !~ '^[a-z0-9._:-]+$'
              ))
     );
$$;

CREATE TABLE IF NOT EXISTS public.product_interaction_events (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  event_name TEXT NOT NULL,
  schema_version SMALLINT NOT NULL DEFAULT 1,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  environment TEXT NOT NULL,
  owner_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  anonymous_session_id UUID,
  memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
  request_id UUID,
  idempotency_key TEXT NOT NULL,
  source TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_synthetic BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT ck_product_interaction_event_name CHECK (event_name IN (
    'visitor_experience_started', 'photo_selection_started', 'photo_upload_succeeded',
    'initial_video_playback_started', 'initial_video_playback_3s',
    'payment_page_viewed', 'package_selected', 'payment_button_clicked',
    'referral_link_opened', 'family_collaboration_opened'
  )),
  CONSTRAINT ck_product_interaction_schema_version CHECK (schema_version = 1),
  CONSTRAINT ck_product_interaction_environment CHECK (environment IN ('staging', 'production')),
  CONSTRAINT ck_product_interaction_identity CHECK (owner_id IS NOT NULL OR anonymous_session_id IS NOT NULL),
  CONSTRAINT ck_product_interaction_key CHECK (
    char_length(idempotency_key) BETWEEN 16 AND 160
    AND idempotency_key ~ '^[-A-Za-z0-9._:]+$'
  ),
  CONSTRAINT ck_product_interaction_source CHECK (source IN ('web', 'server', 'worker', 'import')),
  CONSTRAINT ck_product_interaction_properties CHECK (public.memoryai_metrics_properties_allowed(properties))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_interaction_events_idempotency
  ON public.product_interaction_events (environment, event_name, idempotency_key);
CREATE INDEX IF NOT EXISTS ix_product_interaction_events_environment_time
  ON public.product_interaction_events (environment, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_product_interaction_events_owner_time
  ON public.product_interaction_events (owner_id, occurred_at DESC) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_product_interaction_events_memory_time
  ON public.product_interaction_events (memory_id, occurred_at DESC) WHERE memory_id IS NOT NULL;

-- A formal test/internal marker replaces fragile filtering by phone, name or
-- other personal data.  It is environment scoped and deliberately separate
-- from the product account profile.
CREATE TABLE IF NOT EXISTS public.product_metrics_subject_flags (
  environment TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (environment, user_id),
  CONSTRAINT ck_product_metrics_subject_environment CHECK (environment IN ('staging', 'production')),
  CONSTRAINT ck_product_metrics_subject_kind CHECK (subject_kind IN ('synthetic', 'internal'))
);

DROP TRIGGER IF EXISTS trg_product_metrics_subject_flags_updated_at ON public.product_metrics_subject_flags;
CREATE TRIGGER trg_product_metrics_subject_flags_updated_at
  BEFORE UPDATE ON public.product_metrics_subject_flags
  FOR EACH ROW EXECUTE FUNCTION public.memoryai_set_updated_at();

CREATE TABLE IF NOT EXISTS public.product_first_touch_attributions (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  environment TEXT NOT NULL,
  owner_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  anonymous_session_id UUID,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  referral_code TEXT,
  landing_route TEXT,
  first_touched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL,
  CONSTRAINT ck_product_first_touch_environment CHECK (environment IN ('staging', 'production')),
  CONSTRAINT ck_product_first_touch_identity CHECK (owner_id IS NOT NULL OR anonymous_session_id IS NOT NULL),
  CONSTRAINT ck_product_first_touch_source CHECK (source IS NULL OR source ~ '^[a-z0-9._:-]{1,64}$'),
  CONSTRAINT ck_product_first_touch_medium CHECK (medium IS NULL OR medium ~ '^[a-z0-9._:-]{1,64}$'),
  CONSTRAINT ck_product_first_touch_campaign CHECK (campaign IS NULL OR campaign ~ '^[a-z0-9._:-]{1,80}$'),
  CONSTRAINT ck_product_first_touch_referral CHECK (referral_code IS NULL OR referral_code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  CONSTRAINT ck_product_first_touch_route CHECK (landing_route IS NULL OR landing_route ~ '^/[a-z0-9_./-]{0,120}$'),
  CONSTRAINT ck_product_first_touch_key CHECK (
    char_length(idempotency_key) BETWEEN 16 AND 160
    AND idempotency_key ~ '^[-A-Za-z0-9._:]+$'
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_first_touch_owner
  ON public.product_first_touch_attributions (environment, owner_id) WHERE owner_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_first_touch_anonymous
  ON public.product_first_touch_attributions (environment, anonymous_session_id) WHERE anonymous_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cost_rate_cards (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  environment TEXT NOT NULL,
  cost_category TEXT NOT NULL,
  provider TEXT NOT NULL,
  rate_card_version TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  unit TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  source_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_cost_rate_cards_environment CHECK (environment IN ('staging', 'production')),
  CONSTRAINT ck_cost_rate_cards_category CHECK (cost_category IN (
    'sms', 'llm_chat', 'video_generation', 'voice_generation', 'media_storage',
    'payment_fee', 'manual_review_estimate', 'refund_cost', 'other_provider'
  )),
  CONSTRAINT ck_cost_rate_cards_version CHECK (rate_card_version ~ '^[A-Za-z0-9._:-]{1,80}$'),
  CONSTRAINT ck_cost_rate_cards_unit CHECK (unit ~ '^[a-z0-9._:-]{1,40}$'),
  CONSTRAINT ck_cost_rate_cards_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_cost_rate_cards_window CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT uq_cost_rate_card_version UNIQUE (environment, cost_category, provider, rate_card_version)
);

CREATE TABLE IF NOT EXISTS public.cost_ledger_entries (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  environment TEXT NOT NULL,
  cost_category TEXT NOT NULL,
  provider TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quantity NUMERIC(18,6) NOT NULL CHECK (quantity >= 0),
  unit TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  basis TEXT NOT NULL,
  rate_card_version TEXT,
  reconciliation_status TEXT NOT NULL DEFAULT 'unreconciled',
  idempotency_key TEXT NOT NULL,
  is_mock BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_cost_ledger_environment CHECK (environment IN ('staging', 'production')),
  CONSTRAINT ck_cost_ledger_category CHECK (cost_category IN (
    'sms', 'llm_chat', 'video_generation', 'voice_generation', 'media_storage',
    'payment_fee', 'manual_review_estimate', 'refund_cost', 'other_provider'
  )),
  CONSTRAINT ck_cost_ledger_provider CHECK (provider ~ '^[a-z0-9._:-]{1,80}$'),
  CONSTRAINT ck_cost_ledger_source_type CHECK (source_type ~ '^[a-z0-9._:-]{1,80}$'),
  CONSTRAINT ck_cost_ledger_source_id CHECK (source_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
  CONSTRAINT ck_cost_ledger_unit CHECK (unit ~ '^[a-z0-9._:-]{1,40}$'),
  CONSTRAINT ck_cost_ledger_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_cost_ledger_basis CHECK (basis IN ('actual', 'estimated')),
  CONSTRAINT ck_cost_ledger_rate_card CHECK (
    (basis = 'actual' AND rate_card_version IS NULL)
    OR (basis = 'estimated' AND rate_card_version ~ '^[A-Za-z0-9._:-]{1,80}$')
  ),
  CONSTRAINT ck_cost_ledger_reconciliation CHECK (reconciliation_status IN ('unreconciled', 'reconciled', 'mock')),
  CONSTRAINT ck_cost_ledger_mock CHECK (
    (is_mock AND environment = 'staging' AND amount_minor = 0 AND reconciliation_status = 'mock')
    OR (NOT is_mock AND reconciliation_status <> 'mock')
  ),
  CONSTRAINT ck_cost_ledger_key CHECK (
    char_length(idempotency_key) BETWEEN 16 AND 160
    AND idempotency_key ~ '^[-A-Za-z0-9._:]+$'
  ),
  CONSTRAINT uq_cost_ledger_idempotency UNIQUE (environment, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_cost_ledger_environment_time
  ON public.cost_ledger_entries (environment, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_cost_ledger_source
  ON public.cost_ledger_entries (environment, source_type, source_id);

CREATE OR REPLACE FUNCTION public.memoryai_metrics_ledger_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'cost_ledger_entries is append-only; write a compensating entry';
END;
$$;
DROP TRIGGER IF EXISTS trg_cost_ledger_entries_append_only ON public.cost_ledger_entries;
CREATE TRIGGER trg_cost_ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON public.cost_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.memoryai_metrics_ledger_append_only();

CREATE TABLE IF NOT EXISTS public.campaign_spend_imports (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  environment TEXT NOT NULL,
  channel TEXT NOT NULL,
  campaign TEXT NOT NULL,
  spend_date DATE NOT NULL,
  spend_minor BIGINT NOT NULL CHECK (spend_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  source_reference TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_campaign_spend_environment CHECK (environment IN ('staging', 'production')),
  CONSTRAINT ck_campaign_spend_channel CHECK (channel ~ '^[a-z0-9._:-]{1,64}$'),
  CONSTRAINT ck_campaign_spend_campaign CHECK (campaign ~ '^[a-z0-9._:-]{1,80}$'),
  CONSTRAINT ck_campaign_spend_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_campaign_spend_reference CHECK (char_length(source_reference) BETWEEN 1 AND 160),
  CONSTRAINT ck_campaign_spend_key CHECK (
    char_length(idempotency_key) BETWEEN 16 AND 160
    AND idempotency_key ~ '^[-A-Za-z0-9._:]+$'
  ),
  CONSTRAINT uq_campaign_spend_import_idempotency UNIQUE (environment, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_campaign_spend_environment_date
  ON public.campaign_spend_imports (environment, spend_date, channel, campaign);

-- Coverage is explicit so reports never pretend an interaction was observed
-- before the first-party collector existed.  A deployment records its own
-- environment after this migration is applied.
CREATE TABLE IF NOT EXISTS public.product_metrics_coverage (
  environment TEXT NOT NULL,
  metric_surface TEXT NOT NULL,
  coverage_started_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (environment, metric_surface),
  CONSTRAINT ck_product_metrics_coverage_environment CHECK (environment IN ('staging', 'production')),
  CONSTRAINT ck_product_metrics_coverage_surface CHECK (metric_surface IN ('interaction_events', 'cost_ledger', 'first_touch', 'campaign_spend'))
);

COMMIT;
