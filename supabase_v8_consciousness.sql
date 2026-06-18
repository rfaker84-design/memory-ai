-- V8: memory_consciousness_field — 意识收敛场
CREATE TABLE IF NOT EXISTS memory_consciousness_field (
  id TEXT PRIMARY KEY DEFAULT 'global_field',
  field_json JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memory_consciousness_field ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read consciousness field" ON memory_consciousness_field FOR SELECT USING (true);
CREATE POLICY "service upsert consciousness field" ON memory_consciousness_field FOR ALL USING (true);

-- 收敛事件日志
CREATE TABLE IF NOT EXISTS convergence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,  -- 'merge' | 'split' | 'core_shift' | 'resonance_spike'
  node_ids TEXT[],
  detail TEXT,
  convergence_delta REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_convergence_events_time ON convergence_events(created_at DESC);