import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
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

test("formal chat matches the restrained living-scene and warm-ivory composition", () => {
  assert.match(scene, /aria-label=\{`\$\{memoryName\} 的生活场景`\}/);
  assert.match(scene, /AI生成 · 基于你确认的记忆/);
  assert.match(scene, /stageChatPickupDraft\(\{/);
  assert.match(scene, /声音输入暂未开放/);
  assert.match(sceneStyles, /min-height: clamp\(24rem, 44dvh, 36rem\)/);
  assert.match(sceneStyles, /background-color: var\(--paper\)/);
  assert.match(sceneStyles, /\.assistantMessage[\s\S]*?justify-self: start/);
  assert.match(sceneStyles, /\.userMessage,[\s\S]*?justify-self: end/);
  assert.match(sceneStyles, /data-presence="static"\] \.portraitMotion/);
  assert.match(motionStyles, /data-motion-enabled="false"\] \.video/);
  assert.match(motionStyles, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(`${styles}\n${sceneStyles}`, /stars|radial-gradient\(circle at 18%|#0b0907|orbit|replyGlow/);
  assert.doesNotMatch(scene, /相伴多少天|在线|亲密度|等级|打卡|永远陪着你|一直等你|礼物|视频通话|语音通话/);
});
