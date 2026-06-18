-- 忆见APP V4 — memory_scene_config 表
-- 用于缓存 AI 生成的个性化开屏场景配置

CREATE TABLE IF NOT EXISTS memory_scene_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  emotion TEXT NOT NULL CHECK (emotion IN ('warm', 'sad', 'peaceful', 'nostalgic')),
  color_palette JSONB NOT NULL DEFAULT '[]'::jsonb,
  narration TEXT,
  symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT memory_scene_config_memory_id_key UNIQUE (memory_id)
);

-- 索引：快速按 memory_id 查询
CREATE INDEX IF NOT EXISTS idx_scene_config_memory_id ON memory_scene_config(memory_id);

-- RLS 策略（如果需要）
ALTER TABLE memory_scene_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their scene configs"
  ON memory_scene_config FOR SELECT
  USING (memory_id IN (SELECT id FROM memories WHERE user_phone = current_setting('request.jwt.claims')::json->>'phone'));
