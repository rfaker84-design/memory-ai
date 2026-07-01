-- 004_create_long_term_memories.sql
-- Long-Term Memory domain table per docs/Database/long-term-memory-schema-design.md.
-- Run manually against Supabase PostgreSQL.
-- Does NOT execute automatically.

CREATE TABLE IF NOT EXISTS long_term_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  importance INTEGER NOT NULL DEFAULT 50,
  tags TEXT[] NOT NULL DEFAULT ''{}'',
  embedding JSONB,
  metadata JSONB NOT NULL DEFAULT ''{}''::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ltm_memory
  ON long_term_memories (memory_id);

CREATE INDEX IF NOT EXISTS idx_ltm_user
  ON long_term_memories (user_id);

CREATE INDEX IF NOT EXISTS idx_ltm_source_type
  ON long_term_memories (source_type);

CREATE INDEX IF NOT EXISTS idx_ltm_importance
  ON long_term_memories (importance DESC);

CREATE INDEX IF NOT EXISTS idx_ltm_created
  ON long_term_memories (created_at DESC);

-- TODO: Enable RLS policies after CTO approval.
-- TODO: Create a trigger function to auto-update updated_at.
