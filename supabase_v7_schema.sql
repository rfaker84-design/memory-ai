-- Òä¼ûAPP V7 ¡ª memory_graph_edges ±í

CREATE TABLE IF NOT EXISTS memory_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  to_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('family','emotional','shared_memory','time_overlap')),
  strength REAL NOT NULL DEFAULT 0.5,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_edge UNIQUE (from_memory_id, to_memory_id)
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON memory_graph_edges(from_memory_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON memory_graph_edges(to_memory_id);

ALTER TABLE memory_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their edges"
  ON memory_graph_edges FOR SELECT
  USING (
    from_memory_id IN (SELECT id FROM memories WHERE user_phone = current_setting('request.jwt.claims')::json->>'phone')
    OR to_memory_id IN (SELECT id FROM memories WHERE user_phone = current_setting('request.jwt.claims')::json->>'phone')
  );