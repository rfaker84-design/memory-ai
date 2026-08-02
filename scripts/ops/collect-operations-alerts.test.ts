import assert from "node:assert/strict";
import test from "node:test";

import {
  collectOperationsAlerts,
  collectorExitCode,
  OperationsAlertCollectorError,
  parseCollectorConfiguration,
} from "./collect-operations-alerts";

const token = "t".repeat(32);
const environment = {
  OPERATIONS_ALERTS_URL: "https://monitoring.memoryai.test/api/internal/operations/alerts",
  OPERATIONS_METRICS_ACCESS_TOKEN: token,
};

test("operations collector sends its token only as a request header and emits aggregate alert facts", async () => {
  let requestedUrl = "";
  let suppliedToken = "";
  const collection = await collectOperationsAlerts(environment, async (input, init) => {
    requestedUrl = String(input);
    suppliedToken = new Headers(init?.headers).get("x-operations-metrics-token") ?? "";
    return new Response(JSON.stringify({
      observedAt: "2026-08-02T00:00:00.000Z",
      alerts: [{ code: "CHAT_PENDING_STUCK", severity: "critical", observed: 1, threshold: 0 }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(requestedUrl, environment.OPERATIONS_ALERTS_URL);
  assert.equal(suppliedToken, token);
  assert.equal(collectorExitCode(collection), 2);
  assert.doesNotMatch(JSON.stringify(collection), /user|memoryId|provider|object|taskId/i);
});

test("operations collector rejects unsafe endpoints, weak secrets, response identifiers, and failed pulls", async () => {
  for (const invalid of [
    { ...environment, OPERATIONS_ALERTS_URL: "http://monitoring.memoryai.test/api/internal/operations/alerts" },
    { ...environment, OPERATIONS_ALERTS_URL: "https://monitoring.memoryai.test/api/internal/operations/alerts?token=forbidden" },
    { ...environment, OPERATIONS_METRICS_ACCESS_TOKEN: "short" },
  ]) {
    assert.throws(() => parseCollectorConfiguration(invalid), OperationsAlertCollectorError);
  }
  await assert.rejects(
    collectOperationsAlerts(environment, async () => new Response(JSON.stringify({ observedAt: "2026-08-02T00:00:00.000Z", alerts: [], userId: "forbidden" }), { status: 200 })),
    (error: unknown) => error instanceof OperationsAlertCollectorError && error.code === "OPERATIONS_ALERT_COLLECTOR_RESPONSE_INVALID",
  );
  await assert.rejects(
    collectOperationsAlerts(environment, async () => new Response(null, { status: 503 })),
    (error: unknown) => error instanceof OperationsAlertCollectorError && error.code === "OPERATIONS_ALERT_COLLECTOR_HTTP_503",
  );
});
