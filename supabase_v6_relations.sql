-- V6: memory_relationship_graph + memory_clusters
CREATE TABLE IF NOT EXISTS memory_relationship_graph (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_memory_id UUID NOT NULL UNIQUE REFERENCES memories(id) ON DELETE CASCADE,
  network_json JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memory_relationship_graph ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read relationship graph" ON memory_relationship_graph FOR SELECT USING (true);
CREATE POLICY "upsert relationship graph" ON memory_relationship_graph FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS memory_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id TEXT NOT NULL,
  name TEXT NOT NULL,
  member_ids TEXT[] NOT NULL DEFAULT '{}',
  dominant_emotion TEXT DEFAULT 'peaceful',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clusters_cluster_id ON memory_clusters(cluster_id);