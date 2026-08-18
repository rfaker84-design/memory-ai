import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(new URL("./GuestExperience.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./GuestExperience.module.css", import.meta.url), "utf8");

const publicExperience = experience.slice(
  experience.indexOf("function PublicGuestExperience"),
  experience.indexOf("export function GuestExperience"),
);

test("the public route is a quiet two-part encounter invitation", () => {
  for (const copy of ["忆见", "想起一个人。", "体验一次遇见", "从一个人开始。", "想起一个人"]) {
    assert.match(publicExperience, new RegExp(copy));
  }
  assert.match(publicExperience, /owner-confirmed-warm-presence\.png/);
  assert.match(publicExperience, /onClick=\{onStart\}>想起一个人/);
  assert.doesNotMatch(publicExperience, /<video|体验 TA|创建 TA|数字生命|AI 视频|AI 对话|AI 声音/);
});

test("the public route has no fictional demo state machine or feature matrix", () => {
  assert.doesNotMatch(publicExperience, /GuestStage|awakening|companion|setStage|HOME_STORIES|DISCLOSURE/);
  assert.doesNotMatch(publicExperience, /<form|<input|<textarea|type="file"|contentEditable/);
});

test("the authenticated home keeps owned people without automatic navigation", () => {
  assert.match(experience, /!authenticated && <button className=\{styles\.loginAction\}/);
  assert.match(experience, /authenticated && people\.length > 0/);
  assert.match(experience, /person\.image/);
  assert.match(experience, /\{person\.name\}/);
  assert.match(experience, /onOpenPerson\?\.\(person\.id\)/);
  assert.match(experience, /people\.length < 3/);
  assert.match(experience, /aria-label="开始记录另一个人"/);
  assert.doesNotMatch(experience, /创建 TA|我的 TA|再记一个人|新增 TA|进入 TA|TA 管理/);
});

test("the public invitation remains isolated from Owner data and write paths", () => {
  assert.doesNotMatch(publicExperience, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
  assert.doesNotMatch(publicExperience, /localStorage|sessionStorage|indexedDB|caches\./);
  assert.doesNotMatch(publicExperience, /\/api\/|photoAssetId|authRequestClient|ownedMemoryClient/);
  assert.doesNotMatch(publicExperience, /method:\s*"(?:POST|PATCH|PUT|DELETE)"/);
});

test("the public invitation respects reduced motion, mobile safe areas, and touch targets", () => {
  assert.match(publicExperience, /useReducedMotion/);
  assert.match(styles, /safe-area-inset-top/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /min-height: 54px/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
