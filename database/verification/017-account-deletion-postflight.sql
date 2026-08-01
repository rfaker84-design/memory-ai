-- Read-only postflight for candidate Migration 017. Run as the public schema
-- owner after an explicitly approved transaction; this script never runs it.
BEGIN READ ONLY;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
DECLARE
  required_table TEXT;
  required_index TEXT;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'account_deletion_requests',
    'account_deletion_tasks',
    'account_deletion_guardian_confirmations',
    'account_deletion_object_ledger',
    'auth_session_revocations',
    'auth_session_invalidations'
  ] LOOP
    IF to_regclass('public.' || required_table) IS NULL THEN
      RAISE EXCEPTION '017 postflight: public.% is missing', required_table;
    END IF;
  END LOOP;

  FOREACH required_index IN ARRAY ARRAY[
    'idx_memories_active_owner',
    'idx_account_deletion_tasks_ready',
    'idx_account_deletion_guardian_expiry',
    'ux_account_deletion_object_locator',
    'idx_account_deletion_object_pending',
    'idx_auth_session_revocations_expiry'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = required_index AND i.indisvalid
    ) THEN
      RAISE EXCEPTION '017 postflight: required index % is missing or invalid', required_index;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'account_deletion_requests', 'account_deletion_tasks',
        'account_deletion_guardian_confirmations', 'account_deletion_object_ledger',
        'auth_session_revocations', 'auth_session_invalidations'
      )
      AND c.relowner <> current_user::regrole
  ) THEN
    RAISE EXCEPTION '017 postflight: new relations are not owned by the executing schema owner';
  END IF;
END $$;

SELECT c.relname AS table_name, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'account_deletion_requests', 'account_deletion_tasks',
  'account_deletion_guardian_confirmations', 'account_deletion_object_ledger',
  'auth_session_revocations', 'auth_session_invalidations'
)
ORDER BY c.relname;

SELECT conrelid::regclass::text AS table_name, conname, convalidated
FROM pg_constraint
WHERE conrelid IN (
  'public.account_deletion_requests'::regclass,
  'public.account_deletion_tasks'::regclass,
  'public.account_deletion_guardian_confirmations'::regclass,
  'public.account_deletion_object_ledger'::regclass,
  'public.auth_session_revocations'::regclass,
  'public.auth_session_invalidations'::regclass
)
ORDER BY table_name, conname;

SELECT indexrelid::regclass::text AS index_name, indisvalid
FROM pg_index
WHERE indrelid IN (
  'public.memories'::regclass,
  'public.account_deletion_requests'::regclass,
  'public.account_deletion_tasks'::regclass,
  'public.account_deletion_guardian_confirmations'::regclass,
  'public.account_deletion_object_ledger'::regclass,
  'public.auth_session_revocations'::regclass,
  'public.auth_session_invalidations'::regclass
)
ORDER BY index_name;

-- Each result below must be empty; the explicit checks protect existing data
-- even when schema constraints have been accidentally disabled or drifted.
SELECT 'deletion_request_schedule_or_hold_invalid' AS issue
FROM public.account_deletion_requests
WHERE content_delete_after < requested_at
   OR provider_delete_after < content_delete_after
   OR backup_expire_after < provider_delete_after
   OR receipt_access_expires_at < requested_at
   OR receipt_access_expires_at > backup_expire_after
   OR (legal_hold AND (
     legal_hold_reason IS NULL OR legal_hold_scope IS NULL OR cardinality(legal_hold_scope) = 0
     OR legal_hold_approved_by IS NULL OR legal_hold_expires_at IS NULL
   ))
   OR (NOT legal_hold AND (
     legal_hold_reason IS NOT NULL OR legal_hold_scope IS NOT NULL
     OR legal_hold_approved_by IS NOT NULL OR legal_hold_expires_at IS NOT NULL
   ));

SELECT 'deletion_task_request_or_state_invalid' AS issue
FROM public.account_deletion_tasks t
LEFT JOIN public.account_deletion_requests r ON r.id = t.deletion_request_id
WHERE r.id IS NULL
   OR t.attempt_count < 0
   OR t.status NOT IN ('pending', 'running', 'retry', 'completed', 'failed', 'legal_hold');

SELECT 'guardian_confirmation_expiry_invalid' AS issue
FROM public.account_deletion_guardian_confirmations
WHERE confirmation_method <> 'verified_guardian_session'
   OR expires_at <= confirmed_at
   OR expires_at > confirmed_at + INTERVAL '30 minutes';

SELECT 'object_ledger_locator_invalid' AS issue
FROM public.account_deletion_object_ledger
WHERE (object_kind IN ('media_object', 'video_artifact') AND (object_key IS NULL OR provider_task_id IS NOT NULL))
   OR (object_kind = 'provider_task' AND (provider IS NULL OR provider_task_id IS NULL OR object_key IS NOT NULL));

SELECT 'session_revocation_expiry_invalid' AS issue
FROM public.auth_session_revocations
WHERE expires_at <= revoked_at;

SELECT 'session_invalidation_time_invalid' AS issue
FROM public.auth_session_invalidations
WHERE invalid_before > invalidated_at + INTERVAL '5 minutes';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT i.indisvalid
  ) THEN
    RAISE EXCEPTION '017 postflight: an invalid public index remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND NOT c.convalidated
  ) THEN
    RAISE EXCEPTION '017 postflight: an unvalidated public constraint remains';
  END IF;
END $$;
COMMIT;
