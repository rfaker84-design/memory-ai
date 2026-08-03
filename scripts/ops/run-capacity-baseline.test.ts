import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

import { GET as healthGet } from "../../app/api/health/route";
import { CapacityBaselineRunError, runCapacityBaseline } from "./run-capacity-baseline";

const isolatedPlan = {
  targetUrl: "http://127.0.0.1:3100/",
  targetEnvironment: "isolated",
  approvedChangeId: null,
  syntheticDataOnly: true,
  providerSubmit: false,
  requests: 12,
  concurrency: 3,
  uploadBytes: 2_028_688,
};

test("capacity runner issues bounded loopback health reads and reports aggregate-only measurements", async () => {
  const requested: string[] = [];
  const report = await runCapacityBaseline(isolatedPlan, async (input, init) => {
    requested.push(String(input));
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("accept"), "application/json");
    assert.equal(init?.redirect, "error");
    return Response.json({ status: "ok", service: "MemoryAI", time: "2026-08-04T00:00:00.000Z" });
  });

  assert.equal(requested.length, 12);
  assert.ok(requested.every((input) => input === "http://127.0.0.1:3100/api/health"));
  assert.deepEqual({
    targetEnvironment: report.targetEnvironment,
    endpoint: report.endpoint,
    successfulResponses: report.successfulResponses,
    failedResponses: report.failedResponses,
    providerSubmitCount: report.providerSubmitCount,
    expectedExternalCost: report.expectedExternalCost,
  }, {
    targetEnvironment: "isolated",
    endpoint: "/api/health",
    successfulResponses: 12,
    failedResponses: 0,
    providerSubmitCount: 0,
    expectedExternalCost: 0,
  });
  assert.ok(report.maxInFlight <= 3);
  assert.doesNotMatch(JSON.stringify(report), /userId|memoryId|cookie|providerTask|token|secret/i);
});

test("capacity runner refuses Staging execution and reports a failed isolated health response", async () => {
  await assert.rejects(
    runCapacityBaseline({ ...isolatedPlan, targetEnvironment: "staging", approvedChangeId: "STAGING-001" }),
    (error: unknown) => error instanceof CapacityBaselineRunError && error.code === "CAPACITY_STAGING_EXECUTION_NOT_ALLOWED",
  );
  await assert.rejects(
    runCapacityBaseline(isolatedPlan, async () => new Response(null, { status: 503 })),
    (error: unknown) => error instanceof CapacityBaselineRunError && error.code === "CAPACITY_HEALTH_REQUEST_FAILED",
  );
});

test("capacity runner measures real loopback sockets against the actual health handler", async () => {
  const server = createServer(async (request, response) => {
    if (request.method !== "GET" || request.url !== "/api/health") {
      response.writeHead(404).end();
      return;
    }
    const health = await healthGet();
    response.writeHead(health.status, Object.fromEntries(health.headers));
    response.end(Buffer.from(await health.arrayBuffer()));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const report = await runCapacityBaseline({
      ...isolatedPlan,
      targetUrl: `http://127.0.0.1:${address.port}/`,
      requests: 40,
      concurrency: 4,
    });
    assert.equal(report.successfulResponses, 40);
    assert.equal(report.failedResponses, 0);
    assert.ok(report.maxInFlight <= 4);
    assert.ok(report.p99Ms >= report.p95Ms);
  } finally {
    server.close();
    await once(server, "close");
  }
});
