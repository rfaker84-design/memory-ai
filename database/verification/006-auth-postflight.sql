\set ON_ERROR_STOP on

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

SELECT
  count(*) AS exact_row_count,
  pg_catalog.pg_size_pretty(
    pg_catalog.pg_total_relation_size('public.auth_verification_challenges'::regclass)
  ) AS total_size
FROM public.auth_verification_challenges;

SELECT
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  a.attnotnull AS not_null,
  pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_catalog.pg_attribute a
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = 'public.auth_verification_challenges'::regclass
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;

SELECT
  i.relname AS index_name,
  x.indisvalid,
  x.indisready,
  pg_catalog.pg_get_indexdef(i.oid) AS definition
FROM pg_catalog.pg_class i
JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
WHERE i.relnamespace = 'public'::regnamespace
  AND i.relname IN (
    'idx_auth_challenges_phone_created',
    'idx_auth_challenges_ip_created',
    'idx_auth_challenges_expires_at'
  )
ORDER BY i.relname;

SELECT
  c.conname AS constraint_name,
  c.convalidated,
  pg_catalog.pg_get_constraintdef(c.oid, true) AS definition
FROM pg_catalog.pg_constraint c
WHERE c.connamespace = 'public'::regnamespace
  AND c.conrelid = 'public.auth_verification_challenges'::regclass
ORDER BY c.conname;

SELECT
  count(*) FILTER (WHERE phone_hash !~ '^[0-9a-f]{64}$') AS invalid_phone_hashes,
  count(*) FILTER (WHERE code_digest !~ '^[0-9a-f]{64}$') AS invalid_code_digests,
  count(*) FILTER (WHERE request_ip_hash !~ '^[0-9a-f]{64}$') AS invalid_ip_hashes,
  count(*) FILTER (WHERE attempts < 0 OR attempts > max_attempts) AS invalid_attempt_counts,
  count(*) FILTER (WHERE expires_at <= resend_after OR resend_after <= created_at) AS invalid_timing,
  count(*) FILTER (WHERE consumed_at IS NOT NULL AND consumed_at < created_at) AS invalid_consumption
FROM public.auth_verification_challenges;

SELECT
  to_regclass('public.auth_verification_challenges') IS NOT NULL
    AND to_regclass('public.idx_auth_challenges_phone_created') IS NOT NULL
    AND to_regclass('public.idx_auth_challenges_ip_created') IS NOT NULL
    AND to_regclass('public.idx_auth_challenges_expires_at') IS NOT NULL
    AND (
      SELECT count(*) = 8
      FROM pg_catalog.pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conrelid = 'public.auth_verification_challenges'::regclass
        AND contype = 'c'
        AND convalidated
    ) AS auth_challenge_schema_complete;

ROLLBACK;
