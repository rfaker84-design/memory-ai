BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.users') IS NULL
     OR pg_catalog.to_regclass('public.business_funnel_events') IS NULL THEN
    RAISE EXCEPTION '013 requires migrations 001-012';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.auth_external_identities (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  provider TEXT NOT NULL,
  subject_hash CHARACTER(64) NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_auth_external_identities PRIMARY KEY (id),
  CONSTRAINT fk_auth_external_identities_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT ck_auth_external_identities_provider
    CHECK (provider IN ('wechat')),
  CONSTRAINT ck_auth_external_identities_subject_hash
    CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uq_auth_external_identities_provider_subject
    UNIQUE (provider, subject_hash),
  CONSTRAINT uq_auth_external_identities_provider_user
    UNIQUE (provider, user_id)
);

CREATE TABLE IF NOT EXISTS public.auth_oauth_states (
  state_digest CHARACTER(64) NOT NULL,
  provider TEXT NOT NULL,
  link_user_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_auth_oauth_states PRIMARY KEY (state_digest),
  CONSTRAINT fk_auth_oauth_states_link_user
    FOREIGN KEY (link_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT ck_auth_oauth_states_digest
    CHECK (state_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_auth_oauth_states_provider
    CHECK (provider IN ('wechat')),
  CONSTRAINT ck_auth_oauth_states_ttl
    CHECK (
      expires_at > created_at
      AND expires_at <= created_at + INTERVAL '10 minutes'
    ),
  CONSTRAINT ck_auth_oauth_states_consumed
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX IF NOT EXISTS ix_auth_oauth_states_expires
  ON public.auth_oauth_states (expires_at);

DO $$
DECLARE
  identity_columns TEXT[];
  state_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum)
  INTO identity_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.auth_external_identities'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped;
  IF identity_columns IS DISTINCT FROM ARRAY[
    'id', 'provider', 'subject_hash', 'user_id', 'created_at', 'updated_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '013 auth_external_identities has unexpected columns';
  END IF;

  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum)
  INTO state_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.auth_oauth_states'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped;
  IF state_columns IS DISTINCT FROM ARRAY[
    'state_digest', 'provider', 'link_user_id', 'expires_at',
    'consumed_at', 'created_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '013 auth_oauth_states has unexpected columns';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.auth_external_identities'::regclass
      AND c.conname = 'uq_auth_external_identities_provider_subject'
      AND c.contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.auth_external_identities'::regclass
      AND c.conname = 'uq_auth_external_identities_provider_user'
      AND c.contype = 'u'
  ) THEN
    RAISE EXCEPTION '013 identity uniqueness is invalid';
  END IF;
END;
$$;

COMMIT;
