-- 忆见 MemoryAI MVP — Production Schema
-- Supabase SQL to run in SQL Editor

-- 1. Memories table
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT,
  life_story TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_phone);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);

-- 2. Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  user_phone TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_memory ON chat_messages(memory_id);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_phone);
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at);

-- 3. RLS — simple: phone-based access
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: users read/write their own memories
CREATE POLICY "Users manage own memories"
  ON memories FOR ALL
  USING (user_phone = current_setting('request.jwt.claims')::json->>'phone')
  WITH CHECK (user_phone = current_setting('request.jwt.claims')::json->>'phone');

-- Policy: users manage chat messages for their memories
CREATE POLICY "Users manage chat messages"
  ON chat_messages FOR ALL
  USING (user_phone = current_setting('request.jwt.claims')::json->>'phone')
  WITH CHECK (user_phone = current_setting('request.jwt.claims')::json->>'phone');

-- 4. Allow service_role to bypass RLS
CREATE POLICY "Service role full access memories"
  ON memories FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access chat"
  ON chat_messages FOR ALL
  USING (true)
  WITH CHECK (true);
