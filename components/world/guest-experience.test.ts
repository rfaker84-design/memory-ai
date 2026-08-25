import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(new URL("./GuestExperience.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./GuestExperience.module.css", import.meta.url), "utf8");

test("the approved homepage carousel keeps the five existing, separate synthetic stories", () => {
  for (const slug of ["elderly-woman", "elderly-man", "child-drawing", "young-woman", "younger-man"]) {
    assert.match(experience, new RegExp(`slug: "${slug}"`));
  }
  assert.match(experience, /\/home-hero-assets\/\$\{story\.slug\}\.\$\{extension\}/);
  assert.match(experience, /CROSSFADE_MS = 1_000/);
  assert.match(experience, /autoPlay[\s\S]*?muted[\s\S]*?playsInline/);
  assert.match(experience, /onEnded=\{\(\) => incomingIndex === null && advanceStory\(\)\}/);
  assert.match(experience, /onError=\{\(\) => setVideoEnabled\(false\)\}/);
});

test("the homepage contains no rejected photo landing page, public demo flow, or marketing copy", () => {
  for (const rejected of ["从一张照片开始", "一张照片，一个称呼", "体验一次遇见", "family-frame-hero-v2", "awakening", "companion", "guest-experience"]) {
    assert.doesNotMatch(experience, new RegExp(rejected));
  }
  assert.match(experience, />创建 TA</);
  assert.match(experience, /showLogin && <button className=\{styles\.loginAction\}[^>]*>登录/);
  assert.doesNotMatch(experience, /<h1|<h2|invitationLine|heroSecondaryAction/);
});

test("the public carousel is read-only, privacy-safe, and falls back to its approved posters", () => {
  assert.doesNotMatch(experience, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|\/api\//);
  assert.doesNotMatch(experience, /method:\s*"(?:POST|PATCH|PUT|DELETE)"/);
  assert.match(experience, /poster=\{assetPath\(activeStory, "poster\.webp"\)\}/);
  assert.match(experience, /shouldUseStaticHero/);
  assert.match(experience, /useReducedMotion/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /safe-area-inset-top/);
  assert.match(styles, /safe-area-inset-bottom/);
});
