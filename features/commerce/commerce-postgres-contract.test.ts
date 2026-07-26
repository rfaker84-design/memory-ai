import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./commerce-postgres-datasource.ts", import.meta.url),
  "utf8",
);

test("PostgreSQL datasource locks every mutable idempotency scope", () => {
  for (const scope of [
    "commerce-order",
    "commerce-generation",
    "commerce-refund",
    "commerce-photo-remedy",
    "commerce-referral",
    "commerce-referral-device",
  ]) {
    assert.match(source, new RegExp(`memoryai:${scope}`));
  }
});

test("generation success consumes while system failure and invalidation release", () => {
  assert.match(source, /const consumed = input\.outcome === "succeeded"/);
  assert.match(source, /reserved_credits = reserved_credits - 1/);
  assert.match(source, /consumed_credits = consumed_credits \+ \$2/);
  assert.match(source, /consumed \? "consumed" : "released"/);
});

test("paid grants are permanent and referral grants are non-saveable", () => {
  assert.match(
    source,
    /'paid_package', \$2, \$3, true/,
  );
  assert.match(
    source,
    /'referral_reward', \$2, 1, false/,
  );
  assert.doesNotMatch(source, /localStorage|sessionStorage|React/);
});

test("reconciliation remains read-only", () => {
  const method = source.slice(source.indexOf("async reconcileOrders"));
  assert.match(method, /SELECT o\.order_no/);
  assert.doesNotMatch(method, /\b(?:UPDATE|INSERT|DELETE)\b/);
});
