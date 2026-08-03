const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "migrations", "020_commerce_occasion_rewards.sql"), "utf8");
const postflight = fs.readFileSync(path.join(root, "verification", "020-commerce-occasion-postflight.sql"), "utf8");
const runner = fs.readFileSync(path.join(root, "..", "scripts", "postgresql", "apply-migrations.sh"), "utf8");

test("020 extends the existing Commerce ledger without adding it to an automatic runner", () => {
  assert.match(migration, /CANDIDATE ONLY/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.commerce_occasion_rewards/);
  assert.match(migration, /occasion_reward/);
  assert.match(migration, /occasion_experience/);
  assert.match(migration, /uq_commerce_occasion_rewards_user_occasion_year/);
  assert.match(migration, /expires_at IS NOT NULL/);
  assert.match(migration, /save_allowed/);
  assert.doesNotMatch(runner, /020_commerce_occasion_rewards/);
});

test("020 postflight is read-only and verifies ownership, ledger boundaries, indexes, and constraints", () => {
  assert.match(postflight, /BEGIN READ ONLY;/);
  assert.match(postflight, /SET LOCAL lock_timeout = '2s';/);
  assert.match(postflight, /SET LOCAL statement_timeout = '15min';/);
  for (const token of [
    "commerce_occasion_rewards is missing",
    "an invalid public index remains",
    "an unvalidated public constraint remains",
    "Commerce occasion object owner differs",
    "an occasion reward ledger invariant is invalid",
  ]) assert.match(postflight, new RegExp(token));
  assert.match(postflight, /COMMIT;\s*$/);
  assert.doesNotMatch(postflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\b/i);
});
