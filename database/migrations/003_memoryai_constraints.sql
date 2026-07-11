BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_memories_user') THEN
    ALTER TABLE memories
      ADD CONSTRAINT fk_memories_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_memory_fragments_memory') THEN
    ALTER TABLE memory_fragments
      ADD CONSTRAINT fk_memory_fragments_memory
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_user') THEN
    ALTER TABLE conversations
      ADD CONSTRAINT fk_conversations_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_memory') THEN
    ALTER TABLE conversations
      ADD CONSTRAINT fk_conversations_memory
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_conversation') THEN
    ALTER TABLE messages
      ADD CONSTRAINT fk_messages_conversation
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_user') THEN
    ALTER TABLE messages
      ADD CONSTRAINT fk_messages_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_memory') THEN
    ALTER TABLE messages
      ADD CONSTRAINT fk_messages_memory
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_media_assets_user') THEN
    ALTER TABLE media_assets
      ADD CONSTRAINT fk_media_assets_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_media_assets_memory') THEN
    ALTER TABLE media_assets
      ADD CONSTRAINT fk_media_assets_memory
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_consent_records_user') THEN
    ALTER TABLE consent_records
      ADD CONSTRAINT fk_consent_records_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_consent_records_memory') THEN
    ALTER TABLE consent_records
      ADD CONSTRAINT fk_consent_records_memory
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_provider_jobs_user') THEN
    ALTER TABLE provider_jobs
      ADD CONSTRAINT fk_provider_jobs_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_provider_jobs_memory') THEN
    ALTER TABLE provider_jobs
      ADD CONSTRAINT fk_provider_jobs_memory
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_memories_avatar_job') THEN
    ALTER TABLE memories
      ADD CONSTRAINT fk_memories_avatar_job
      FOREIGN KEY (avatar_job_id) REFERENCES provider_jobs(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_logs_user') THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT fk_audit_logs_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_audit_logs_memory') THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT fk_audit_logs_memory
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE SET NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_memories_name') THEN
    ALTER TABLE memories
      ADD CONSTRAINT ck_memories_name CHECK (length(btrim(name)) BETWEEN 1 AND 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_memories_birth_year') THEN
    ALTER TABLE memories
      ADD CONSTRAINT ck_memories_birth_year CHECK (birth_year IS NULL OR birth_year BETWEEN 0 AND 9999);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_memories_death_year') THEN
    ALTER TABLE memories
      ADD CONSTRAINT ck_memories_death_year CHECK (death_year IS NULL OR death_year BETWEEN 0 AND 9999);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_messages_role') THEN
    ALTER TABLE messages
      ADD CONSTRAINT ck_messages_role CHECK (role IN ('user', 'assistant', 'system'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_messages_tokens') THEN
    ALTER TABLE messages
      ADD CONSTRAINT ck_messages_tokens CHECK (tokens IS NULL OR tokens >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_media_assets_size') THEN
    ALTER TABLE media_assets
      ADD CONSTRAINT ck_media_assets_size CHECK (size_bytes IS NULL OR size_bytes >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_provider_jobs_progress') THEN
    ALTER TABLE provider_jobs
      ADD CONSTRAINT ck_provider_jobs_progress CHECK (progress BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_provider_jobs_retry_count') THEN
    ALTER TABLE provider_jobs
      ADD CONSTRAINT ck_provider_jobs_retry_count CHECK (retry_count >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_audit_logs_level') THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT ck_audit_logs_level CHECK (level IN ('info', 'warning', 'error', 'critical'));
  END IF;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'memories',
    'memory_fragments',
    'conversations',
    'messages',
    'media_assets',
    'consent_records',
    'provider_jobs'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION memoryai_set_updated_at()',
      table_name,
      table_name
    );
  END LOOP;
END;
$$;

COMMIT;
