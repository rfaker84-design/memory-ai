import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPANION_VISIT_MARKER,
  companionRelationship,
  companionVisitGreeting,
  companionVisitStorageKey,
  companionVideoEntry,
  resolveCompanionVisitState,
} from "./companionSpaceState";

test("first and returning companion visits use distinct, transparent presentation copy", () => {
  assert.equal(resolveCompanionVisitState(null), "first_visit");
  assert.equal(resolveCompanionVisitState(COMPANION_VISIT_MARKER), "daily_visit");
  assert.equal(companionVisitStorageKey("memory/id"), "memoryai.companion.visit.memory%2Fid");

  const first = companionVisitGreeting("妈妈", "first_visit");
  const daily = companionVisitGreeting("妈妈", "daily_visit");
  assert.equal(first.title, "欢迎回来");
  assert.equal(daily.title, "今天过得怎么样？");
  assert.notEqual(first.message, daily.message);
  assert.match(first.disclosure, /AI 生成内容/);
  assert.match(first.disclosure, /基于用户确认资料/);
  assert.match(first.disclosure, /不代表 TA 的真实历史留言或表达/);
  const completeCopy = [...Object.values(first), ...Object.values(daily)].join(" ");
  assert.doesNotMatch(completeCopy, /我在等你|永远陪着你|来陪我|很快见面|到我这里来|真实意识|复活/);
});

test("companion presentation falls back without inferring a relationship", () => {
  assert.equal(companionRelationship("母亲"), "母亲");
  assert.equal(companionRelationship("  "), "一位对你很重要的人");
});

test("the video entry reuses formal chat instead of inventing a generator page", () => {
  assert.equal(companionVideoEntry("memory/id"), "/memory-chat/memory%2Fid");
});
