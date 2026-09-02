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

test("the launch waits for a fully buffered first film and preloads the next paused at zero", () => {
  assert.match(carousel, /opening\.loop = false/);
  assert.match(carousel, /next\.loop = false/);
  assert.match(carousel, /opening\.pause\(\);[\s\S]*?opening\.currentTime = 0;[\s\S]*?opening\.preload = "auto";[\s\S]*?opening\.load\(\)/);
  assert.match(carousel, /if \(cancelled \|\| openingStartedRef\.current \|\| !isReadyForContinuousPlayback\(opening\)\) return;/);
  assert.match(carousel, /next\.pause\(\);[\s\S]*?next\.currentTime = 0;[\s\S]*?next\.preload = "auto";[\s\S]*?next\.load\(\)/);
  assert.match(carousel, /video\.readyState < HTMLMediaElement\.HAVE_FUTURE_DATA/);
  assert.match(carousel, /const requiredEnd = Math\.max\(0, video\.duration - 0\.12\)/);
  assert.match(carousel, /video\.buffered\.end\(index\) >= requiredEnd/);
  assert.match(carousel, /next\.addEventListener\("loadeddata", markReady\)/);
  assert.match(carousel, /next\.addEventListener\("canplay", markReady\)/);
  assert.match(carousel, /next\.addEventListener\("canplaythrough", markReady\)/);
  assert.match(carousel, /next\.addEventListener\("progress", markReady\)/);
  assert.match(carousel, /if \(video\.duration - video\.currentTime <= HANDOFF_LEAD_SECONDS\) beginHandoff\(\)/);
  assert.match(carousel, /onEnded=\{\(\) => \{[\s\S]*?beginHandoff\(\)/);
  assert.doesNotMatch(carousel, /\n\s+loop(?:\s|\/?>)/);
  assert.doesNotMatch(carousel, /\.loop = true/);
});

test("an unready or failed incoming film never starts a handoff or replays the current person", () => {
  assert.match(carousel, /handoffRef\.current !== "steady" \|\| handoffLockedRef\.current \|\| !nextReadyRef\.current/);
  assert.match(carousel, /if \(!outgoing \|\| !incoming \|\| !isReadyForContinuousPlayback\(incoming\)\)/);
  assert.match(carousel, /if \(nextReadyRef\.current\) beginHandoff\(\);[\s\S]*?else showPosterFallback\(\);/);
  assert.match(carousel, /setFilmStarted\(false\);/);
  assert.doesNotMatch(carousel, /\.loop = true/);
});

test("the one-second handoff fades completely out before the next film begins", () => {
  assert.match(carousel, /const FADE_MS = 500/);
  assert.match(carousel, /type Handoff = "steady" \| "fading-out" \| "fading-in"/);
  assert.match(styles, /--home-transition: 500ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(styles, /\.videoCurrent \{ opacity: 0\.92; \}/);
  assert.match(styles, /\.videoNext, \.videoFadingOut \{ opacity: 0; \}/);
  assert.doesNotMatch(styles, /transitionPlate|radial-gradient\(circle at 24% 44%/);

  assert.match(carousel, /onTransitionEnd=\{\(event\) => \{[\s\S]*?handoffRef\.current === "fading-out"[\s\S]*?promotePreparedFilm\(\)/);
  assert.match(carousel, /const promotePreparedFilm[\s\S]*?handoffRef\.current !== "fading-out"[\s\S]*?outgoing\.pause\(\);[\s\S]*?const playback = incoming\.play\(\);[\s\S]*?setHandoff\("fading-in"\)/);
  assert.match(carousel, /void playback\.catch\(\(\) => \{[\s\S]*?setFilmStarted\(false\);/);

  assert.match(carousel, /data-carousel-handoff=\{handoff\}/);
  assert.match(carousel, /const opacity = Number\(getComputedStyle\(outgoing\)\.opacity\);[\s\S]*?opacity <= 0\.02[\s\S]*?void promotePreparedFilm\(\)/);
  assert.match(carousel, /window\.requestAnimationFrame\(waitUntilOutgoingIsInvisible\)/);
  assert.doesNotMatch(carousel, /waiting|transitionPlate|lightVeil|warm plate/);
});

test("the two video DOM layers are stable and only recycled after the incoming fade completes", () => {
  assert.doesNotMatch(carousel, /key=\{/);
  assert.match(carousel, /ref=\{layer === "a" \? videoARef : videoBRef\}/);
  assert.match(carousel, /const completeHandoff[\s\S]*?handoffRef\.current !== "fading-in"[\s\S]*?setLayerStories/,
    "the recycled layer source must change only after the incoming fade is complete");
});

test("mobile retains per-story focal metadata and all media fill the full viewport", () => {
  assert.match(styles, /object-position: var\(--story-desktop-position/);
  assert.match(styles, /@media \(max-aspect-ratio: 3 \/ 4\)[\s\S]*?object-position: var\(--story-mobile-position/);
  assert.match(styles, /\.media, \.poster, \.video, \.mediaVeil \{ position: absolute; inset: 0; width: 100%; height: 100%; \}/);
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
