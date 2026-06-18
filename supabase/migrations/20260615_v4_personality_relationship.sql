-- V4 人格系统 + 关系成长系统

-- 1. 给 memories 表增加人格字段
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS personality_type TEXT DEFAULT 'friend'
CHECK (personality_type IN ('father', 'mother', 'friend', 'mentor'));

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS personality_traits JSONB DEFAULT '{"warmth":0.6,"talkativeness":0.5,"emotion_expression":0.5,"formality":0.3}'::jsonb;

-- 2. 用户-记忆体关系成长表
CREATE TABLE IF NOT EXISTS user_memory_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  user_phone TEXT NOT NULL,
  relationship_score INTEGER NOT NULL DEFAULT 0 CHECK (relationship_score >= 0 AND relationship_score <= 100),
  total_chats INTEGER NOT NULL DEFAULT 0,
  emotional_chats INTEGER NOT NULL DEFAULT 0,
  deep_chats INTEGER NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_umr_memory_user
ON user_memory_relationships (memory_id, user_phone);
