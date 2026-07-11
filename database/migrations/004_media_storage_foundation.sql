BEGIN;

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS upload_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleanup_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleaned_at TIMESTAMPTZ;

UPDATE media_assets SET sha256 = encode(digest(id::text, 'sha256'), 'hex') WHERE sha256 IS NULL;
UPDATE media_assets SET media_type = lower(media_type), status = lower(status);
ALTER TABLE media_assets ALTER COLUMN sha256 SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_media_assets_active_hash
  ON media_assets (user_id, memory_id, media_type, sha256)
  WHERE deleted_at IS NULL AND status IN ('pending', 'uploaded');
CREATE INDEX IF NOT EXISTS idx_media_assets_cleanup
  ON media_assets (cleanup_after ASC)
  WHERE status IN ('deleted', 'cleanup_failed') AND cleaned_at IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_media_assets_sha256') THEN
    ALTER TABLE media_assets ADD CONSTRAINT ck_media_assets_sha256 CHECK (sha256 ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_media_assets_status_v2') THEN
    ALTER TABLE media_assets ADD CONSTRAINT ck_media_assets_status_v2
      CHECK (status IN ('pending', 'uploaded', 'failed', 'deleted', 'cleanup_failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_media_assets_type_v2') THEN
    ALTER TABLE media_assets ADD CONSTRAINT ck_media_assets_type_v2
      CHECK (media_type IN ('image', 'audio', 'video', 'avatar', 'document'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_media_assets_upload_attempts') THEN
    ALTER TABLE media_assets ADD CONSTRAINT ck_media_assets_upload_attempts CHECK (upload_attempts >= 0);
  END IF;
END $$;

COMMIT;
