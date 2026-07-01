-- 002_alter_chat_messages_for_sessions.sql
-- Safe ALTER migration: adds session_id / tokens / metadata / updated_at
-- to the existing chat_messages table without removing any columns or data.
-- Run AFTER 001_create_chat_tables.sql.
-- Does NOT execute automatically; manual migration only.

-- ============================================================
-- 1. Ensure chat_sessions exists (idempotent via 001)
-- ============================================================
-- Rely on 001_create_chat_tables.sql having been run first.
-- If 001 was NOT run, this DO block creates chat_sessions as a
-- safety net so the subsequent FK can be created.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'chat_sessions'
  ) THEN
    CREATE TABLE chat_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      last_message_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_memory
      ON chat_sessions (memory_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
      ON chat_sessions (user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_msg
      ON chat_sessions (last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_created
      ON chat_sessions (created_at DESC);
  END IF;
END $$;

-- ============================================================
-- 2. ALTER chat_messages — add new V2 columns
-- ============================================================

-- session_id: link messages to sessions (nullable for old rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'chat_messages'
      AND column_name  = 'session_id'
  ) THEN
    ALTER TABLE chat_messages
      ADD COLUMN session_id UUID
        REFERENCES chat_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- tokens: track LLM token consumption per message
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'chat_messages'
      AND column_name  = 'tokens'
  ) THEN
    ALTER TABLE chat_messages
      ADD COLUMN tokens INTEGER;
  END IF;
END $$;

-- metadata: extensible JSON blob (emotion, latency, model, etc.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'chat_messages'
      AND column_name  = 'metadata'
  ) THEN
    ALTER TABLE chat_messages
      ADD COLUMN metadata JSONB;
  END IF;
END $$;

-- updated_at: soft-modification timestamp (defaults to NOW for old rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'chat_messages'
      AND column_name  = 'updated_at'
  ) THEN
    ALTER TABLE chat_messages
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- ============================================================
-- 3. Add new indexes (idempotent)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON chat_messages (session_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_memory
  ON chat_messages (memory_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created
  ON chat_messages (created_at DESC);

-- ============================================================
-- 4. RLS / Policies
-- ============================================================
-- TODO: Enable RLS and define policies after CTO approval.
-- TODO: Consider a trigger function to auto-set updated_at on row
--       modification (add in a later migration).
-- TODO: After a data backfill run, session_id can be made NOT NULL
--       for newly inserted rows enforced at the application layer
--       (or via a CHECK constraint added in a follow-up migration).
