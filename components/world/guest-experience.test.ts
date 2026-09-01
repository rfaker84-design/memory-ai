import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(new URL("./GuestExperience.tsx", import.meta.url), "utf8");
const carousel = readFileSync(new URL("./HomeCarousel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./GuestExperience.module.css", import.meta.url), "utf8");

test("the approved homepage keeps the five separate synthetic stories in fixed order", () => {
  const expected = ["elderly-woman", "elderly-man", "child-drawing", "young-woman", "younger-man"];
  let previous = -1;
  for (const slug of expected) {
    const position = carousel.indexOf(`slug: "${slug}"`);
    assert.ok(position > previous, `${slug} must retain its approved carousel order`);
    previous = position;
  }
  assert.match(carousel, /desktopPosition:/);
  assert.match(carousel, /mobilePosition:/);
  assert.match(carousel, /const HOME_ASSET_VERSION = "home-v2"/);
  assert.match(carousel, /\$\{story\.slug\}\.\$\{HOME_ASSET_VERSION\}\.\$\{extension\}/);
});

test("every story uses its versioned home-v2 film and matching first-frame poster", () => {
  for (const slug of ["elderly-woman", "elderly-man", "child-drawing", "young-woman", "younger-man"]) {
    const video = new URL(`../../public/home-hero-assets/${slug}.home-v2.mp4`, import.meta.url);
    const poster = new URL(`../../public/home-hero-assets/${slug}.home-v2.poster.webp`, import.meta.url);
    assert.ok(existsSync(video), `missing versioned video for ${slug}`);
    assert.ok(existsSync(poster), `missing matching poster for ${slug}`);
    assert.ok(statSync(video).size > 1_000_000, `versioned video for ${slug} is unexpectedly small`);
    assert.ok(statSync(poster).size > 10_000, `versioned poster for ${slug} is unexpectedly small`);
  }
});

test("the launch preloads the opening pair without ever allowing a person to loop", () => {
  assert.match(carousel, /current\.loop = false/);
  assert.match(carousel, /next\.loop = false/);
  assert.match(carousel, /next\.pause\(\);[\s\S]*?next\.currentTime = 0;[\s\S]*?next\.preload = "auto";[\s\S]*?next\.load\(\)/);
  assert.match(carousel, /next\.readyState < HTMLMediaElement\.HAVE_CURRENT_DATA/);
  assert.match(carousel, /next\.addEventListener\("loadeddata", markReady\)/);
  assert.match(carousel, /next\.addEventListener\("canplay", markReady\)/);
  assert.match(carousel, /if \(video\.duration - video\.currentTime <= HANDOFF_LEAD_SECONDS\) beginFadeOut\(\)/);
  assert.match(carousel, /onEnded=\{\(\) => \{[\s\S]*?beginFadeOut\(\)/);
  assert.doesNotMatch(carousel, /\n\s+loop(?:\s|\/?>)/);
  assert.doesNotMatch(carousel, /\.loop = true/);
});

test("the one-second handoff never plays or displays two people at the same time", () => {
  assert.match(carousel, /const FADE_MS = 450/);
  assert.match(carousel, /type TransitionPhase = "steady" \| "fade-out" \| "waiting" \| "fade-in"/);
  assert.match(styles, /--home-transition: 450ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(styles, /\.transitionPlate \{[\s\S]*?radial-gradient[\s\S]*?linear-gradient/);
  assert.match(styles, /\.videoCurrent \{ opacity: 0\.92; \}/);
  assert.match(styles, /\.videoNext, \.videoOutgoing \{ opacity: 0; \}/);
  assert.match(styles, /\.videoIncomingVisible \{ opacity: 0\.92; \}/);

  const fadeOut = carousel.indexOf("const finishFadeOut");
  const stopOutgoing = carousel.indexOf("current?.pause()", fadeOut);
  const startIncoming = carousel.indexOf("const startIncoming");
  const playIncoming = carousel.indexOf("await next.play()", startIncoming);
  assert.ok(fadeOut >= 0 && stopOutgoing > fadeOut && startIncoming > stopOutgoing && playIncoming > startIncoming,
    "the outgoing film must be transparent and paused before the incoming film starts");

  assert.match(carousel, /phase === "waiting" && nextReady[\s\S]*?startIncoming\(\)/);
  assert.match(carousel, /setPhase\("fade-in"\)/);
  assert.match(carousel, /data-carousel-phase=\{phase\}/);
  assert.doesNotMatch(carousel, /await next\.play\(\);[\s\S]*?setPhase\("fade-out"\)/);
});

test("mobile retains per-story focal metadata and all media fill the full viewport", () => {
  assert.match(styles, /object-position: var\(--story-desktop-position/);
  assert.match(styles, /@media \(max-aspect-ratio: 3 \/ 4\)[\s\S]*?object-position: var\(--story-mobile-position/);
  assert.match(styles, /\.media, \.poster, \.transitionPlate, \.video, \.mediaVeil \{ position: absolute; inset: 0; width: 100%; height: 100%; \}/);
  assert.doesNotMatch(styles, /height: min\(58dvh, 490px\)/);
});

test("the public homepage stays minimal and does not access private data or write business data", () => {
  assert.match(experience, /<HomeCarousel reducedMotion=\{reducedMotion\} playbackActive=\{playbackActive\} onActiveStoryChange=\{setActiveStory\} \/>/);
  assert.match(experience, /<PublicProductNavigation active="home" overMedia \/>/);
  for (const rejected of ["从一张照片开始", "一张照片，一个称呼", "体验一次遇见", "<h1", "<h2"]) {
    assert.doesNotMatch(experience, new RegExp(rejected));
  }
  assert.doesNotMatch(carousel, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|\/api\//);
  assert.doesNotMatch(carousel, /method:\s*"(?:POST|PATCH|PUT|DELETE)"/);
});
