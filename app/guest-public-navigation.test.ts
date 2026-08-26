import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => readFileSync(file, "utf8");
const navigation = read("components/world/PublicProductNavigation.tsx");
const surfaces = read("components/world/GuestPublicSurface.tsx");
const loginPanel = read("components/world/GuestLoginPanel.tsx");
const continuation = read("src/components/create-memory/GuestCreateContinuationProvider.tsx");
const firstPresence = read("src/components/first-presence/FirstPresenceFlow.tsx");

test("public navigation exposes all four product surfaces without routing a guest into real companion", () => {
  for (const [key, label, path] of [
    ["home", "首页", "/"],
    ["companion", "相伴", "/guest/companion"],
    ["memory", "拾忆", "/guest/memories"],
    ["account", "我的", "/guest/account"],
  ]) {
    assert.match(navigation, new RegExp(`key: "${key}", label: "${label}", path: "${path.replaceAll("/", "\\/")}"`));
  }
  assert.match(navigation, /aria-label="主导航"/);
  assert.doesNotMatch(navigation, /path: "\/companion"/);
});

test("guest companion and memory are synthetic, local, and defer authentication to the real action", () => {
  assert.match(surfaces, /AI 合成示例/);
  assert.match(surfaces, /home-hero-assets\/elderly-woman\.mp4/);
  assert.match(surfaces, /reason="登录后，继续和 TA 说话"/);
  assert.match(surfaces, /reason="登录后，保存这段回忆"/);
  assert.doesNotMatch(surfaces, /\/api\/memories|fetch\(|router\.push\("\/companion"/);
});

test("public creation collects only local first-step text and asks for login at upload", () => {
  assert.match(surfaces, /创建 TA · 第一步/);
  assert.match(surfaces, /下一步：上传照片/);
  assert.match(surfaces, /reason="登录后，上传照片并继续创建"/);
  assert.match(surfaces, /continueGuestCreate\(\{ name: name\.trim\(\), relationship: relationship\.trim\(\) \}\)/);
  assert.match(surfaces, /router\.push\(GUEST_CREATE_CONTINUATION_URL\)/);
  assert.doesNotMatch(surfaces, /type="file"|\/api\/memories/);
});

test("contextual login has a close path and only calls authentication endpoints from explicit actions", () => {
  assert.match(loginPanel, /aria-modal="true"/);
  assert.match(loginPanel, /onClick=\{onClose\}/);
  assert.match(loginPanel, />暂不登录</);
  assert.match(loginPanel, /const sendCode = async/);
  assert.match(loginPanel, /const verifyCode = async/);
  assert.match(loginPanel, /\/api\/auth\/send-code/);
  assert.match(loginPanel, /\/api\/auth\/verify-code/);
  assert.doesNotMatch(loginPanel, /\/api\/memories|backdrop-filter/);
});

test("the post-login handoff is bounded to in-memory creation state and never restores on cold start", () => {
  assert.match(continuation, /useState<GuestCreateContinuation \| null>\(null\)/);
  assert.doesNotMatch(continuation, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.match(firstPresence, /continuation: guestContinuation, clearGuestCreateContinuation/);
  assert.match(firstPresence, /if \(guestContinuation\) clearGuestCreateContinuation\(\)/);
  assert.doesNotMatch(firstPresence, /resolvePostLoginDestination/);
});
