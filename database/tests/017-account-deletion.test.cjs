const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "migrations", "017_account_deletion_and_session_revocation.sql"), "utf8");
const runner = fs.readFileSync(path.join(root, "..", "scripts", "postgresql", "apply-migrations.sh"), "utf8");

test("017 keeps deletion retention, legal hold, task recovery and session revocation explicit", () => {
  for (const table of ["account_deletion_requests", "account_deletion_tasks", "account_deletion_object_ledger", "auth_session_revocations", "auth_session_invalidations"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  }
  assert.match(migration, /content_delete_after/);
  assert.match(migration, /provider_delete_after/);
  assert.match(migration, /backup_expire_after/);
  assert.match(migration, /legal_hold_approved_by/);
  assert.match(migration, /legal_hold_expires_at/);
  assert.match(migration, /uq_account_deletion_task_idempotency/);
  assert.match(migration, /reason IN \('account_deletion','logout_all','security_incident'\)/);
  assert.match(migration, /invalid_before/);
  assert.match(migration, /guardian_confirmed_at/);
  assert.match(migration, /legal_hold_scope/);
  assert.match(migration, /receipt_access_hash/);
  assert.match(migration, /receipt_access_expires_at/);
  assert.match(migration, /ux_account_deletion_object_locator/);
  assert.match(migration, /provider_task/);
  assert.doesNotMatch(runner, /017_account_deletion_and_session_revocation/);
});
