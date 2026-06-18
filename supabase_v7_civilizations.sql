-- V7: memory_civilizations — 记忆文明系统
CREATE TABLE IF NOT EXISTS memory_civilizations (
  id TEXT PRIMARY KEY DEFAULT 'global_map',
  map_json JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memory_civilizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read civilizations" ON memory_civilizations FOR SELECT USING (true);
CREATE POLICY "service upsert civilizations" ON memory_civilizations FOR ALL USING (true);

-- 文明演化日志
CREATE TABLE IF NOT EXISTS civilization_evolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  civilization_id TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- 'created' | 'merged' | 'split' | 'grew' | 'declined' | 'stabilized'
  memory_count INTEGER,
  stability_index REAL,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evolution_civ ON civilization_evolution_log(civilization_id, created_at DESC);