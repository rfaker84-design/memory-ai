const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "migrations", "028_companion_micro_motion.sql"), "utf8");
const runner = fs.readFileSync(path.join(root, "..", "scripts", "postgresql", "apply-migrations.sh"), "utf8");

test("companion micro-motion extends the video ledger with exactly three durable slots", () => {
  assert.match(migration, /use_case IN \('first_presence', 'companion_micro_motion'\)/);
  assert.match(migration, /motion_variant IN \('idle', 'attentive', 'reflective'\)/);
  assert.match(migration, /UNIQUE INDEX[\s\S]*user_id, memory_id, pack_version, motion_variant/);
  assert.match(migration, /use_case = 'companion_micro_motion'/);
  assert.match(migration, /reservation_id IS NULL/);
});

test("review grants are owner-scoped, audited, short lived, and inert unless the caller explicitly enables Staging review", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.companion_motion_review_grants/);
  assert.match(migration, /FOREIGN KEY \(memory_id, user_id\)[\s\S]*REFERENCES public\.memories\(id, user_id\)/);
  assert.match(migration, /granted_by TEXT NOT NULL/);
  assert.match(migration, /reason TEXT NOT NULL/);
  assert.match(migration, /expires_at <= starts_at \+ INTERVAL '24 hours'/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.memoryai_companion_motion_eligible/);
  assert.match(migration, /p_allow_staging_review[\s\S]*companion_motion_review_grants/);
  assert.match(migration, /g\.revoked_at IS NULL[\s\S]*g\.starts_at <= p_at[\s\S]*g\.expires_at > p_at/);
});

test("Production eligibility uses the current paid Commerce package and excludes the quarantined legacy entitlement", () => {
  assert.match(migration, /FROM public\.commerce_orders o[\s\S]*JOIN public\.commerce_credit_lots l/);
  assert.match(migration, /FROM public\.memories m[\s\S]*m\.id = p_memory_id[\s\S]*m\.user_id = p_user_id[\s\S]*m\.deleted_at IS NULL/);
  assert.match(migration, /o\.status = 'paid'[\s\S]*o\.refunded_at IS NULL[\s\S]*l\.active[\s\S]*l\.save_allowed[\s\S]*l\.total_credits = o\.generation_credits/);
  assert.doesNotMatch(migration, /FROM public\.memory_entitlements/);
});

test("candidate migration is not silently added to the production runner", () => {
  assert.doesNotMatch(runner, /028_companion_micro_motion\.sql/);
});
