-- CANDIDATE ONLY: do not add to an automatic runner or execute in Staging/production.
-- This records an account's opt-in preference only. It does not register a
-- device, subscribe a browser, or claim that a notification was delivered.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION '027 requires users';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  greeting_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
