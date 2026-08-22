-- Additive only. Migration 030 is already deployed to Staging and is never replayed.
BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

ALTER TABLE public.product_interaction_events
  ADD COLUMN IF NOT EXISTS subject_key TEXT;

-- An authenticated subject always wins over an old anonymous cookie value.
UPDATE public.product_interaction_events
   SET anonymous_session_id = NULL
 WHERE owner_id IS NOT NULL
   AND anonymous_session_id IS NOT NULL;

UPDATE public.product_interaction_events
   SET subject_key = CASE
     WHEN owner_id IS NOT NULL THEN 'owner:' || owner_id::text
     WHEN anonymous_session_id IS NOT NULL THEN 'anon:' || anonymous_session_id::text
     ELSE NULL
   END
 WHERE subject_key IS NULL;

ALTER TABLE public.product_interaction_events
  ALTER COLUMN subject_key SET NOT NULL;

ALTER TABLE public.product_interaction_events
  DROP CONSTRAINT ck_product_interaction_event_name,
  ADD CONSTRAINT ck_product_interaction_event_name CHECK (event_name IN (
    'visitor_experience_started', 'photo_selection_started', 'photo_upload_succeeded',
    'initial_video_playback_started', 'initial_video_playback_3s',
    'payment_page_viewed', 'package_selected', 'payment_button_clicked',
    'referral_link_opened', 'family_collaboration_opened',
    'guest_experience_started', 'first_presence_video_played_3s', 'paywall_viewed'
  )),
  ADD CONSTRAINT ck_product_interaction_subject_key CHECK (
    (owner_id IS NOT NULL AND anonymous_session_id IS NULL AND subject_key = 'owner:' || owner_id::text)
    OR (owner_id IS NULL AND anonymous_session_id IS NOT NULL AND subject_key = 'anon:' || anonymous_session_id::text)
  );

-- The database remains content-free even if a future caller bypasses the web
-- handler. Event-specific property validation stays in the TypeScript union.
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
       WHERE (key = 'surface' AND (
                jsonb_typeof(value) <> 'string'
                OR value #>> '{}' NOT IN ('guest_home', 'first_presence', 'commerce')
              ))
          OR (key = 'elapsed_ms' AND (jsonb_typeof(value) <> 'number' OR value #>> '{}' <> '3000'))
          OR (key = 'job_id' AND (jsonb_typeof(value) <> 'string' OR value #>> '{}' !~ '^[0-9a-f]{8}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$'))
          OR (key = 'offer_id' AND (jsonb_typeof(value) <> 'string' OR value #>> '{}' !~ '^[a-z0-9._:-]{1,64}$'))
          OR key NOT IN ('surface', 'elapsed_ms', 'job_id', 'offer_id')
     );
$$;

DROP INDEX public.ux_product_interaction_events_idempotency;
CREATE UNIQUE INDEX ux_product_interaction_events_subject_idempotency
  ON public.product_interaction_events (environment, event_name, schema_version, subject_key, idempotency_key);

COMMIT;
