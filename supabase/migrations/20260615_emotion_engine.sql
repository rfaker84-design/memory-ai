-- 情绪记忆引擎 V1 - 数据库迁移
-- 在 chat_messages 表添加 emotion 字段（可选，不影响现有数据）

ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS emotion TEXT;

-- 创建索引加速情绪查询
CREATE INDEX IF NOT EXISTS idx_chat_messages_emotion
ON chat_messages (emotion)
WHERE emotion IS NOT NULL;

-- 创建用户情绪状态表（维护最近情绪状态）
CREATE TABLE IF NOT EXISTS user_emotion_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL,
  recent_emotions JSONB DEFAULT '[]'::jsonb,
  dominant_emotion TEXT DEFAULT 'neutral',
  emotion_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 每个用户一条记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_emotion_state_phone
ON user_emotion_state (user_phone);
