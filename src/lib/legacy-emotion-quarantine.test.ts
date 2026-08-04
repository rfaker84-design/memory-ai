import assert from "node:assert/strict";
import test from "node:test";

import { getDependencyStrategy, calculateDependency, getUserDependencyProfile } from "./emotion-dependency";
import { detectHooks, getTriggeredHooks, shouldTriggerHook } from "./emotion-hooks";
import {
  analyzeInputEmotion,
  getAIBehaviorMod,
  getUserEmotion,
  getUserSignals,
  recordClick,
  recordMouseMove,
  recordReturn,
  tickUserEmotion,
} from "../core/emotion/user-emotion-engine";

test("legacy engagement hooks never trigger from vulnerable or behavioural signals", () => {
  const signals = { emotion: "lonely", hour: 2, chatCountToday: 99, daysSinceLastChat: 1, isFirstToday: true };
  assert.deepEqual(detectHooks(signals), []);
  assert.deepEqual(getTriggeredHooks(signals), []);
  assert.equal(shouldTriggerHook(signals).shouldTrigger, false);
  assert.equal(shouldTriggerHook(signals).hook.message, "");
});

test("dependency compatibility surface performs no profiling, data read, or outreach selection", async () => {
  const profile = await calculateDependency("owner", ["sad"], ["I feel alone"], new Date().toISOString(), 2);
  assert.deepEqual(profile, {
    score: 0,
    level: "light",
    factors: {
      consecutiveLowMood: 0,
      nightUsage: 0,
      consecutiveChats: 0,
      returnBehavior: 0,
      lossMention: 0,
      daysSinceLastChat: 0,
    },
  });
  assert.equal((await getUserDependencyProfile("owner")), null);
  assert.deepEqual(getDependencyStrategy(profile).exampleMessages, []);
  assert.equal(getDependencyStrategy(profile).maxFrequency, "none");
});

test("behavioural emotion compatibility surface remains neutral after interaction signals", () => {
  recordMouseMove(0, 0, Date.now());
  recordMouseMove(1000, 1000, Date.now() + 1);
  recordClick();
  recordReturn();
  tickUserEmotion(60);
  assert.equal(analyzeInputEmotion("I am lonely and miss you"), 0);
  assert.equal(getUserEmotion(), "calm");
  assert.deepEqual(getUserSignals(), {
    idleSeconds: 0,
    mouseSpeed: 0,
    clickFrequency: 0,
    sessionDuration: 0,
    returnCount: 0,
    interactionCount: 0,
    averageInteractionGap: 0,
    emotionalKeywords: 0,
    recentRapidClicks: false,
  });
  assert.equal(getAIBehaviorMod().speechFrequency, 0);
});
