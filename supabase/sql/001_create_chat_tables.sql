-- 001_create_chat_tables.sql
-- Chat Domain tables per docs/Database/chat-schema-design.md.
-- Run this file against your Supabase PostgreSQL instance.
-- Does NOT execute automatically; manual migration only.

-- ============================================================
-- chat_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_memory
  ON chat_sessions (memory_id);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
  ON chat_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_msg
  ON chat_sessions (last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_created
  ON chat_sessions (created_at DESC);

-- ============================================================
-- chat_messages (V2 design)
-- ============================================================
-- TODO: The existing chat_messages table (supabase_mvp_schema.sql) does
-- NOT include session_id, tokens, or metadata columns. If that table
-- already exists in the database, this CREATE TABLE IF NOT EXISTS will
-- be a no-op and a separate ALTER TABLE migration is needed to add:
--   session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
--   tokens INTEGER,
--   metadata JSONB
-- After confirming the current schema state, create a follow-on
-- migration SQL file instead of altering the DDL inline.

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON chat_messages (session_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_memory
  ON chat_messages (memory_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user
  ON chat_messages (user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created
  ON chat_messages (created_at DESC);

-- ============================================================
-- updated_at trigger helper (optional convenience)
-- ============================================================
-- TODO: Enable RLS policies after CTO approval.
-- TODO: Create a trigger function to auto-update updated_at on row
--       modification (not included here; add in a later migration).
