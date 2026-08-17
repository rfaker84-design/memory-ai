import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageStyles = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const scene = readFileSync(new URL("../../../src/components/first-presence/MemoryConversationScene.tsx", import.meta.url), "utf8");
const sceneStyles = readFileSync(new URL("../../../src/components/first-presence/MemoryConversationScene.module.css", import.meta.url), "utf8");
const motionStyles = readFileSync(new URL("../../../src/components/companion/CompanionMotionBackground.module.css", import.meta.url), "utf8");

test("formal chat announces cold-start and recovery states without changing the read boundary", () => {
  assert.match(page, /role=\{state\.status === "loading" \? "status" : "alert"\}/);
  assert.match(page, /aria-live=\{state\.status === "loading" \? "polite" : "assertive"\}/);
  assert.match(page, /\(state\.status === "timeout" \|\| state\.status === "error"\) && <button type="button" onClick=\{\(\) => void load\(\)\}>/);
  assert.match(page, /读取等待过久，尚未创建或修改任何内容。/);
  assert.match(page, /loadOwnedMemory\(id, signal\)/);
});

test("an explicit chat entry remembers its exact Owner-scoped person without letting a creation handoff replace it", () => {
  assert.match(page, /const requiresMediaRecovery = readCreationRecovery\(\)\?\.memoryId === memory\.id/);
  assert.match(page, /const creationChatHandoff = consumeCreationChatHandoff\(memory\.id\)/);
  assert.match(page, /if \(!requiresMediaRecovery && !creationChatHandoff && memory\.userId\) \{[\s\S]*?persistCompanionPrimaryPreference\(window\.localStorage, memory\.userId, memory\.id\)/);
});

test("formal chat matches the restrained living-scene and warm-ivory composition", () => {
  assert.match(scene, /aria-label=\{`\$\{memoryName\} 的生活场景`\}/);
  assert.match(scene, /AI生成 · 基于你确认的记忆/);
  assert.match(scene, /stageChatPickupDraft\(\{/);
  assert.match(scene, /声音输入暂未开放/);
  assert.match(sceneStyles, /grid-template-rows: clamp\(10rem, 40dvh, 28rem\) minmax\(0, 1fr\)/);
  assert.match(sceneStyles, /background-color: var\(--paper\)/);
  assert.match(sceneStyles, /\.assistantMessage[\s\S]*?justify-self: start/);
  assert.match(sceneStyles, /\.userMessage,[\s\S]*?justify-self: end/);
  assert.match(sceneStyles, /data-presence="static"\] \.portraitMotion/);
  assert.match(motionStyles, /data-motion-enabled="false"\] \.video/);
  assert.match(motionStyles, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(`${pageStyles}\n${sceneStyles}`, /stars|radial-gradient\(circle at 18%|#0b0907|orbit|replyGlow/);
  assert.doesNotMatch(scene, /相伴多少天|在线|亲密度|等级|打卡|永远陪着你|一直等你|礼物|视频通话|语音通话/);
});

test("formal chat keeps the living scene fixed while only its message region scrolls", () => {
  assert.match(page, /styles\.chatPage/);
  assert.match(pageStyles, /height: calc\(100dvh - var\(--nav-height, 64px\) - env\(safe-area-inset-bottom, 0px\) - 12px\)/);
  assert.match(scene, /const messageScrollRef = useRef<HTMLDivElement \| null>\(null\)/);
  assert.match(scene, /messageScroller\.scrollTo\(/);
  assert.doesNotMatch(scene, /scrollIntoView\(/);
  assert.match(scene, /className=\{styles\.messageScroller\} ref=\{messageScrollRef\}/);
  assert.match(sceneStyles, /grid-template-rows: clamp\(10rem, 40dvh, 28rem\) minmax\(0, 1fr\)/);
  assert.match(sceneStyles, /\.messageScroller \{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/);
  assert.match(sceneStyles, /\.conversation \{[\s\S]*?grid-template-rows: minmax\(0, 1fr\) auto;[\s\S]*?overflow: hidden;/);
});
