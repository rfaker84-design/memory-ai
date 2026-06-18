-- 忆见 V5 增长闭环系统 - 数据库迁移

-- 1. 留存追踪
CREATE TABLE IF NOT EXISTS user_retention_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL UNIQUE,
  first_visit_at TIMESTAMPTZ DEFAULT now(),
  last_visit_at TIMESTAMPTZ DEFAULT now(),
  d1_returned BOOLEAN DEFAULT false,
  d7_returned BOOLEAN DEFAULT false,
  total_visits INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 用户行为日志
CREATE TABLE IF NOT EXISTS user_behavior_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('chat', 'emotion', 'share', 'return', 'voice', 'visit')),
  memory_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_behavior_user
ON user_behavior_log (user_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_behavior_event
ON user_behavior_log (event_type, created_at DESC);

-- 3. 转化分字段（加到 user_settings）
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS conversion_intent_score INTEGER DEFAULT 0 CHECK (conversion_intent_score >= 0 AND conversion_intent_score <= 100);

-- 4. RLS 禁用
ALTER TABLE user_retention_tracking DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_behavior_log DISABLE ROW LEVEL SECURITY;
GRANT ALL ON user_retention_tracking TO anon, authenticated, service_role;
GRANT ALL ON user_behavior_log TO anon, authenticated, service_role;
