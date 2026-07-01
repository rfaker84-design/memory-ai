-- 003_create_media_assets.sql
-- Media Domain table per docs/Database/media-schema-design.md.
-- Run manually against Supabase PostgreSQL.
-- Executed successfully on 2026-06-30.

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  url TEXT,
  thumbnail_url TEXT,
  mime_type TEXT,
  size BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_memory
  ON media_assets (memory_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_user
  ON media_assets (user_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_type
  ON media_assets (media_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_created
  ON media_assets (created_at DESC);

-- TODO: Enable RLS policies after CTO approval.
-- TODO: Create a trigger function to auto-update updated_at.
