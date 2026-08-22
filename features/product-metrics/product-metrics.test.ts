import assert from "node:assert/strict";
import test from "node:test";

import { productMetricsCsv } from "./report";
import { productMetricsEnvironment } from "./product-metrics";

test("product metrics environment is explicit and never inferred from NODE_ENV", () => {
  assert.equal(productMetricsEnvironment({ DEPLOYMENT_ENV: "staging" } as unknown as NodeJS.ProcessEnv), "staging");
  assert.equal(productMetricsEnvironment({ DEPLOYMENT_ENV: "production" } as unknown as NodeJS.ProcessEnv), "production");
  assert.throws(() => productMetricsEnvironment({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv), /METRICS_ENVIRONMENT_INVALID/);
});

test("report CSV exposes daily facts without user or message columns", () => {
  const csv = productMetricsCsv({ daily: [{ day: "2026-08-22", source_channel: "unattributed", visitors: "1", first_ai_replies: "1" }] });
  assert.match(csv, /first_ai_replies/);
  assert.doesNotMatch(csv, /phone|content|photo_url|message/i);
});
