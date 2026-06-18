-- 忆见APP V8 — Memory Room: System Dissolution
-- memory_dissolution_state: tracks structural decay over time

CREATE TABLE IF NOT EXISTS memory_dissolution_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  system_coherence REAL DEFAULT 1.0,
  decay_rate REAL DEFAULT 0.0003,
  dissolution_phase TEXT DEFAULT 'stable'
    CHECK (dissolution_phase IN ('stable','drifting','fragmenting','dissolving','void')),
  structure_fragments JSONB DEFAULT '[]'::jsonb,
  dissolution_json JSONB DEFAULT '{}'::jsonb,
  last_coherence_state REAL DEFAULT 1.0,
  user_presence_count INT DEFAULT 0,
  total_elapsed_ms BIGINT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_dissolution_focus UNIQUE (focus_memory_id)
);

CREATE INDEX IF NOT EXISTS idx_dissolution_focus ON memory_dissolution_state(focus_memory_id);
CREATE INDEX IF NOT EXISTS idx_dissolution_phase ON memory_dissolution_state(dissolution_phase);
CREATE INDEX IF NOT EXISTS idx_dissolution_updated ON memory_dissolution_state(last_updated);

ALTER TABLE memory_dissolution_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read dissolution state"
  ON memory_dissolution_state FOR SELECT
  USING (
    focus_memory_id IN (
      SELECT id FROM memories
      WHERE user_phone = current_setting('request.jwt.claims')::json->>'phone'
    )
  );

CREATE POLICY "Service can upsert dissolution state"
  ON memory_dissolution_state FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─── dissolution_json reference ─────────────────────────
-- {
--   "focusId": "uuid",
--   "nodes": [
--     {
--       "id": "uuid", "name": "string",
--       "x": 50, "y": 35, "vx": 0, "vy": 0,
--       "opacity": 0.5, "coherence": 0.3, "stability": 0.2,
--       "connections": [...], "dissolved": false
--     }
--   ],
--   "systemCoherence": 0.6,
--   "decayRate": 0.0003,
--   "tick": 43200,
--   "elapsedMs": 720000,
--   "phase": "fragmenting",
--   "lastEvent": "Phase shift: drifting → fragmenting"
-- }
