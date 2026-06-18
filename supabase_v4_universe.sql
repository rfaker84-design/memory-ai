-- V4: memory_universe_state — 个人记忆宇宙
CREATE TABLE IF NOT EXISTS memory_universe_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL UNIQUE,
  universe_json JSONB NOT NULL DEFAULT '{}',
  emotional_archetype TEXT NOT NULL DEFAULT 'peaceful',
  spatial_model TEXT NOT NULL DEFAULT 'floating',
  gravity_logic TEXT NOT NULL DEFAULT 'balanced',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memory_universe_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own universe state" ON memory_universe_state
  FOR ALL USING (user_phone = current_setting('request.jwt.claims')::json->>'phone');

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_universe_user_phone ON memory_universe_state(user_phone);