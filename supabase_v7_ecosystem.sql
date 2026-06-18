-- 忆见APP V7 — Memory Room: Self-Evolving Ecosystem
-- memory_ecosystem_state: persisted ecosystem snapshots

CREATE TABLE IF NOT EXISTS memory_ecosystem_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  ecosystem_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  evolution_history JSONB DEFAULT '[]'::jsonb,
  mutation_log JSONB DEFAULT '[]'::jsonb,
  environmental_pressure REAL DEFAULT 0.3,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_ecosystem_focus UNIQUE (focus_memory_id)
);

CREATE INDEX IF NOT EXISTS idx_ecosystem_focus ON memory_ecosystem_state(focus_memory_id);
CREATE INDEX IF NOT EXISTS idx_ecosystem_updated ON memory_ecosystem_state(last_updated);

ALTER TABLE memory_ecosystem_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read ecosystem state"
  ON memory_ecosystem_state FOR SELECT
  USING (
    focus_memory_id IN (SELECT id FROM memories WHERE user_phone = current_setting('request.jwt.claims')::json->>'phone')
  );

CREATE POLICY "Service can upsert ecosystem state"
  ON memory_ecosystem_state FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─── ecosystem_json structure reference ─────────────────
-- {
--   "focusId": "uuid",
--   "nodes": [
--     {
--       "id": "uuid",
--       "name": "string",
--       "relationship": "string",
--       "x": 50.0, "y": 35.0,
--       "vx": 0.0, "vy": 0.0,
--       "mass": 0.5,
--       "energy": 0.5,
--       "mutationStage": 0,
--       "clusterTag": "string|null",
--       "connections": [
--         { "to": "uuid", "strength": 0.5, "type": "family|emotional|support" }
--       ]
--     }
--   ],
--   "environmentalPressure": 0.3,
--   "evolutionSpeed": 1.0,
--   "tick": 0,
--   "lastMutation": "string|null",
--   "generatedAt": 1234567890
-- }
