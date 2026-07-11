BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_external_id
  ON users (external_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_memories_idempotency
  ON memories (user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_memories_user_created
  ON memories (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created
  ON memories (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_memory_fragments_content
  ON memory_fragments (memory_id, source_type, content_hash);
CREATE INDEX IF NOT EXISTS idx_memory_fragments_memory_created
  ON memory_fragments (memory_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_user
  ON conversations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_memory
  ON conversations (memory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message
  ON conversations (last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_time
  ON messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_memory_time
  ON messages (memory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_time
  ON messages (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_assets_memory
  ON media_assets (memory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_user
  ON media_assets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_type
  ON media_assets (media_type, status);

CREATE INDEX IF NOT EXISTS idx_consent_records_user
  ON consent_records (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_records_memory
  ON consent_records (memory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_records_status
  ON consent_records (consent_type, status);

CREATE INDEX IF NOT EXISTS idx_provider_jobs_memory
  ON provider_jobs (memory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_jobs_user
  ON provider_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_jobs_status
  ON provider_jobs (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user
  ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_memory
  ON audit_logs (memory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON audit_logs (action, created_at DESC);

COMMIT;
