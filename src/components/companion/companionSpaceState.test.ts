import assert from "node:assert/strict";
import test from "node:test";

import {
  companionFirstGreeting,
  companionRelationship,
  companionVideoEntry,
} from "./companionSpaceState";

test("the first companion greeting is transparent, restrained, and based only on confirmed profile fields", () => {
  const greeting = companionFirstGreeting("妈妈");
  assert.equal(greeting.title, "妈妈的第一声问候");
  assert.match(greeting.disclosure, /AI 生成演示/);
  assert.match(greeting.disclosure, /基于你确认的称呼和关系/);
  assert.match(greeting.disclosure, /不代表 TA 的真实历史留言/);
  const completeCopy = Object.values(greeting).join(" ");
  assert.doesNotMatch(completeCopy, /我在等你|永远陪着你|来陪我|很快见面|到我这里来|真实意识|复活/);
});

test("companion presentation falls back without inferring a relationship", () => {
  assert.equal(companionRelationship("母亲"), "母亲");
  assert.equal(companionRelationship("  "), "一位对你很重要的人");
});

test("the video entry reuses formal chat instead of inventing a generator page", () => {
  assert.equal(companionVideoEntry("memory/id"), "/memory-chat/memory%2Fid");
});
