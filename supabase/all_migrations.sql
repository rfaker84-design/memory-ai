
-- ===== 20260614_voice_clone_jobs.sql =====
-- Voice clone and digital human job fields for MemoryAI.
-- Run this once in Supabase SQL Editor before enabling real workers.

alter table memories
add column if not exists voice_provider text,
add column if not exists voice_model_id text,
add column if not exists voice_model_url text,
add column if not exists voice_clone_error text,
add column if not exists avatar_error text;

alter table avatar_jobs
add column if not exists user_phone text,
add column if not exists progress integer default 0,
add column if not exists retry_count integer default 0,
add column if not exists provider_request jsonb,
add column if not exists updated_at timestamptz default now();

create index if not exists idx_avatar_jobs_memory_id_created_at
on avatar_jobs (memory_id, created_at desc);

create index if not exists idx_avatar_jobs_user_phone_created_at
on avatar_jobs (user_phone, created_at desc);

create index if not exists idx_avatar_jobs_status
on avatar_jobs (status);


-- ===== 20260615_emotion_engine.sql =====
﻿-- 情绪记忆引擎 V1 - 数据库迁移
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


-- ===== 20260615_proactive_companion.sql =====
﻿-- AI主动陪伴系统 V1 - 数据库迁移
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


-- ===== 20260615_user_settings.sql =====
﻿-- V3 产品稳定层 - user_settings 表
-- 存储用户对 AI 陪伴行为的所有偏好设置

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL UNIQUE,
  -- 计划类型 (free / pro / premium)
  user_plan TEXT NOT NULL DEFAULT 'free' CHECK (user_plan IN ('free', 'pro', 'premium')),
  -- 主动陪伴开关
  proactive_enabled BOOLEAN NOT NULL DEFAULT true,
  -- 每日最大主动消息数 (覆盖计划默认值，0表示使用计划默认)
  proactive_daily_max INTEGER NOT NULL DEFAULT 0,
  -- 情绪触发开关
  emotion_trigger_enabled BOOLEAN NOT NULL DEFAULT true,
  -- 夜间陪伴模式
  night_mode_enabled BOOLEAN NOT NULL DEFAULT true,
  -- 不活跃触发开关
  inactivity_trigger_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ===== 20260615_v4_personality_relationship.sql =====
﻿-- V4 人格系统 + 关系成长系统

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



-- ===== 20260615_share_cards.sql =====
CREATE TABLE IF NOT EXISTS share_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL,
  user_phone TEXT,
  content_text TEXT NOT NULL,
  video_url TEXT,
  audio_url TEXT,
  emotion_tag TEXT DEFAULT 'neutral',
  share_title TEXT,
  og_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_cards_memory
ON share_cards (memory_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user TEXT,
  to_user TEXT,
  share_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_from
ON referrals (from_user);

CREATE INDEX IF NOT EXISTS idx_referrals_share
ON referrals (share_id);

ALTER TABLE share_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE referrals DISABLE ROW LEVEL SECURITY;

