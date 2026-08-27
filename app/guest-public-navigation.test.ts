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

test("creation is a child flow, so it leaves every primary navigation item unselected", () => {
  assert.match(surfaces, /<PublicFrame active=\{null\} variant="create">/);
  assert.match(navigation, /active: PublicProductTab \| null/);
  assert.match(navigation, /const selected = tab\.key === active/);
  assert.doesNotMatch(surfaces, /<PublicFrame active="home" variant="create">/);
});

test("guest companion and memory are synthetic, local, and defer authentication to the real action", () => {
  assert.match(surfaces, /AI 合成示例/);
  assert.match(surfaces, /home-hero-assets\/elderly-woman\.mp4/);
  assert.match(surfaces, /你来了。/);
  assert.match(surfaces, /guest-secondary-assets\/memories-hero-approved\.png/);
  assert.match(surfaces, /guest-secondary-assets\/memory-spring-approved\.png/);
  assert.match(surfaces, /guest-secondary-assets\/memory-summer-approved\.png/);
  assert.match(surfaces, /guest-secondary-assets\/memory-today-approved\.png/);
  assert.match(surfaces, /reason="登录后，继续和 TA 说话"/);
  assert.match(surfaces, /reason="登录后，保存这段回忆"/);
  assert.doesNotMatch(surfaces, /\/api\/memories|fetch\(|router\.push\("\/companion"/);
});

test("public creation collects only local first-step text and asks for login at upload", () => {
  assert.match(surfaces, /guest-secondary-assets\/create-empty-frame-approved\.png/);
  assert.match(surfaces, /下一步：上传照片/);
  assert.match(surfaces, /reason="登录后，上传照片并继续创建"/);
  assert.match(surfaces, /continueGuestCreate\(\{ name: name\.trim\(\), relationship: relationship\.trim\(\) \}\)/);
  assert.match(surfaces, /router\.push\(GUEST_CREATE_CONTINUATION_URL\)/);
  assert.doesNotMatch(surfaces, /type="file"|\/api\/memories/);
});

test("approved secondary-page imagery is represented as responsive component assets, not page screenshots", () => {
  const styles = read("components/world/GuestPublicExperience.module.css");
  assert.match(surfaces, /guest-secondary-assets\/account-album-approved\.png/);
  assert.match(styles, /\.companionStage video \{[\s\S]*?object-fit: cover/);
  assert.match(styles, /\.memoriesHero img, \.accountHero img, \.createHero img \{[\s\S]*?object-fit: cover/);
  assert.match(styles, /@media \(min-width: 760px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("each secondary-page hero is eagerly prioritized while memory thumbnails remain deferred", () => {
  for (const hero of [
    "memories-hero-approved.png",
    "account-album-approved.png",
    "create-empty-frame-approved.png",
  ]) {
    assert.match(surfaces, new RegExp(`${hero.replaceAll(".", "\\.")}"[^>]*loading="eager"[^>]*fetchPriority="high"`));
  }
  assert.match(surfaces, /src=\{item\.image\} alt="" loading="lazy" fetchPriority="low"/);
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
