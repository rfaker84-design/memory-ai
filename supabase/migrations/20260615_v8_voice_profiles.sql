-- 忆见 V8 数字人+声音克隆 - user_voice_profiles
CREATE TABLE IF NOT EXISTS user_voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL,
  memory_id UUID REFERENCES memories(id),
  voice_id TEXT NOT NULL,
  voice_url TEXT,
  voice_provider TEXT DEFAULT 'tencent_tts',
  voice_status TEXT DEFAULT 'active' CHECK (voice_status IN ('active', 'training', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_phone, memory_id)
);
CREATE INDEX IF NOT EXISTS idx_uvp_user ON user_voice_profiles(user_phone);
CREATE INDEX IF NOT EXISTS idx_uvp_memory ON user_voice_profiles(memory_id);
ALTER TABLE user_voice_profiles DISABLE ROW LEVEL SECURITY;
