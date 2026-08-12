import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(new URL("./GuestExperience.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./GuestExperience.module.css", import.meta.url), "utf8");

test("the public hero uses the five approved quiet stories and direct conversion actions", () => {
  for (const copy of [
    "忆见",
    "登录",
    "把想念，放在一个温柔的地方。",
    "开始",
    "体验一次遇见",
  ]) assert.match(experience, new RegExp(copy));

  const expectedOrder = [
    "elderly-woman",
    "elderly-man",
    "child-drawing",
    "young-woman",
    "younger-man",
  ];
  let previous = -1;
  for (const slug of expectedOrder) {
    const position = experience.indexOf(`slug: "${slug}"`);
    assert.ok(position > previous, `${slug} should follow the approved order`);
    previous = position;
  }

  assert.match(experience, /onClick=\{onStart\}>开始/);
  assert.match(experience, /onClick=\{\(\) => setStage\("awakening"\)\}>体验一次遇见/);
  assert.match(experience, /const CROSSFADE_MS = 1_000/);
  assert.match(experience, /video\.duration - video\.currentTime <= 1\.05/);
  assert.doesNotMatch(experience, /Math\.random|shuffle/);
});

test("background media is silent, inline, lightweight, and falls back to approved posters", () => {
  assert.match(experience, /autoPlay/);
  assert.match(experience, /muted/);
  assert.match(experience, /playsInline/);
  assert.match(experience, /disablePictureInPicture/);
  assert.match(experience, /preload=\{activeIndex === 0 \? "auto" : "metadata"\}/);
  assert.match(experience, /connection\?\.saveData === true/);
  assert.match(experience, /deviceMemory <= 2/);
  assert.match(experience, /hardwareConcurrency <= 2/);
  assert.match(experience, /setVideoEnabled\(false\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.video[\s\S]*display: none/);
});

test("the public experience clearly separates its fictional AI example from a real person", () => {
  for (const copy of [
    "AI生成示例",
    "使用虚构示例资料",
    "不代表真实人物或其真实表达",
    "不会上传或保存",
    "不会产生账号或正式人物记录",
    "视觉效果示例 · 未生成真实视频",
    "预设 AI 示例文案 · 未调用 AI 服务",
  ]) assert.match(experience, new RegExp(copy));
});

test("the guest state machine remains intact behind the video hero", () => {
  assert.match(experience, /type GuestStage = "entry" \| "awakening" \| "companion"/);
  assert.match(experience, /setStage\("awakening"\)/);
  assert.match(experience, /setStage\("companion"\)/);
  assert.match(experience, /陪伴空间示例/);
  assert.match(experience, /把想念留在这里/);
  assert.match(experience, /onClick=\{onStart\}>开始/);
  assert.match(experience, /刚才的虚构示例不会保存，也不会带入你的 TA/);
  assert.doesNotMatch(experience, /<form|<input|<textarea|type="file"|contentEditable/);
});

test("the authenticated home shows owned people without automatic navigation", () => {
  assert.match(experience, /!authenticated && <button className=\{styles\.loginAction\}/);
  assert.match(experience, /authenticated && people\.length > 0/);
  assert.match(experience, /person\.image/);
  assert.match(experience, /\{person\.name\}/);
  assert.match(experience, /onOpenPerson\?\.\(person\.id\)/);
  assert.match(experience, /people\.length < 3/);
  assert.match(experience, /aria-label="开始记录另一个人"/);
  assert.doesNotMatch(experience, /创建 TA|我的 TA|再记一个人|新增 TA|进入 TA|TA 管理/);
});

test("the public experience is isolated from Owner data, storage, providers, and write paths", () => {
  assert.doesNotMatch(experience, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
  assert.doesNotMatch(experience, /localStorage|sessionStorage|indexedDB|caches\./);
  assert.doesNotMatch(experience, /\/api\/|photoAssetId|authRequestClient|ownedMemoryClient/);
  assert.doesNotMatch(experience, /method:\s*"(?:POST|PATCH|PUT|DELETE)"/);
});

test("the guest ritual respects reduced motion, mobile safe areas, and minimum touch targets", () => {
  assert.match(experience, /useReducedMotion/);
  assert.match(experience, /reducedMotion \? 120 : 2_200/);
  assert.match(styles, /safe-area-inset-top/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /min-height: 52px/);
});
