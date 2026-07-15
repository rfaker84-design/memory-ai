BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION '006 requires public.users; apply migrations 001-005 first';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.auth_verification_challenges (
  challenge_id UUID PRIMARY KEY DEFAULT public.gen_random_uuid(),
  phone_hash CHARACTER(64) NOT NULL,
  code_digest CHARACTER(64) NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_after TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  consumed_at TIMESTAMPTZ,
  request_ip_hash CHARACTER(64) NOT NULL,
  provider_request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
  column_name TEXT;
  expected_type TEXT;
  expected_not_null BOOLEAN;
  expected_default TEXT;
  actual_type TEXT;
  actual_not_null BOOLEAN;
  actual_default TEXT;
BEGIN
  FOR column_name, expected_type, expected_not_null, expected_default IN
    SELECT * FROM (VALUES
      ('challenge_id', 'uuid', true, 'gen_random_uuid()'),
      ('phone_hash', 'character(64)', true, NULL),
      ('code_digest', 'character(64)', true, NULL),
      ('purpose', 'text', true, NULL),
      ('expires_at', 'timestamp with time zone', true, NULL),
      ('resend_after', 'timestamp with time zone', true, NULL),
      ('attempts', 'integer', true, '0'),
      ('max_attempts', 'integer', true, '5'),
      ('consumed_at', 'timestamp with time zone', false, NULL),
      ('request_ip_hash', 'character(64)', true, NULL),
      ('provider_request_id', 'text', false, NULL),
      ('created_at', 'timestamp with time zone', true, 'now()'),
      ('updated_at', 'timestamp with time zone', true, 'now()')
    ) AS expected(column_name, expected_type, expected_not_null, expected_default)
  LOOP
    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod),
      a.attnotnull,
      pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    INTO actual_type, actual_not_null, actual_default
    FROM pg_catalog.pg_attribute a
    LEFT JOIN pg_catalog.pg_attrdef d
      ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.auth_verification_challenges'::regclass
      AND a.attname = column_name
      AND NOT a.attisdropped;

    IF NOT FOUND
       OR actual_type IS DISTINCT FROM expected_type
       OR actual_not_null IS DISTINCT FROM expected_not_null
       OR actual_default IS DISTINCT FROM expected_default THEN
      RAISE EXCEPTION '006 column public.auth_verification_challenges.% has an unexpected definition', column_name;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.auth_verification_challenges'::regclass
      AND attnum > 0 AND NOT attisdropped
  ) <> 13 THEN
    RAISE EXCEPTION '006 table public.auth_verification_challenges has unexpected columns';
  END IF;
END;
$$;

DO $$
DECLARE
  target_oid OID := 'public.auth_verification_challenges'::regclass;
  constraint_name TEXT;
  expected_definition TEXT;
  actual_definition TEXT;
  constraint_oid OID;
BEGIN
  FOR constraint_name, expected_definition IN
    SELECT * FROM (VALUES
      ('ck_auth_challenge_phone_hash', '((phone_hash)::text~''^[0-9a-f]{64}$''::text)'),
      ('ck_auth_challenge_code_digest', '((code_digest)::text~''^[0-9a-f]{64}$''::text)'),
      ('ck_auth_challenge_ip_hash', '((request_ip_hash)::text~''^[0-9a-f]{64}$''::text)'),
      ('ck_auth_challenge_purpose', '(purpose=ANY(ARRAY[''sign_in''::text]))'),
      ('ck_auth_challenge_attempts', '((attempts>=0)AND(max_attempts>0)AND(attempts<=max_attempts))'),
      ('ck_auth_challenge_timing', '((resend_after>created_at)AND(expires_at>resend_after))'),
      ('ck_auth_challenge_consumed_at', '((consumed_atISNULL)OR(consumed_at>=created_at))'),
      ('ck_auth_challenge_provider_request_id', '((provider_request_idISNULL)OR((char_length(provider_request_id)>=1)AND(char_length(provider_request_id)<=128)))')
    ) AS expected(constraint_name, expected_definition)
  LOOP
    SELECT c.oid,
      pg_catalog.regexp_replace(pg_catalog.pg_get_expr(c.conbin, c.conrelid), '\s+', '', 'g')
    INTO constraint_oid, actual_definition
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::regnamespace
      AND c.conname = constraint_name;

    IF constraint_oid IS NULL THEN
      CASE constraint_name
        WHEN 'ck_auth_challenge_phone_hash' THEN
          ALTER TABLE public.auth_verification_challenges ADD CONSTRAINT ck_auth_challenge_phone_hash
            CHECK (phone_hash ~ '^[0-9a-f]{64}$');
        WHEN 'ck_auth_challenge_code_digest' THEN
          ALTER TABLE public.auth_verification_challenges ADD CONSTRAINT ck_auth_challenge_code_digest
            CHECK (code_digest ~ '^[0-9a-f]{64}$');
        WHEN 'ck_auth_challenge_ip_hash' THEN
          ALTER TABLE public.auth_verification_challenges ADD CONSTRAINT ck_auth_challenge_ip_hash
            CHECK (request_ip_hash ~ '^[0-9a-f]{64}$');
        WHEN 'ck_auth_challenge_purpose' THEN
          ALTER TABLE public.auth_verification_challenges ADD CONSTRAINT ck_auth_challenge_purpose
            CHECK (purpose IN ('sign_in'));
        WHEN 'ck_auth_challenge_attempts' THEN
          ALTER TABLE public.auth_verification_challenges ADD CONSTRAINT ck_auth_challenge_attempts
            CHECK (attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts);
        WHEN 'ck_auth_challenge_timing' THEN
          ALTER TABLE public.auth_verification_challenges ADD CONSTRAINT ck_auth_challenge_timing
            CHECK (resend_after > created_at AND expires_at > resend_after);
        WHEN 'ck_auth_challenge_consumed_at' THEN
          ALTER TABLE public.auth_verification_challenges ADD CONSTRAINT ck_auth_challenge_consumed_at
            CHECK (consumed_at IS NULL OR consumed_at >= created_at);
        WHEN 'ck_auth_challenge_provider_request_id' THEN
          ALTER TABLE public.auth_verification_challenges ADD CONSTRAINT ck_auth_challenge_provider_request_id
            CHECK (provider_request_id IS NULL OR (char_length(provider_request_id) >= 1 AND char_length(provider_request_id) <= 128));
      END CASE;
    ELSIF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
      WHERE c.oid = constraint_oid AND c.conrelid = target_oid AND c.contype = 'c'
    ) OR actual_definition IS DISTINCT FROM expected_definition THEN
      RAISE EXCEPTION '006 constraint public.% has an unexpected owner or definition', constraint_name;
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  index_oid OID;
  definition TEXT;
BEGIN
  index_oid := to_regclass('public.idx_auth_challenges_phone_created');
  IF index_oid IS NULL THEN
    CREATE INDEX idx_auth_challenges_phone_created
      ON public.auth_verification_challenges (phone_hash, created_at DESC);
  ELSE
    SELECT pg_catalog.pg_get_indexdef(index_oid) INTO definition;
    IF definition IS DISTINCT FROM 'CREATE INDEX idx_auth_challenges_phone_created ON public.auth_verification_challenges USING btree (phone_hash, created_at DESC)' THEN
      RAISE EXCEPTION '006 index public.idx_auth_challenges_phone_created has an unexpected owner or definition';
    END IF;
  END IF;

  index_oid := to_regclass('public.idx_auth_challenges_ip_created');
  IF index_oid IS NULL THEN
    CREATE INDEX idx_auth_challenges_ip_created
      ON public.auth_verification_challenges (request_ip_hash, created_at DESC);
  ELSE
    SELECT pg_catalog.pg_get_indexdef(index_oid) INTO definition;
    IF definition IS DISTINCT FROM 'CREATE INDEX idx_auth_challenges_ip_created ON public.auth_verification_challenges USING btree (request_ip_hash, created_at DESC)' THEN
      RAISE EXCEPTION '006 index public.idx_auth_challenges_ip_created has an unexpected owner or definition';
    END IF;
  END IF;

  index_oid := to_regclass('public.idx_auth_challenges_expires_at');
  IF index_oid IS NULL THEN
    CREATE INDEX idx_auth_challenges_expires_at
      ON public.auth_verification_challenges (expires_at ASC);
  ELSE
    SELECT pg_catalog.pg_get_indexdef(index_oid) INTO definition;
    IF definition IS DISTINCT FROM 'CREATE INDEX idx_auth_challenges_expires_at ON public.auth_verification_challenges USING btree (expires_at)' THEN
      RAISE EXCEPTION '006 index public.idx_auth_challenges_expires_at has an unexpected owner or definition';
    END IF;
  END IF;
END;
$$;

COMMIT;
