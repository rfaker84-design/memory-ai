import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const flow = readFileSync("src/components/first-presence/FirstPresenceFlow.tsx", "utf8");
const styles = readFileSync("src/components/first-presence/FirstPresenceFlow.module.css", "utf8");
const page = readFileSync("app/page.tsx", "utf8");

test("immersive creation asks one frozen question at a time and keeps optional media truthful", () => {
  for (const copy of [
    "你想再次遇见谁？",
    "TA 与我的关系",
    "TA 如何称呼我",
    "TA 常说的一句话",
    "TA 的说话习惯",
    "一段共同回忆",
    "选择 TA 的照片",
    "选择真实声音",
  ]) {
    assert.match(flow, new RegExp(copy));
  }
  assert.match(flow, /switch \(questionIndex\)/);
  assert.match(flow, /没有声音仍可继续创建/);
  assert.match(flow, /没有照片时才使用文字形象/);
  assert.match(flow, /不克隆声音、不生成口型/);
});

test("preview is explicit, starts directly in the immersive flow, and has no preview write branch", () => {
  assert.match(flow, /process\.env\.NODE_ENV !== "production"/);
  assert.match(flow, /NEXT_PUBLIC_MEMORYAI_ENABLE_PRESENCE_PREVIEW === "true"/);
  assert.match(page, /initialStage="preview-create"/);
  assert.match(flow, /if \(previewMode\) return;[\s\S]*?fetch\("\/api\/auth\/session"/);
  assert.match(
    flow,
    /if \(previewMode && VISUAL_PREVIEW_ENABLED\) \{\s*setStage\("preview-forming"\);\s*return;/,
  );
  const previewRendering = flow.slice(flow.indexOf('stage === "preview-forming"'));
  assert.doesNotMatch(previewRendering, /fetch\(|recordTrustConsent|MemoryExperienceOffer/);
});

test("portrait stays consistent through reveal, greeting, two exchanges, and the delayed offer", () => {
  assert.match(flow, /setPortraitUrl\(url\)/);
  assert.match(flow, /URL\.revokeObjectURL\(localPortraitUrl\.current\)/);
  assert.match(flow, /stage === "preview-reveal"/);
  assert.match(flow, /stage === "preview-greeting"/);
  assert.match(flow, /stage === "preview-chat-one"/);
  assert.match(flow, /stage === "preview-chat-two"/);
  assert.match(flow, /MemoryAvatar image=\{portraitUrl\}/);
  const secondRound = flow.slice(flow.indexOf('stage === "preview-chat-two"'));
  assert.match(secondRound, /49元 · 30天 · 1个 TA · 100次 AI 回复/);
  const firstRound = flow.slice(
    flow.indexOf('stage === "preview-chat-one"'),
    flow.indexOf('stage === "preview-chat-two"'),
  );
  assert.doesNotMatch(firstRound, /49元/);
});

test("failure, back navigation, and reduced motion preserve the in-memory draft", () => {
  assert.match(flow, /已保留全部回答与原幂等键，不会自动重发/);
  assert.match(flow, /使用原幂等键重试/);
  assert.match(flow, /返回检查回答/);
  assert.match(flow, /setQuestionIndex\(\(current\) => current - 1\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.reduced \*/);
});
