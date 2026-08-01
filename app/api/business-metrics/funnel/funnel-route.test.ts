import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createBusinessFunnelHandler } from "./_handler";

const report = { from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z", minimumCohortSize: 5, steps: [] };

test("business funnel aggregation requires a server-only token and returns only aggregates", async () => {
  process.env.BUSINESS_METRICS_ACCESS_TOKEN = "a".repeat(32);
  let called = false;
  const handler = createBusinessFunnelHandler(() => ({ funnelReport: async () => { called = true; return report; } }));
  const denied = await handler(new NextRequest("https://memoryai.test/api/business-metrics/funnel"));
  assert.equal(denied.status, 401);
  assert.equal(called, false);
  const accepted = await handler(new NextRequest("https://memoryai.test/api/business-metrics/funnel?from=2026-07-01&to=2026-07-01", { headers: { "x-business-metrics-token": "a".repeat(32) } }));
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), report);
  assert.equal(accepted.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("business funnel aggregation rejects unexpected query fields before data access", async () => {
  process.env.BUSINESS_METRICS_ACCESS_TOKEN = "b".repeat(32);
  const handler = createBusinessFunnelHandler(() => ({ funnelReport: async () => report }));
  const response = await handler(new NextRequest("https://memoryai.test/api/business-metrics/funnel?userId=private", { headers: { "x-business-metrics-token": "b".repeat(32) } }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "INVALID_TIME_RANGE" });
});

test("business funnel aggregation rejects malformed dates instead of broadening the query", async () => {
  process.env.BUSINESS_METRICS_ACCESS_TOKEN = "c".repeat(32);
  let called = false;
  const handler = createBusinessFunnelHandler(() => ({ funnelReport: async () => { called = true; return report; } }));
  const response = await handler(new NextRequest("https://memoryai.test/api/business-metrics/funnel?from=not-a-date", { headers: { "x-business-metrics-token": "c".repeat(32) } }));
  assert.equal(response.status, 400);
  assert.equal(called, false);
});
