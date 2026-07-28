const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("016 persists video jobs without introducing a second entitlement ledger", () => {
  const migration = read("migrations/016_video_job_postgres_ledger.sql");
  const postflight = read("verification/016-video-job-postgres-ledger-postflight.sql");
  const runner = read("../scripts/postgresql/apply-migrations.sh");

  assert.match(migration, /^-- ISOLATED VALIDATION ONLY/m);
  assert.match(migration, /\nBEGIN;/);
  assert.match(migration, /commerce_generation_reservations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.video_generation_jobs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.video_generation_quality_reviews/);
  assert.match(migration, /uq_video_generation_jobs_request UNIQUE \(user_id, memory_id, idempotency_key\)/);
  assert.match(migration, /ux_video_generation_jobs_provider_task/);
  assert.match(migration, /submission_uncertain/);
  assert.match(migration, /quality_pending/);
  assert.match(migration, /quality_status = 'approved' AND entitlement_settlement = 'committed'/);
  assert.match(migration, /status = 'rejected'.*entitlement_settlement = 'released'/s);
  assert.match(migration, /char_length\(review_key\) BETWEEN 16 AND 128/);
  assert.match(migration, /char_length\(reviewer_account\) BETWEEN 3 AND 256/);
  assert.match(migration, /reviewer_account !~ '\[\[:space:\]\]'/);
  assert.doesNotMatch(migration, /~ '[^']*\{\d+(?:,\d+)?\}/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS public\.commerce_credit_lots/i);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS public\.commerce_generation_reservations/i);

  assert.match(postflight, /video_generation_jobs/);
  assert.match(postflight, /ownership_or_reservation_mismatch/);
  assert.match(postflight, /terminal_settlement_mismatch/);
  assert.doesNotMatch(postflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);

  assert.equal(runner.includes("016_video_job_postgres_ledger.sql"), false);
});
