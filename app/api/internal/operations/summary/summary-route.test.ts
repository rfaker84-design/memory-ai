import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { DatabaseDependencyError } from "@/src/server/database";

import { createOperationsSummaryHandler } from "./_handler";

const token = "o".repeat(32);
const summary = {
  observedAt: "2026-08-02T00:00:00.000Z",
  video: { active: 1, submissionUncertain: 2, qualityPending: 3, manualReview: 4, terminalLast24Hours: 5, terminalP95Seconds: 6, committedCreditsLast24Hours: 7 },
  media: { uploadsLast24Hours: 8, uploadedBytesLast24Hours: 9 },
  commerce: { pendingOrders: 4, refundsAwaitingResolution: 5 },
  accountDeletion: { runnableTasks: 6, failedTasks: 7 },
  chat: { failedLast24Hours: 8, pendingOverFiveMinutes: 9 },
};

function request(headers?: Record<string, string>) {
  return new NextRequest("https://memoryai.test/api/internal/operations/summary", { headers });
}

test("operations summary is aggregate-only and requires its independent server token", async () => {
  process.env.OPERATIONS_METRICS_ACCESS_TOKEN = token;
  let called = false;
  const handler = createOperationsSummaryHandler(() => ({
    async summary() { called = true; return summary; },
  }));

  assert.equal((await handler(request())).status, 401);
  assert.equal(called, false);
  const response = await handler(request({ "x-operations-metrics-token": token }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body, { summary });
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.doesNotMatch(JSON.stringify(body), /userId|memoryId|providerTask|objectKey/);
});

test("operations summary fails closed on configuration, query shape and database availability", async () => {
  const previous = process.env.OPERATIONS_METRICS_ACCESS_TOKEN;
  try {
    delete process.env.OPERATIONS_METRICS_ACCESS_TOKEN;
    const unavailable = await createOperationsSummaryHandler(() => ({ summary: async () => summary }))(request());
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { error: "OPERATIONS_METRICS_UNAVAILABLE" });
    process.env.OPERATIONS_METRICS_ACCESS_TOKEN = `${token} `;
    const whitespace = await createOperationsSummaryHandler(() => ({ summary: async () => summary }))(request({ "x-operations-metrics-token": `${token} ` }));
    assert.equal(whitespace.status, 503);
    process.env.OPERATIONS_METRICS_ACCESS_TOKEN = token;
    const invalid = await createOperationsSummaryHandler(() => ({ summary: async () => summary }))(new NextRequest("https://memoryai.test/api/internal/operations/summary?userId=private", { headers: { "x-operations-metrics-token": token } }));
    assert.equal(invalid.status, 400);
    const databaseUnavailable = await createOperationsSummaryHandler(() => ({
      async summary() { throw new DatabaseDependencyError("connection_refused", "ECONNREFUSED"); },
    }))(request({ "x-operations-metrics-token": token }));
    assert.equal(databaseUnavailable.status, 503);
    assert.deepEqual(await databaseUnavailable.json(), { error: "DATABASE_UNAVAILABLE" });
  } finally {
    process.env.OPERATIONS_METRICS_ACCESS_TOKEN = previous;
  }
});

test("operations summary accepts only a bounded previous token during a valid rotation", async () => {
  const prior = {
    current: process.env.OPERATIONS_METRICS_ACCESS_TOKEN,
    previous: process.env.OPERATIONS_METRICS_ACCESS_TOKEN_PREVIOUS,
    validUntil: process.env.OPERATIONS_METRICS_ACCESS_TOKEN_PREVIOUS_VALID_UNTIL,
  };
  const previousToken = "p".repeat(32);
  try {
    process.env.OPERATIONS_METRICS_ACCESS_TOKEN = token;
    process.env.OPERATIONS_METRICS_ACCESS_TOKEN_PREVIOUS = previousToken;
    process.env.OPERATIONS_METRICS_ACCESS_TOKEN_PREVIOUS_VALID_UNTIL = new Date(Date.now() + 60_000).toISOString();
    const handler = createOperationsSummaryHandler(() => ({ summary: async () => summary }));
    assert.equal((await handler(request({ "x-operations-metrics-token": previousToken }))).status, 200);
    process.env.OPERATIONS_METRICS_ACCESS_TOKEN_PREVIOUS_VALID_UNTIL = new Date(Date.now() - 1).toISOString();
    assert.equal((await handler(request({ "x-operations-metrics-token": token }))).status, 503);
  } finally {
    if (prior.current === undefined) delete process.env.OPERATIONS_METRICS_ACCESS_TOKEN; else process.env.OPERATIONS_METRICS_ACCESS_TOKEN = prior.current;
    if (prior.previous === undefined) delete process.env.OPERATIONS_METRICS_ACCESS_TOKEN_PREVIOUS; else process.env.OPERATIONS_METRICS_ACCESS_TOKEN_PREVIOUS = prior.previous;
    if (prior.validUntil === undefined) delete process.env.OPERATIONS_METRICS_ACCESS_TOKEN_PREVIOUS_VALID_UNTIL; else process.env.OPERATIONS_METRICS_ACCESS_TOKEN_PREVIOUS_VALID_UNTIL = prior.validUntil;
  }
});
