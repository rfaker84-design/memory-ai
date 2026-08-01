const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "migrations", "017_account_deletion_and_session_revocation.sql"), "utf8");
const postflight = fs.readFileSync(path.join(root, "verification", "017-account-deletion-postflight.sql"), "utf8");
const runner = fs.readFileSync(path.join(root, "..", "scripts", "postgresql", "apply-migrations.sh"), "utf8");

test("017 keeps deletion retention, legal hold, task recovery and session revocation explicit", () => {
  for (const table of ["account_deletion_requests", "account_deletion_tasks", "account_deletion_guardian_confirmations", "account_deletion_object_ledger", "auth_session_revocations", "auth_session_invalidations"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  }
  assert.match(migration, /content_delete_after/);
  assert.match(migration, /provider_delete_after/);
  assert.match(migration, /backup_expire_after/);
  assert.match(migration, /legal_hold_approved_by/);
  assert.match(migration, /legal_hold_expires_at/);
  assert.match(migration, /uq_account_deletion_task_idempotency/);
  assert.match(migration, /claimed_at TIMESTAMPTZ/);
  assert.match(migration, /reason IN \('account_deletion','logout_all','security_incident'\)/);
  assert.match(migration, /invalid_before/);
  assert.match(migration, /guardian_confirmed_at/);
  assert.match(migration, /verified_guardian_session/);
  assert.match(migration, /legal_hold_scope/);
  assert.match(migration, /receipt_access_hash/);
  assert.match(migration, /receipt_access_expires_at/);
  assert.match(migration, /ux_account_deletion_object_locator/);
  assert.match(migration, /provider_task/);
  assert.match(migration, /ALTER TABLE public\.memories ADD COLUMN IF NOT EXISTS deleted_at/);
  assert.doesNotMatch(runner, /017_account_deletion_and_session_revocation/);
});

test("017 postflight is transactionally read-only and validates schema, ownership and data invariants", () => {
  assert.match(postflight, /\nBEGIN READ ONLY;/);
  assert.match(postflight, /SET LOCAL lock_timeout = '2s';/);
  assert.match(postflight, /SET LOCAL statement_timeout = '15min';/);
  for (const token of [
    "idx_memories_active_owner",
    "idx_account_deletion_tasks_ready",
    "ux_account_deletion_object_locator",
    "auth_session_revocations",
    "auth_session_invalidations",
    "deletion_request_schedule_or_hold_invalid",
    "session_invalidation_time_invalid",
    "an invalid public index remains",
    "an unvalidated public constraint remains",
  ]) assert.match(postflight, new RegExp(token));
  assert.match(postflight, /c\.relowner <> current_user::regrole/);
  assert.match(postflight, /COMMIT;\s*$/);
  assert.doesNotMatch(postflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\b/i);
});
