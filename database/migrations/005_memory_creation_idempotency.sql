BEGIN;

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS creation_idempotency_key TEXT;

UPDATE memories
  SET creation_idempotency_key = idempotency_key
  WHERE creation_idempotency_key IS NULL;

ALTER TABLE memories
  ALTER COLUMN creation_idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_memories_creation_idempotency
  ON memories (user_id, creation_idempotency_key);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_memories_creation_idempotency_key') THEN
    ALTER TABLE memories
      ADD CONSTRAINT ck_memories_creation_idempotency_key
      CHECK (creation_idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$');
  END IF;
END;
$$;

COMMIT;
