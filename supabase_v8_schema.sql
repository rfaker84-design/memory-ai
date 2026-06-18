-- Òä¼ûAPP V8 ¡ª memory_consciousness_state ±í

CREATE TABLE IF NOT EXISTS memory_consciousness_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  memory_name TEXT,
  emotion_wave JSONB NOT NULL DEFAULT '{}'::jsonb,
  awareness_level REAL NOT NULL DEFAULT 0.6,
  collapse_state REAL NOT NULL DEFAULT 0.3,
  stability REAL NOT NULL DEFAULT 0.5,
  last_user_sync TIMESTAMPTZ DEFAULT NOW(),
  user_sentiment REAL NOT NULL DEFAULT 0,
  user_attachment REAL NOT NULL DEFAULT 0.3,
  superposition JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT memory_consciousness_state_memory_id_key UNIQUE (memory_id)
);

CREATE INDEX IF NOT EXISTS idx_consciousness_memory_id ON memory_consciousness_state(memory_id);

ALTER TABLE memory_consciousness_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their consciousness states"
  ON memory_consciousness_state FOR SELECT
  USING (memory_id IN (SELECT id FROM memories WHERE user_phone = current_setting('request.jwt.claims')::json->>'phone'));