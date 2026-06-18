-- V3: memory_space_state
CREATE TABLE IF NOT EXISTS memory_space_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL UNIQUE,
  space_type TEXT NOT NULL DEFAULT 'calm',
  gravity_center UUID REFERENCES memories(id) ON DELETE SET NULL,
  dominant_emotion TEXT NOT NULL DEFAULT 'warmth',
  layout_seed INTEGER NOT NULL DEFAULT 42,
  color_shift JSONB NOT NULL DEFAULT '{"hue":215,"saturation":50,"brightness":40}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE memory_space_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own space" ON memory_space_state FOR ALL USING (user_phone = current_setting('request.jwt.claims')::json->>'phone');