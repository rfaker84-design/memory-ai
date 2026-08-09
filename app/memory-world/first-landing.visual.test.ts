import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../src/components/MobileAppShell.tsx", import.meta.url), "utf8");

test("the first ready landing continues the creation ritual instead of showing an admin heading", () => {
  assert.doesNotMatch(page, /<h1[^>]*>记忆空间<\/h1>/);
  assert.match(page, /你好，<em>\{primary\.name\}<\/em><br \/>已经在这里。/);
  assert.match(page, /AI 纪念陪伴 · 基于你确认的资料/);
  assert.match(page, /primary\.relationship/);
  assert.match(styles, /background:[\s\S]*?#08080a/);
  assert.match(styles, /\.stars/);
  assert.match(styles, /\.ambientLight/);
});

test("the primary TA uses the formal owner-scoped portrait and existing companion routes", () => {
  assert.match(page, /photoAssetId\?: string \| null/);
  assert.match(page, /loadOwnedMediaUrl\(primary\.photoAssetId, controller\.signal\)/);
  assert.match(page, /image=\{primaryPortraitUrl\}/);
  assert.match(page, /router\.push\("\/companion"\)/);
  assert.match(page, /router\.push\(`\/memory\/\$\{primary\.id\}\/encounter`\)/);
  assert.match(page, />进入陪伴<\/MemoryButton>/);
  assert.doesNotMatch(page, /\/api\/payments|\/api\/first-presence-video|video/i);
});

test("memory-world keeps exactly the shared three-tab shell in its dark immersive treatment", () => {
  assert.doesNotMatch(page, /<nav aria-label="主导航"/);
  assert.match(shell, /const immersiveCompanion = pathname === "\/memory-world" \|\| pathname === "\/companion"/);
  assert.match(shell, /\{!immersiveCompanion && <Footer \/>\}/);
  assert.match(shell, /immersiveCompanion \? "rgba\(8,8,10,0\.94\)"/);
  for (const label of ["相伴", "拾忆", "我的"]) assert.match(shell, new RegExp(`label:"${label}"`));
});

test("motion remains restrained and has a reduced-motion fallback", () => {
  assert.match(styles, /@keyframes worldArrive/);
  assert.match(styles, /@keyframes portraitSettle/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.heroPortrait[\s\S]*?animation: none !important/);
});
