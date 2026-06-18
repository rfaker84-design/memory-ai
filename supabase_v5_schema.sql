-- 忆见APP V5 — memory_world_config 表
-- 用于缓存 AI 生成的记忆世界配置

CREATE TABLE IF NOT EXISTS memory_world_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  world_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  narration_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT memory_world_config_memory_id_key UNIQUE (memory_id)
);

CREATE INDEX IF NOT EXISTS idx_world_config_memory_id ON memory_world_config(memory_id);

ALTER TABLE memory_world_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their world configs"
  ON memory_world_config FOR SELECT
  USING (memory_id IN (SELECT id FROM memories WHERE user_phone = current_setting('request.jwt.claims')::json->>'phone'));