-- Òä¼ûAPP V9 ¡ª mind_continuity_state ±í

CREATE TABLE IF NOT EXISTS mind_continuity_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  memory_name TEXT,
  behavioral_vector JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
  emotional_dynamics JSONB NOT NULL DEFAULT '[]'::jsonb,
  continuity_score REAL NOT NULL DEFAULT 0.6,
  last_reconstruction TIMESTAMPTZ DEFAULT NOW(),
  prediction_confidence REAL NOT NULL DEFAULT 0.5,
  sample_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT mind_continuity_state_memory_id_key UNIQUE (memory_id)
);

CREATE INDEX IF NOT EXISTS idx_mind_memory_id ON mind_continuity_state(memory_id);

ALTER TABLE mind_continuity_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read mind states"
  ON mind_continuity_state FOR SELECT
  USING (memory_id IN (SELECT id FROM memories WHERE user_phone = current_setting('request.jwt.claims')::json->>'phone'));