-- CANDIDATE ONLY: this migration belongs to a dedicated financial archive
-- database, never to the application database or automatic migration runner.
-- Production execution still requires the external legal/accounting retention
-- review and a separate Owner GO.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog;

CREATE SCHEMA IF NOT EXISTS financial_archive;

CREATE TABLE IF NOT EXISTS financial_archive.account_deletion_financial_archives (
  deletion_request_id UUID PRIMARY KEY,
  subject_reference_hash CHARACTER(64) NOT NULL,
  archive_version TEXT NOT NULL DEFAULT 'account-deletion-financial-v1',
  retention_until TIMESTAMPTZ NOT NULL,
  records JSONB NOT NULL,
  source_payload_sha256 CHARACTER(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_account_deletion_financial_archive_subject_hash
    CHECK (subject_reference_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_account_deletion_financial_archive_payload_hash
    CHECK (source_payload_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_account_deletion_financial_archive_retention
    CHECK (retention_until > created_at),
  CONSTRAINT ck_account_deletion_financial_archive_records_object
    CHECK (jsonb_typeof(records) = 'object'),
  CONSTRAINT ck_account_deletion_financial_archive_no_product_identifiers
    CHECK (NOT (records ?| ARRAY[
      'user_id', 'memory_id', 'external_id', 'profile', 'provider_payload',
      'payment_url', 'provider_prepay_id', 'photo', 'video', 'chat'
    ]))
);

CREATE INDEX IF NOT EXISTS ix_account_deletion_financial_archives_retention
  ON financial_archive.account_deletion_financial_archives (retention_until, created_at);

COMMIT;
