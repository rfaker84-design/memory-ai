-- 006_create_risk_events.sql
-- Risk control domain table per docs/Database/risk-schema-design.md.
-- Run manually against Supabase PostgreSQL.

CREATE TABLE IF NOT EXISTS risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,
  risk_type TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT ''{}''::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_user
  ON risk_events (user_id);
CREATE INDEX IF NOT EXISTS idx_risk_memory
  ON risk_events (memory_id);
CREATE INDEX IF NOT EXISTS idx_risk_type
  ON risk_events (risk_type);
CREATE INDEX IF NOT EXISTS idx_risk_level
  ON risk_events (level);
CREATE INDEX IF NOT EXISTS idx_risk_created
  ON risk_events (created_at DESC);

-- TODO: Enable RLS policies after CTO approval.
