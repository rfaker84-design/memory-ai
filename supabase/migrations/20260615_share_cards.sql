-- 忆见病毒传播系统 V1 - 数据库迁移
-- share_cards: 分享内容卡片
-- referrals: 裂变追踪

CREATE TABLE IF NOT EXISTS share_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
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
  share_id UUID REFERENCES share_cards(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_from
ON referrals (from_user);

CREATE INDEX IF NOT EXISTS idx_referrals_share
ON referrals (share_id);

ALTER TABLE share_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE referrals DISABLE ROW LEVEL SECURITY;
GRANT ALL ON share_cards TO anon, authenticated, service_role;
GRANT ALL ON referrals TO anon, authenticated, service_role;
