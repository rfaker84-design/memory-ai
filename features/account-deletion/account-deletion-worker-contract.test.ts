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
  assert.match(worker, /DELETE FROM public\.memory_fragments/);
  assert.match(worker, /DELETE FROM public\.long_term_memories/);
  assert.match(worker, /DELETE FROM public\.video_generation_jobs/);
  assert.match(worker, /DELETE FROM public\.business_funnel_events/);
  assert.match(worker, /DELETE FROM public\.auth_external_identities/);
  assert.match(worker, /archiveFinancialRecords/);
  assert.match(worker, /purgeLiveFinancialProductRecords/);
  assert.match(worker, /FINANCIAL_ARCHIVE_REFUND_PENDING/);
  assert.match(worker, /WHEN 'content_online' THEN 2/);
  assert.match(worker, /UPDATE public\.consent_records/);
  assert.match(worker, /UPDATE public\.audit_logs/);
  const entrypoint = readFileSync("scripts/ops/run-account-deletion-worker.ts", "utf8");
  assert.match(entrypoint, /ACCOUNT_DELETION_WORKER_ENABLED/);
  assert.match(entrypoint, /account_deletion_worker_batch/);
  assert.doesNotMatch(entrypoint, /requestId|userId|object_key|provider_task_id/);
});
