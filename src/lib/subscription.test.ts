import assert from "node:assert/strict";
import test from "node:test";

import { PLANS, analyzeConversionReadiness } from "./subscription";

test("commercial prompts never derive urgency from grief, usage, or dependency signals", () => {
  const result = analyzeConversionReadiness({
    currentPlan: "free",
    emotionIntensityHistory: [1, 1, 1],
    nightUsage: true,
    consecutiveDays: 365,
    chatCountToday: 100,
    dependencyScore: 100,
  });
  assert.equal(result.shouldRecommend, false);
  assert.equal(result.urgency, "low");
  assert.deepEqual(result.reasons, []);
  assert.equal(result.cta, "查看服务说明");
});

test("paid plan copy does not promise proactive companionship, emotional memory, or multiple personalities", () => {
  const copy = Object.values(PLANS).flatMap((plan) => plan.features).join(" ");
  assert.doesNotMatch(copy, /主动陪伴|情绪记忆|多人格/);
  assert.equal(PLANS.pro.proactiveEnabled, false);
  assert.equal(PLANS.premium.emotionMemory, false);
});
