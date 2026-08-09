import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(new URL("./GuestExperience.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./GuestExperience.module.css", import.meta.url), "utf8");

test("the public experience clearly separates its fictional AI example from a real person", () => {
  for (const copy of [
    "公开体验",
    "AI生成示例",
    "使用虚构示例资料",
    "不代表真实人物或其真实表达",
    "不会上传或保存",
    "不会创建账号或 TA",
    "视觉效果示例 · 未生成真实视频",
    "预设 AI 示例文案 · 未调用 AI 服务",
  ]) assert.match(experience, new RegExp(copy));
});

test("the guest state machine demonstrates entry, awakening, and companion without collecting data", () => {
  assert.match(experience, /type GuestStage = "entry" \| "awakening" \| "companion"/);
  assert.match(experience, /setStage\("awakening"\)/);
  assert.match(experience, /setStage\("companion"\)/);
  assert.match(experience, /陪伴空间示例/);
  assert.match(experience, /创建属于你的 TA/);
  assert.match(experience, /onClick=\{onLogin\}>创建我的 TA/);
  assert.doesNotMatch(experience, /<form|<input|<textarea|type="file"|contentEditable/);
});

test("the conversion asks for login only after an explicit real-TA action", () => {
  const awakeningEffect = experience.slice(experience.indexOf("  useEffect(() => {"), experience.indexOf("  return ("));
  assert.doesNotMatch(awakeningEffect, /onLogin/);
  assert.match(experience, /已有账号，直接登录/);
  assert.match(experience, /刚才的虚构示例不会保存，也不会带入你的 TA/);
  assert.equal((experience.match(/onClick=\{onLogin\}/g) ?? []).length, 2);
});

test("the public experience is isolated from Owner data, storage, providers, and write paths", () => {
  assert.doesNotMatch(experience, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
  assert.doesNotMatch(experience, /localStorage|sessionStorage|indexedDB|caches\./);
  assert.doesNotMatch(experience, /\/api\/|memoryId|photoAssetId|authRequestClient|ownedMemoryClient/);
  assert.doesNotMatch(experience, /method:\s*"(?:POST|PATCH|PUT|DELETE)"/);
});

test("the guest ritual respects reduced motion and mobile safe areas", () => {
  assert.match(experience, /useReducedMotion/);
  assert.match(experience, /reducedMotion \? 120 : 2_200/);
  assert.match(styles, /safe-area-inset-top/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /min-height: 50px/);
});
