import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("account deletion worker has exclusive claim, retry and redacted batch observability", () => {
  const worker = readFileSync("features/account-deletion/account-deletion-worker.ts", "utf8");
  assert.match(worker, /FOR UPDATE SKIP LOCKED/);
  assert.match(worker, /claimed_at < NOW\(\) - INTERVAL '10 minutes'/);
  assert.match(worker, /claimed_at=NULL/);
  assert.match(worker, /status = "retry"/);
  assert.match(worker, /ACCOUNT_DELETION_PROVIDER_DELETE_NOT_CONFIGURED/);
  const entrypoint = readFileSync("scripts/ops/run-account-deletion-worker.ts", "utf8");
  assert.match(entrypoint, /ACCOUNT_DELETION_WORKER_ENABLED/);
  assert.match(entrypoint, /account_deletion_worker_batch/);
  assert.doesNotMatch(entrypoint, /requestId|userId|object_key|provider_task_id/);
});
