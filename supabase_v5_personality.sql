-- V5: memory_personality_state — 持续人格系统
CREATE TABLE IF NOT EXISTS memory_personality_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL UNIQUE REFERENCES memories(id) ON DELETE CASCADE,
  personality_core JSONB NOT NULL DEFAULT '{}',
  relationship_state JSONB NOT NULL DEFAULT '{}',
  interaction_highlights JSONB DEFAULT '[]',
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memory_personality_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read personality" ON memory_personality_state FOR SELECT USING (true);
CREATE POLICY "upsert personality" ON memory_personality_state FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_personality_memory ON memory_personality_state(memory_id);