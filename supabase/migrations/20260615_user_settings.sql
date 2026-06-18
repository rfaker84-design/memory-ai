-- V3 产品稳定层 - user_settings 表
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
