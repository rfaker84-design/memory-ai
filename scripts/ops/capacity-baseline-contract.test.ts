import assert from "node:assert/strict";
import test from "node:test";

import { CapacityBaselinePlanError, parseCapacityBaselinePlan } from "./capacity-baseline-contract";

const isolatedPlan = {
  targetUrl: "http://127.0.0.1:3100/",
  targetEnvironment: "isolated",
  approvedChangeId: null,
  syntheticDataOnly: true,
  providerSubmit: false,
  requests: 40,
  concurrency: 4,
  uploadBytes: 2_028_688,
};

test("capacity baseline plans are bounded, synthetic, and provider-submit-free", () => {
  const parsed = parseCapacityBaselinePlan(isolatedPlan);
  assert.equal(parsed.targetUrl.href, "http://127.0.0.1:3100/");
  assert.equal(parsed.targetEnvironment, "isolated");
  assert.equal(parsed.providerSubmit, false);
  assert.equal(parsed.uploadBytes, 2_028_688);
});

test("capacity baseline plans reject production, provider side effects, and unapproved Staging", () => {
  const invalid = [
    { ...isolatedPlan, targetUrl: "https://yijianmemory.cn/" },
    { ...isolatedPlan, targetUrl: "https://staging.yijianmemory.cn/" },
    { ...isolatedPlan, targetUrl: "https://isolated.memoryai.test/" },
    { ...isolatedPlan, providerSubmit: true },
    { ...isolatedPlan, syntheticDataOnly: false },
    { ...isolatedPlan, targetEnvironment: "staging" },
    { ...isolatedPlan, targetEnvironment: "staging", approvedChangeId: " " },
    { ...isolatedPlan, concurrency: 41 },
    { ...isolatedPlan, uploadBytes: 20 * 1024 * 1024 + 1 },
  ];
  for (const plan of invalid) {
    assert.throws(() => parseCapacityBaselinePlan(plan), CapacityBaselinePlanError);
  }
});
