BEGIN READ ONLY;

SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  identity_oid OID := pg_catalog.to_regclass('public.auth_external_identities');
  state_oid OID := pg_catalog.to_regclass('public.auth_oauth_states');
  identity_columns TEXT[];
  state_columns TEXT[];
BEGIN
  IF identity_oid IS NULL OR state_oid IS NULL THEN
    RAISE EXCEPTION '013 postflight: WeChat auth tables are missing';
  END IF;

  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum)
  INTO identity_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = identity_oid AND a.attnum > 0 AND NOT a.attisdropped;
  IF identity_columns IS DISTINCT FROM ARRAY[
    'id', 'provider', 'subject_hash', 'user_id', 'created_at', 'updated_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '013 postflight: identity columns are invalid';
  END IF;

  SELECT ARRAY_AGG(a.attname ORDER BY a.attnum)
  INTO state_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = state_oid AND a.attnum > 0 AND NOT a.attisdropped;
  IF state_columns IS DISTINCT FROM ARRAY[
    'state_digest', 'provider', 'link_user_id', 'expires_at',
    'consumed_at', 'created_at'
  ]::TEXT[] THEN
    RAISE EXCEPTION '013 postflight: state columns are invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = identity_oid
      AND c.conname = 'fk_auth_external_identities_user'
      AND c.contype = 'f'
      AND c.confrelid = 'public.users'::regclass
      AND c.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION '013 postflight: identity ownership is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = identity_oid
      AND c.conname = 'uq_auth_external_identities_provider_subject'
      AND c.contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = identity_oid
      AND c.conname = 'uq_auth_external_identities_provider_user'
      AND c.contype = 'u'
  ) THEN
    RAISE EXCEPTION '013 postflight: identity uniqueness is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = state_oid
      AND c.conname = 'ck_auth_oauth_states_ttl'
      AND c.contype = 'c'
      AND c.convalidated
  ) THEN
    RAISE EXCEPTION '013 postflight: state TTL is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    WHERE i.indexrelid = 'public.ix_auth_oauth_states_expires'::regclass
      AND i.indrelid = state_oid
      AND i.indisvalid
  ) THEN
    RAISE EXCEPTION '013 postflight: state expiry index is invalid';
  END IF;
END;
$$;

COMMIT;
