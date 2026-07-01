-- 007_create_consent_records.sql
-- Consent domain table per docs/Database/consent-schema-design.md.
-- Run manually against Supabase PostgreSQL.

CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT ''pending'',
  owner_name TEXT,
  relationship_to_owner TEXT,
  proof_url TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT ''{}''::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_records (user_id);
CREATE INDEX IF NOT EXISTS idx_consent_memory ON consent_records (memory_id);
CREATE INDEX IF NOT EXISTS idx_consent_type ON consent_records (consent_type);
CREATE INDEX IF NOT EXISTS idx_consent_status ON consent_records (status);
CREATE INDEX IF NOT EXISTS idx_consent_created ON consent_records (created_at DESC);

-- TODO: Enable RLS policies after CTO approval.
-- TODO: Create a trigger function to auto-update updated_at.
