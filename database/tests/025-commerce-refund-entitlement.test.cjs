const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(path.join(__dirname, "../migrations/025_commerce_refund_entitlement_reason.sql"), "utf8");
const postflight = fs.readFileSync(path.join(__dirname, "../verification/025-commerce-refund-entitlement-postflight.sql"), "utf8");
const runner = fs.readFileSync(path.join(__dirname, "../../scripts/postgresql/apply-migrations.sh"), "utf8");

test("025 preserves historical refund rows and adds the explicit entitlement-missing reason", () => {
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /LOCK TABLE public\.commerce_refund_requests IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS ck_commerce_refund_requests_reason/);
  assert.match(migration, /'unused_purchase', 'duplicate_charge', 'entitlement_missing', 'service_failure'/);
  assert.match(postflight, /AND c\.convalidated/);
  assert.match(postflight, /%entitlement_missing%/);
  assert.match(postflight, /unexpected refund reason exists/);
});

test("025 remains outside the automatic migration runner", () => {
  assert.doesNotMatch(runner, /025_commerce_refund_entitlement_reason\.sql/);
});
