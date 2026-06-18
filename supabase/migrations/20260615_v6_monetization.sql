-- 忆见 V6 商业爆发模型 - 数据库迁移

-- 1. 订阅字段
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS subscription_type TEXT DEFAULT 'free' CHECK (subscription_type IN ('free', 'pro', 'premium')),
ADD COLUMN IF NOT EXISTS emotion_unlock_level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS voice_quality_level TEXT DEFAULT 'basic' CHECK (voice_quality_level IN ('basic', 'hd', 'full')),
ADD COLUMN IF NOT EXISTS video_quality_level TEXT DEFAULT 'basic' CHECK (video_quality_level IN ('basic', 'hd', 'full'));

-- 2. 分享付费联动
ALTER TABLE share_cards
ADD COLUMN IF NOT EXISTS paywall_link BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS referral_unlock BOOLEAN DEFAULT false;
