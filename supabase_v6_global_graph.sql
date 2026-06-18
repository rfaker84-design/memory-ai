-- V6: global_memory_graph — 全球记忆网络
CREATE TABLE IF NOT EXISTS global_memory_graph (
  id TEXT PRIMARY KEY DEFAULT 'global_stream',
  stream_json JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE global_memory_graph ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read global graph" ON global_memory_graph FOR SELECT USING (true);
CREATE POLICY "service upsert global graph" ON global_memory_graph FOR ALL USING (true);

-- 全球共鸣索引
CREATE TABLE IF NOT EXISTS global_resonance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  action TEXT NOT NULL,   -- 'access' | 'resonate' | 'pulse'
  source_user TEXT,
  resonance_delta REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resonance_memory ON global_resonance_log(memory_id, created_at DESC);

-- 为 memories 表添加全球字段
ALTER TABLE memories ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS global_resonance REAL DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS global_access_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_memories_global_resonance ON memories(global_resonance DESC) WHERE is_global = TRUE;