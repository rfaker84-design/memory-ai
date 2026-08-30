import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(new URL("./GuestExperience.tsx", import.meta.url), "utf8");
const carousel = readFileSync(new URL("./HomeCarousel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./GuestExperience.module.css", import.meta.url), "utf8");

test("the approved homepage keeps the five existing, separate synthetic stories in fixed order", () => {
  const expected = ["elderly-woman", "elderly-man", "child-drawing", "young-woman", "younger-man"];
  let previous = -1;
  for (const slug of expected) {
    const position = carousel.indexOf(`slug: "${slug}"`);
    assert.ok(position > previous, `${slug} must retain its approved carousel order`);
    previous = position;
  }
  assert.match(carousel, /desktopPosition:/);
  assert.match(carousel, /mobilePosition:/);
  assert.match(carousel, /const \[slotStories, setSlotStories\] = useState<\[number, number\]>\(\[0, 1\]\)/);
  assert.match(carousel, /data-carousel-visible-index/);
  assert.match(carousel, /data-carousel-phase/);
});

test("the next native video is explicitly decoded at its real opening frame before a transition can start", () => {
  assert.match(carousel, /\{\(\[0, 1\] as const\)\.map\(\(slot\) => \{/);
  assert.match(carousel, /src=\{assetPath\(story, "mp4"\)\}[\s\S]*?preload="auto"/);
  assert.match(carousel, /void first\.play\(\)\.catch\(\(\) => undefined\);[\s\S]*?void warmSlot\(1, 1\)/);
  assert.match(carousel, /video\.src = assetPath\(story, "mp4"\);[\s\S]*?video\.load\(\)/);
  assert.match(carousel, /video\.readyState < HTMLMediaElement\.HAVE_CURRENT_DATA && video\.networkState !== HTMLMediaElement\.NETWORK_LOADING\) video\.load\(\)/);
  assert.match(carousel, /await waitForCurrentData\(video, controller\.signal\);[\s\S]*?await seek\(video, 0\.05, controller\.signal\);[\s\S]*?await video\.play\(\);[\s\S]*?await waitForDecodedFrame\(video, controller\.signal\);[\s\S]*?video\.pause\(\);[\s\S]*?await seek\(video, 0, controller\.signal\)/);
  assert.match(carousel, /requestVideoFrameCallback/);
  assert.doesNotMatch(carousel, /canplaythrough/);
});

test("the neutral source cut cannot enter the transition without a decoded next frame", () => {
  for (const phase of ["idle", "preparing-next", "next-frame-ready", "neutral-fade", "atomic-layer-swap", "committed"]) {
    assert.match(carousel, new RegExp(`"${phase}"`));
  }
  assert.match(carousel, /if \(!videoEnabled \|\| phaseRef\.current !== "next-frame-ready"\) return;/);
  assert.match(carousel, /prepared\?\.slot !== incoming[\s\S]*?incomingVideo\.readyState < HTMLMediaElement\.HAVE_CURRENT_DATA[\s\S]*?incomingVideo\.currentTime >= 0\.2/);
  assert.match(carousel, /A slow next asset is retried in the background[\s\S]*?No transition is allowed on this path/);
  assert.match(carousel, /outgoingVideo\.loop = true;[\s\S]*?void outgoingVideo\.play\(\)/);
});

test("the person index changes only inside the atomic swap and the old source is recycled after commit", () => {
  const neutralFade = carousel.indexOf('setPhaseSafe("neutral-fade")');
  const outgoingHidden = carousel.indexOf("setOpacityForSlot(outgoing, 0)", neutralFade);
  const incomingVisible = carousel.indexOf("setOpacityForSlot(incoming, VISIBLE_OPACITY)", neutralFade);
  const fadesFinished = carousel.indexOf("await Promise.all([outgoingFade, incomingFade])", neutralFade);
  const atomic = carousel.indexOf('setPhaseSafe("atomic-layer-swap")');
  const indexUpdate = carousel.indexOf("visibleSlotRef.current = incoming", atomic);
  const committed = carousel.indexOf('setPhaseSafe("committed")', atomic);
  const recycle = carousel.indexOf("assignSource(outgoing, followingIndex)", committed);
  assert.ok(neutralFade >= 0 && outgoingHidden > neutralFade && incomingVisible > outgoingHidden && fadesFinished > incomingVisible && atomic >= 0 && indexUpdate > atomic, "visible person changes only after the neutral source cut is complete");
  assert.match(carousel, /await Promise\.all\(\[outgoingFade, incomingFade\]\)[\s\S]*?commitAtomicSwap\(outgoing, incoming, incomingStoryIndex\)/);
  assert.ok(committed > indexUpdate && recycle > committed, "next-next prewarm waits until the neutral source cut has committed");
  assert.match(carousel, /if \(!videoEnabled \|\| phaseRef\.current !== "next-frame-ready"\) return;/);
});

test("the source cut is only a 100 ms neutral opacity soften with no overlay or visible effect", () => {
  assert.match(carousel, /const NEUTRAL_CUT_MS = 100/);
  assert.match(carousel, /setPhaseSafe\("neutral-fade"\)[\s\S]*?const outgoingFade = waitForOpacity\(outgoingVideo, controller\.signal, NEUTRAL_CUT_MS\)[\s\S]*?const incomingFade = waitForOpacity\(incomingVideo, controller\.signal, NEUTRAL_CUT_MS\)[\s\S]*?setOpacityForSlot\(outgoing, 0\)[\s\S]*?setOpacityForSlot\(incoming, VISIBLE_OPACITY\)[\s\S]*?await Promise\.all\(\[outgoingFade, incomingFade\]\)[\s\S]*?commitAtomicSwap/);
  assert.match(styles, /\[data-home-carousel\]\[data-video-enabled="true"\] \.poster \{ opacity: 0; \}/);
  assert.match(styles, /\.video \{ z-index: 1; opacity: 0; transition: opacity 100ms linear;/);
  assert.doesNotMatch(carousel, /lightVeil|veilStage|VEIL_|waitForVeilTransform|translate3d/);
  assert.doesNotMatch(styles, /lightVeil|data-light-veil|translate3d|filter:|blur\(/);
});

test("reduced motion uses the already-decoded next opening frame and swaps directly", () => {
  assert.match(carousel, /if \(reducedMotion\) \{[\s\S]*?await incomingVideo\.play\(\);[\s\S]*?setOpacityForSlot\(outgoing, 0\);[\s\S]*?setOpacityForSlot\(incoming, VISIBLE_OPACITY\);[\s\S]*?commitAtomicSwap\(outgoing, incoming, incomingStoryIndex\);/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.video \{ transition: none; \}/);
  assert.doesNotMatch(styles, /\.video \{ display: none;/);
});

test("mobile keeps per-story focal metadata and a safe scene height", () => {
  assert.match(styles, /object-position: var\(--story-desktop-position/);
  assert.match(styles, /@media \(max-aspect-ratio: 3 \/ 4\)[\s\S]*?object-position: var\(--story-mobile-position/);
  assert.match(styles, /@media \(max-aspect-ratio: 3 \/ 4\)[\s\S]*?height: min\(58dvh, 490px\)/);
  assert.doesNotMatch(styles, /object-position:\s*center/);
  assert.match(styles, /100dvh/);
});

test("the public homepage remains minimal and does not read private data or write business data", () => {
  assert.match(experience, /<HomeCarousel reducedMotion=\{reducedMotion\} onActiveStoryChange=\{setActiveStory\} \/>/);
  assert.match(experience, /<PublicProductNavigation active="home" overMedia \/>/);
  for (const rejected of ["从一张照片开始", "一张照片，一个称呼", "体验一次遇见", "<h1", "<h2"]) {
    assert.doesNotMatch(experience, new RegExp(rejected));
  }
  assert.doesNotMatch(carousel, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|\/api\//);
  assert.doesNotMatch(carousel, /method:\s*"(?:POST|PATCH|PUT|DELETE)"/);
});
