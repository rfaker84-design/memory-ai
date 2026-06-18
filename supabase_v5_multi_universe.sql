-- V5: memory_multi_universe_state — 多用户记忆宇宙系统
CREATE TABLE IF NOT EXISTS memory_multi_universe_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL UNIQUE,
  state_json JSONB NOT NULL DEFAULT '{}',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memory_multi_universe_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own multi universe" ON memory_multi_universe_state
  FOR ALL USING (user_phone = current_setting('request.jwt.claims')::json->>'phone');

CREATE INDEX IF NOT EXISTS idx_multi_universe_phone ON memory_multi_universe_state(user_phone);

-- 为 memories 表添加 V5 字段（如果不存在）
ALTER TABLE memories ADD COLUMN IF NOT EXISTS family_id TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS family_group TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT FALSE;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS shared_by TEXT[] DEFAULT '{}';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS creator_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_memories_family_group ON memories(family_group);
CREATE INDEX IF NOT EXISTS idx_memories_shared ON memories(is_shared) WHERE is_shared = TRUE;