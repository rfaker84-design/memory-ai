-- 忆见APP V6 — memory_entity_state 表
-- 数字生命体持久状态存储

CREATE TABLE IF NOT EXISTS memory_entity_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  personality_vector JSONB NOT NULL DEFAULT '{}'::jsonb,
  emotion_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  memory_graph JSONB NOT NULL DEFAULT '{}'::jsonb,
  relationship_model JSONB NOT NULL DEFAULT '{}'::jsonb,
  lifecycle TEXT NOT NULL DEFAULT 'awakening' CHECK (lifecycle IN ('awakening','present','reflecting','sleeping','dormant')),
  presence_intensity REAL NOT NULL DEFAULT 0.6,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  evolution_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT memory_entity_state_memory_id_key UNIQUE (memory_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_state_memory_id ON memory_entity_state(memory_id);
CREATE INDEX IF NOT EXISTS idx_entity_state_lifecycle ON memory_entity_state(lifecycle);

ALTER TABLE memory_entity_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their entity states"
  ON memory_entity_state FOR SELECT
  USING (memory_id IN (SELECT id FROM memories WHERE user_phone = current_setting('request.jwt.claims')::json->>'phone'));