import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(new URL("./CreateMemoryExperience.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./CreateMemoryExperience.module.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../MobileAppShell.tsx", import.meta.url), "utf8");

test("creation stays a full-screen ritual until memory-world", () => {
  assert.doesNotMatch(shell, /pathname === "\/create-memory"/);
  assert.match(experience, /router\.replace\("\/memory-world"\)/);
  assert.match(experience, /className=\{styles\.paperSheet\}/);
  assert.match(experience, /className=\{styles\.memoryLine\}/);
  assert.match(experience, /从一个称呼开始/);
  assert.match(experience, /在你的记忆里，TA 是/);
  assert.doesNotMatch(experience, /TA 的故事，从这里开始/);
  assert.match(styles, /url\("\/login\/owner-confirmed-warm-presence\.png"\)/);
});

test("the selected portrait sits on paper while required creation contracts remain", () => {
  assert.match(experience, /className=\{styles\.photoPaper\}/);
  assert.match(experience, /className=\{styles\.portraitStage\}/);
  assert.match(experience, /更换照片/);
  assert.match(experience, /aria-label="TA 的生日"/);
  assert.match(experience, /如果 TA 看到你，最可能会说什么/);
  assert.match(experience, /开始遇见/);
  assert.match(styles, /\.photoPaper[\s\S]*?transform: rotate\(1\.8deg\)/);
  assert.match(styles, /\.portraitStage[\s\S]*?aspect-ratio: 4 \/ 5/);
});

test("awakening is a dedicated transition scene with a reduced-motion fallback", () => {
  assert.match(experience, /className=\{styles\.wakeScene\}/);
  assert.match(experience, /className=\{styles\.wakeExpansion\}/);
  assert.match(experience, /className=\{styles\.wakeRays\}/);
  assert.match(experience, /className=\{styles\.gatheringDust\}/);
  assert.match(experience, /正在整理关于 TA 的记忆……/);
  assert.match(experience, /正在唤醒一段珍贵的回忆……/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.wakeExpansion i,[\s\S]*?\.wakeRays,[\s\S]*?animation: none !important/);
});
