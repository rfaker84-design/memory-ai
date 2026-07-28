-- Read-only postflight for isolated PostgreSQL 14 validation of Migration 016.
SET search_path = pg_catalog, public;

SELECT c.relname AS table_name
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN (
    'video_generation_jobs',
    'video_generation_quality_reviews',
    'video_generation_reconciliations'
  )
ORDER BY c.relname;

SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_catalog.pg_constraint
WHERE conrelid IN (
  'public.video_generation_jobs'::regclass,
  'public.video_generation_quality_reviews'::regclass,
  'public.video_generation_reconciliations'::regclass
)
ORDER BY table_name, conname;

SELECT indexrelid::regclass::text AS index_name, pg_get_indexdef(indexrelid) AS definition
FROM pg_catalog.pg_index
WHERE indrelid IN (
  'public.video_generation_jobs'::regclass,
  'public.video_generation_quality_reviews'::regclass,
  'public.video_generation_reconciliations'::regclass
)
ORDER BY index_name;

-- Must remain empty: a job cannot escape its owning user/memory/reservation.
SELECT j.id, 'ownership_or_reservation_mismatch' AS issue
FROM public.video_generation_jobs j
LEFT JOIN public.memories m ON m.id = j.memory_id AND m.user_id = j.user_id
LEFT JOIN public.commerce_generation_reservations r ON r.id = j.reservation_id AND r.user_id = j.user_id
WHERE m.id IS NULL OR (j.reservation_id IS NOT NULL AND r.id IS NULL);

-- Must remain empty: approval is the sole path to a committed entitlement.
SELECT id, 'terminal_settlement_mismatch' AS issue
FROM public.video_generation_jobs
WHERE (status = 'succeeded' AND (quality_status <> 'approved' OR entitlement_settlement <> 'committed'))
   OR (status IN ('failed', 'rejected') AND entitlement_settlement <> 'released');

-- Must remain empty: only a previously uncertain job may have a reconciliation action.
SELECT r.job_id, 'reconciliation_job_state_mismatch' AS issue
FROM public.video_generation_reconciliations r
JOIN public.video_generation_jobs j ON j.id = r.job_id
WHERE (r.action = 'attach_provider_task' AND j.provider_task_id <> r.provider_task_id)
   OR (r.action = 'release_unresolved' AND j.status <> 'failed');
