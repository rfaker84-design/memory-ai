-- AI主动陪伴系统 V1 - 数据库迁移
-- proactive_messages: 存储 AI 主动生成的对话

CREATE TABLE IF NOT EXISTS proactive_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  user_phone TEXT NOT NULL,
  content TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('inactivity', 'emotion', 'time_based')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  emotion_context TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 索引：按 memory_id + status 查询
CREATE INDEX IF NOT EXISTS idx_proactive_messages_memory_status
ON proactive_messages (memory_id, status);

-- 索引：按创建时间倒序
CREATE INDEX IF NOT EXISTS idx_proactive_messages_created
ON proactive_messages (created_at DESC);

-- 去重约束：同一 memory 同一 trigger_type 在 6 小时内不重复
-- (在应用层实现)
