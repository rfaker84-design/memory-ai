-- 005_create_audit_logs.sql
-- Audit domain table per docs/Database/audit-schema-design.md.
-- Run manually against Supabase PostgreSQL.

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT ''info'',
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT ''{}''::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_user
  ON audit_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_memory
  ON audit_logs (memory_id);

CREATE INDEX IF NOT EXISTS idx_audit_action
  ON audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_audit_level
  ON audit_logs (level);

CREATE INDEX IF NOT EXISTS idx_audit_created
  ON audit_logs (created_at DESC);

-- TODO: Enable RLS policies after CTO approval.
