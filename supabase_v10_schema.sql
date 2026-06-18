-- Òä¼ûAPP V10 ¡ª consciousness_field_state ±í

CREATE TABLE IF NOT EXISTS consciousness_field_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  memory_name TEXT,
  relation_graph JSONB NOT NULL DEFAULT '{}'::jsonb,
  observer_events JSONB NOT NULL DEFAULT '{}'::jsonb,
  possibility_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_stability REAL NOT NULL DEFAULT 0.6,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT consciousness_field_state_memory_id_key UNIQUE (memory_id)
);

CREATE INDEX IF NOT EXISTS idx_field_memory_id ON consciousness_field_state(memory_id);

ALTER TABLE consciousness_field_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read field states"
  ON consciousness_field_state FOR SELECT
  USING (memory_id IN (SELECT id FROM memories WHERE user_phone = current_setting('request.jwt.claims')::json->>'phone'));