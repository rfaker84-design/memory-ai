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
  challenge_id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid() PRIMARY KEY,
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
  target_oid OID := 'public.auth_verification_challenges'::regclass;
  challenge_attnum SMALLINT;
  actual_type_oid OID;
  actual_typmod INTEGER;
  actual_not_null BOOLEAN;
  actual_identity TEXT;
  actual_generated TEXT;
  default_oid OID;
  default_expression TEXT;
  builtin_default_function_oid OID;
  builtin_default_return_type_oid OID;
  primary_key_count INTEGER;
  primary_key_columns SMALLINT[];
BEGIN
  SELECT a.attnum,
    a.atttypid,
    a.atttypmod,
    a.attnotnull,
    a.attidentity::text,
    a.attgenerated::text,
    d.oid,
    pg_catalog.pg_get_expr(d.adbin, d.adrelid)
  INTO challenge_attnum, actual_type_oid, actual_typmod, actual_not_null,
    actual_identity, actual_generated, default_oid, default_expression
  FROM pg_catalog.pg_attribute a
  LEFT JOIN pg_catalog.pg_attrdef d
    ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = target_oid
    AND a.attname = 'challenge_id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF NOT FOUND THEN
    RAISE EXCEPTION '006 challenge_id check failed: column is missing';
  END IF;
  IF actual_type_oid IS DISTINCT FROM 'pg_catalog.uuid'::regtype THEN
    RAISE EXCEPTION '006 challenge_id check failed: atttypid must be uuid, got %', actual_type_oid;
  END IF;
  IF actual_typmod IS DISTINCT FROM -1 THEN
    RAISE EXCEPTION '006 challenge_id check failed: atttypmod must be -1, got %', actual_typmod;
  END IF;
  IF actual_not_null IS DISTINCT FROM true THEN
    RAISE EXCEPTION '006 challenge_id check failed: attnotnull must be true, got %', actual_not_null;
  END IF;
  IF actual_identity IS DISTINCT FROM '' THEN
    RAISE EXCEPTION '006 challenge_id check failed: attidentity must be empty, got %', actual_identity;
  END IF;
  IF actual_generated IS DISTINCT FROM '' THEN
    RAISE EXCEPTION '006 challenge_id check failed: attgenerated must be empty, got %', actual_generated;
  END IF;
  IF default_oid IS NULL THEN
    RAISE EXCEPTION '006 challenge_id check failed: default is missing';
  END IF;

  -- PostgreSQL may omit pg_catalog or retain a direct no-op ::uuid cast when
  -- deparsing. Accept only those direct forms. In particular, do not inspect
  -- pg_node_tree internals and do not require catalog dependency rows for
  -- pinned built-ins.
  IF default_expression !~ '^\s*(?:(?:pg_catalog\.)?gen_random_uuid\(\)(?:\s*::\s*(?:pg_catalog\.)?uuid)?|\(\s*(?:pg_catalog\.)?gen_random_uuid\(\)\s*\)\s*::\s*(?:pg_catalog\.)?uuid)\s*$' THEN
    RAISE EXCEPTION '006 challenge_id check failed: default must directly call pg_catalog.gen_random_uuid(), got %', default_expression;
  END IF;

  builtin_default_function_oid := pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()');
  IF builtin_default_function_oid IS NULL THEN
    RAISE EXCEPTION '006 challenge_id check failed: pg_catalog.gen_random_uuid() is unavailable';
  END IF;

  SELECT p.prorettype
  INTO builtin_default_return_type_oid
  FROM pg_catalog.pg_proc p
  WHERE p.oid = builtin_default_function_oid;

  IF builtin_default_return_type_oid IS DISTINCT FROM 'pg_catalog.uuid'::regtype THEN
    RAISE EXCEPTION '006 challenge_id check failed: pg_catalog.gen_random_uuid() must return uuid, got %', builtin_default_return_type_oid;
  END IF;

  SELECT count(*)
  INTO primary_key_count
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = target_oid
    AND c.contype = 'p';

  IF primary_key_count = 1 THEN
    SELECT c.conkey
    INTO primary_key_columns
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = target_oid
      AND c.contype = 'p';
  END IF;

  IF primary_key_count <> 1 THEN
    RAISE EXCEPTION '006 challenge_id check failed: primary key count must be 1, got %', primary_key_count;
  END IF;
  IF primary_key_columns IS DISTINCT FROM ARRAY[challenge_attnum]::SMALLINT[] THEN
    RAISE EXCEPTION '006 challenge_id check failed: primary key conkey must contain challenge_id only, got %', primary_key_columns;
  END IF;
END;
$$;

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
  expected_column_names TEXT[];
  expected_conkey SMALLINT[];
  actual_definition TEXT;
  constraint_oid OID;
  constraint_name_count INTEGER;
  actual_relation_oid OID;
  actual_constraint_type TEXT;
  actual_validated BOOLEAN;
  actual_no_inherit BOOLEAN;
  actual_deferrable BOOLEAN;
  actual_deferred BOOLEAN;
  actual_conkey SMALLINT[];
BEGIN
  FOR constraint_name, expected_definition, expected_column_names IN
    SELECT * FROM (VALUES
      ('ck_auth_challenge_phone_hash', '(phone_hash~''^[0-9a-f]{64}$''::text)', ARRAY['phone_hash']::TEXT[]),
      ('ck_auth_challenge_code_digest', '(code_digest~''^[0-9a-f]{64}$''::text)', ARRAY['code_digest']::TEXT[]),
      ('ck_auth_challenge_ip_hash', '(request_ip_hash~''^[0-9a-f]{64}$''::text)', ARRAY['request_ip_hash']::TEXT[]),
      ('ck_auth_challenge_purpose', '(purpose=''sign_in''::text)', ARRAY['purpose']::TEXT[]),
      ('ck_auth_challenge_attempts', '((attempts>=0)AND(max_attempts>0)AND(attempts<=max_attempts))', ARRAY['attempts', 'max_attempts']::TEXT[]),
      ('ck_auth_challenge_timing', '((resend_after>created_at)AND(expires_at>resend_after))', ARRAY['resend_after', 'created_at', 'expires_at']::TEXT[]),
      ('ck_auth_challenge_consumed_at', '((consumed_atISNULL)OR(consumed_at>=created_at))', ARRAY['consumed_at', 'created_at']::TEXT[]),
      ('ck_auth_challenge_provider_request_id', '((provider_request_idISNULL)OR((char_length(provider_request_id)>=1)AND(char_length(provider_request_id)<=128)))', ARRAY['provider_request_id']::TEXT[])
    ) AS expected(constraint_name, expected_definition, expected_column_names)
  LOOP
    SELECT count(*)
    INTO constraint_name_count
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::regnamespace
      AND c.conname = constraint_name;

    IF constraint_name_count = 0 THEN
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
    ELSIF constraint_name_count > 1 THEN
      RAISE EXCEPTION '006 constraint public.% has duplicate names in public schema, count %', constraint_name, constraint_name_count;
    END IF;

    SELECT count(*)
    INTO constraint_name_count
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::regnamespace
      AND c.conname = constraint_name;

    IF constraint_name_count = 0 THEN
      RAISE EXCEPTION '006 constraint public.% is missing after creation', constraint_name;
    ELSIF constraint_name_count > 1 THEN
      RAISE EXCEPTION '006 constraint public.% has duplicate names in public schema, count %', constraint_name, constraint_name_count;
    END IF;

    SELECT c.oid,
      c.conrelid,
      c.contype::TEXT,
      c.convalidated,
      c.connoinherit,
      c.condeferrable,
      c.condeferred,
      c.conkey,
      pg_catalog.regexp_replace(pg_catalog.pg_get_expr(c.conbin, c.conrelid), '\s+', '', 'g')
    INTO constraint_oid, actual_relation_oid, actual_constraint_type,
      actual_validated, actual_no_inherit, actual_deferrable, actual_deferred,
      actual_conkey, actual_definition
    FROM pg_catalog.pg_constraint c
    WHERE c.connamespace = 'public'::regnamespace
      AND c.conname = constraint_name;

    SELECT pg_catalog.array_agg(a.attnum::SMALLINT ORDER BY expected_column.ordinality)
    INTO expected_conkey
    FROM pg_catalog.unnest(expected_column_names) WITH ORDINALITY AS expected_column(column_name, ordinality)
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = target_oid
      AND a.attname = expected_column.column_name
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF actual_relation_oid IS DISTINCT FROM target_oid THEN
      RAISE EXCEPTION '006 constraint public.% has wrong relation, expected %, got %', constraint_name, target_oid, actual_relation_oid;
    END IF;
    IF actual_constraint_type IS DISTINCT FROM 'c' THEN
      RAISE EXCEPTION '006 constraint public.% has wrong constraint type, expected c, got %', constraint_name, actual_constraint_type;
    END IF;
    IF actual_validated IS DISTINCT FROM true THEN
      RAISE EXCEPTION '006 constraint public.% is not validated', constraint_name;
    END IF;
    IF actual_no_inherit IS DISTINCT FROM false THEN
      RAISE EXCEPTION '006 constraint public.% unexpectedly uses NO INHERIT', constraint_name;
    END IF;
    IF actual_deferrable IS DISTINCT FROM false THEN
      RAISE EXCEPTION '006 constraint public.% is unexpectedly deferrable', constraint_name;
    END IF;
    IF actual_deferred IS DISTINCT FROM false THEN
      RAISE EXCEPTION '006 constraint public.% is unexpectedly deferred', constraint_name;
    END IF;
    IF actual_conkey IS DISTINCT FROM expected_conkey THEN
      RAISE EXCEPTION '006 constraint public.% has wrong conkey, expected %, got %', constraint_name, expected_conkey, actual_conkey;
    END IF;
    IF actual_definition IS DISTINCT FROM expected_definition THEN
      RAISE EXCEPTION '006 constraint public.% has wrong normalized expression, expected %, got %', constraint_name, expected_definition, actual_definition;
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  target_oid OID := 'public.auth_verification_challenges'::regclass;
  index_name TEXT;
  expected_definition TEXT;
  expected_column_names TEXT[];
  expected_indkey SMALLINT[];
  expected_indoption SMALLINT[];
  index_name_count INTEGER;
  index_oid OID;
  actual_relkind TEXT;
  actual_relation_oid OID;
  actual_access_method TEXT;
  actual_primary BOOLEAN;
  actual_unique BOOLEAN;
  actual_valid BOOLEAN;
  actual_ready BOOLEAN;
  actual_live BOOLEAN;
  actual_has_predicate BOOLEAN;
  actual_has_expression BOOLEAN;
  actual_nkeyatts INTEGER;
  actual_natts INTEGER;
  actual_indkey SMALLINT[];
  actual_indoption SMALLINT[];
  actual_definition TEXT;
BEGIN
  FOR index_name, expected_definition, expected_column_names, expected_indoption IN
    SELECT * FROM (VALUES
      ('idx_auth_challenges_phone_created', 'CREATE INDEX idx_auth_challenges_phone_created ON public.auth_verification_challenges USING btree (phone_hash, created_at DESC)', ARRAY['phone_hash', 'created_at']::TEXT[], ARRAY[0, 3]::SMALLINT[]),
      ('idx_auth_challenges_ip_created', 'CREATE INDEX idx_auth_challenges_ip_created ON public.auth_verification_challenges USING btree (request_ip_hash, created_at DESC)', ARRAY['request_ip_hash', 'created_at']::TEXT[], ARRAY[0, 3]::SMALLINT[]),
      ('idx_auth_challenges_expires_at', 'CREATE INDEX idx_auth_challenges_expires_at ON public.auth_verification_challenges USING btree (expires_at)', ARRAY['expires_at']::TEXT[], ARRAY[0]::SMALLINT[])
    ) AS expected(index_name, expected_definition, expected_column_names, expected_indoption)
  LOOP
    SELECT count(*)
    INTO index_name_count
    FROM pg_catalog.pg_class index_class
    WHERE index_class.relnamespace = 'public'::regnamespace
      AND index_class.relname = index_name;

    IF index_name_count = 0 THEN
      CASE index_name
        WHEN 'idx_auth_challenges_phone_created' THEN
          CREATE INDEX idx_auth_challenges_phone_created
            ON public.auth_verification_challenges (phone_hash, created_at DESC);
        WHEN 'idx_auth_challenges_ip_created' THEN
          CREATE INDEX idx_auth_challenges_ip_created
            ON public.auth_verification_challenges (request_ip_hash, created_at DESC);
        WHEN 'idx_auth_challenges_expires_at' THEN
          CREATE INDEX idx_auth_challenges_expires_at
            ON public.auth_verification_challenges (expires_at ASC);
      END CASE;
    ELSIF index_name_count > 1 THEN
      RAISE EXCEPTION '006 index public.% has duplicate names in public schema, count %', index_name, index_name_count;
    END IF;

    SELECT count(*)
    INTO index_name_count
    FROM pg_catalog.pg_class index_class
    WHERE index_class.relnamespace = 'public'::regnamespace
      AND index_class.relname = index_name;

    IF index_name_count = 0 THEN
      RAISE EXCEPTION '006 index public.% is missing after creation', index_name;
    ELSIF index_name_count > 1 THEN
      RAISE EXCEPTION '006 index public.% has duplicate names in public schema, count %', index_name, index_name_count;
    END IF;

    SELECT index_class.oid, index_class.relkind::TEXT
    INTO index_oid, actual_relkind
    FROM pg_catalog.pg_class index_class
    WHERE index_class.relnamespace = 'public'::regnamespace
      AND index_class.relname = index_name;

    IF actual_relkind IS DISTINCT FROM 'i' THEN
      RAISE EXCEPTION '006 index public.% has wrong object type, expected index, got %', index_name, actual_relkind;
    END IF;

    SELECT index_catalog.indrelid,
      access_method.amname,
      index_catalog.indisprimary,
      index_catalog.indisunique,
      index_catalog.indisvalid,
      index_catalog.indisready,
      index_catalog.indislive,
      index_catalog.indpred IS NOT NULL,
      index_catalog.indexprs IS NOT NULL,
      index_catalog.indnkeyatts,
      index_catalog.indnatts,
      ARRAY(
        SELECT index_catalog.indkey[key_position.position]::SMALLINT
        FROM pg_catalog.generate_series(0, index_catalog.indnkeyatts - 1) AS key_position(position)
        ORDER BY key_position.position
      ),
      ARRAY(
        SELECT index_catalog.indoption[option_position.position]::SMALLINT
        FROM pg_catalog.generate_series(0, index_catalog.indnkeyatts - 1) AS option_position(position)
        ORDER BY option_position.position
      ),
      pg_catalog.pg_get_indexdef(index_oid)
    INTO actual_relation_oid, actual_access_method, actual_primary,
      actual_unique, actual_valid, actual_ready, actual_live,
      actual_has_predicate, actual_has_expression, actual_nkeyatts,
      actual_natts, actual_indkey, actual_indoption, actual_definition
    FROM pg_catalog.pg_index index_catalog
    JOIN pg_catalog.pg_class index_class
      ON index_class.oid = index_catalog.indexrelid
    JOIN pg_catalog.pg_am access_method
      ON access_method.oid = index_class.relam
    WHERE index_catalog.indexrelid = index_oid;

    SELECT pg_catalog.array_agg(a.attnum::SMALLINT ORDER BY expected_column.ordinality)
    INTO expected_indkey
    FROM pg_catalog.unnest(expected_column_names) WITH ORDINALITY AS expected_column(column_name, ordinality)
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = target_oid
      AND a.attname = expected_column.column_name
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF actual_relation_oid IS DISTINCT FROM target_oid THEN
      RAISE EXCEPTION '006 index public.% has wrong relation, expected %, got %', index_name, target_oid, actual_relation_oid;
    END IF;
    IF actual_access_method IS DISTINCT FROM 'btree' THEN
      RAISE EXCEPTION '006 index public.% has wrong access method, expected btree, got %', index_name, actual_access_method;
    END IF;
    IF actual_primary IS DISTINCT FROM false THEN
      RAISE EXCEPTION '006 index public.% is unexpectedly primary', index_name;
    END IF;
    IF actual_unique IS DISTINCT FROM false THEN
      RAISE EXCEPTION '006 index public.% is unexpectedly unique', index_name;
    END IF;
    IF actual_valid IS DISTINCT FROM true THEN
      RAISE EXCEPTION '006 index public.% is not valid', index_name;
    END IF;
    IF actual_ready IS DISTINCT FROM true THEN
      RAISE EXCEPTION '006 index public.% is not ready', index_name;
    END IF;
    IF actual_live IS DISTINCT FROM true THEN
      RAISE EXCEPTION '006 index public.% is not live', index_name;
    END IF;
    IF actual_has_predicate IS DISTINCT FROM false THEN
      RAISE EXCEPTION '006 index public.% unexpectedly has a predicate', index_name;
    END IF;
    IF actual_has_expression IS DISTINCT FROM false THEN
      RAISE EXCEPTION '006 index public.% unexpectedly has an expression', index_name;
    END IF;
    IF actual_nkeyatts IS DISTINCT FROM pg_catalog.cardinality(expected_indkey)
       OR actual_natts IS DISTINCT FROM pg_catalog.cardinality(expected_indkey)
       OR actual_indkey IS DISTINCT FROM expected_indkey THEN
      RAISE EXCEPTION '006 index public.% has wrong key columns, expected %, got %', index_name, expected_indkey, actual_indkey;
    END IF;
    IF actual_indoption IS DISTINCT FROM expected_indoption THEN
      RAISE EXCEPTION '006 index public.% has wrong sort options, expected %, got %', index_name, expected_indoption, actual_indoption;
    END IF;
    IF actual_definition IS DISTINCT FROM expected_definition THEN
      RAISE EXCEPTION '006 index public.% has wrong normalized definition, expected %, got %', index_name, expected_definition, actual_definition;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
