import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../src/components/MobileAppShell.tsx", import.meta.url), "utf8");
const world = readFileSync(new URL("../memory-world/page.tsx", import.meta.url), "utf8");

test("memory-world enters the dedicated companion space and the three-tab shell keeps it active", () => {
  assert.match(world, /router\.push\("\/companion"\)/);
  assert.match(shell, /path:"\/companion"/);
  assert.match(shell, /pathname === "\/companion"/);
  for (const label of ["相伴", "拾忆", "我的"]) assert.match(shell, new RegExp(`label:"${label}"`));
});

test("companion space is not an IM transcript and exposes the three honest next steps", () => {
  assert.match(page, /TA 在这里/);
  assert.match(page, /陪你聊一会儿/);
  assert.match(page, />开始聊天</);
  assert.match(page, />查看记忆</);
  assert.match(page, />拾忆</);
  assert.match(page, />生成新的影像</);
  assert.doesNotMatch(page, /messages\.map|聊天气泡|ChatGPT|contentEditable/);
  assert.doesNotMatch(page, /<main/);
});

test("first greeting remains visibly AI-generated and never claims a recovered historical message", () => {
  assert.match(page, /companionFirstGreeting\(memory\.name\)/);
  assert.match(page, /greeting\.disclosure/);
  assert.match(page, /AI 纪念陪伴/);
});

test("formal owner and media reads fail closed without creating a parallel backend", () => {
  assert.match(page, /fetchCompanionHomeMemoriesJson\(fetch, signal\)/);
  assert.match(page, /selectPrimaryCompanion/);
  assert.match(page, /loadOwnedMediaUrl\(selected\.photoAssetId, signal\)/);
  assert.match(page, /response\.status === 401/);
  assert.doesNotMatch(page, /\/api\/(payments|first-presence-video)|method:\s*"POST"|method:\s*"PATCH"/);
});

test("quiet motion degrades for reduced motion and constrained devices", () => {
  assert.match(page, /<MotionProvider>[\s\S]*<CompanionContent \/>[\s\S]*<\/MotionProvider>/);
  assert.match(page, /useQuietCompanionPresence/);
  assert.match(page, /data-presence=\{presence\}/);
  assert.match(styles, /data-presence="quiet"/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
