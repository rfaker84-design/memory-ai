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

test("the light-veil state machine cannot enter the transition without a decoded next frame", () => {
  for (const phase of ["idle", "preparing-next", "next-frame-ready", "light-veil-in", "atomic-layer-swap", "light-veil-out", "committed"]) {
    assert.match(carousel, new RegExp(`"${phase}"`));
  }
  assert.match(carousel, /if \(!videoEnabled \|\| phaseRef\.current !== "next-frame-ready"\) return;/);
  assert.match(carousel, /prepared\?\.slot !== incoming[\s\S]*?incomingVideo\.readyState < HTMLMediaElement\.HAVE_CURRENT_DATA[\s\S]*?incomingVideo\.currentTime >= 0\.2/);
  assert.match(carousel, /A slow next asset is retried in the background[\s\S]*?No veil or dimming is allowed on this path/);
  assert.match(carousel, /outgoingVideo\.loop = true;[\s\S]*?void outgoingVideo\.play\(\)/);
});

test("the person index changes only inside the atomic swap and the old source is recycled after commit", () => {
  const atomic = carousel.indexOf('setPhaseSafe("atomic-layer-swap")');
  const outgoingHidden = carousel.indexOf("setOpacityForSlot(outgoing, 0)", atomic);
  const incomingVisible = carousel.indexOf("setOpacityForSlot(incoming, VISIBLE_OPACITY)", atomic);
  const indexUpdate = carousel.indexOf("visibleSlotRef.current = incoming", atomic);
  const committed = carousel.indexOf('setPhaseSafe("committed")', atomic);
  const recycle = carousel.indexOf("assignSource(outgoing, followingIndex)", committed);
  assert.ok(atomic >= 0 && outgoingHidden > atomic && incomingVisible > outgoingHidden && indexUpdate > incomingVisible, "visible person changes only as the two video layers swap");
  assert.ok(committed > indexUpdate && recycle > committed, "next-next prewarm waits until the veil transition has committed");
  assert.match(carousel, /if \(!videoEnabled \|\| phaseRef\.current !== "next-frame-ready"\) return;/);
});

test("the light veil is warm, covers the atomic swap, and never uses a black fade or visible face crossfade", () => {
  assert.match(carousel, /setPhaseSafe\("light-veil-in"\)[\s\S]*?setVeilStage\("in"\)[\s\S]*?await wait\(VEIL_SWAP_DELAY_MS[\s\S]*?await commitAtomicSwap[\s\S]*?setPhaseSafe\("light-veil-out"\)[\s\S]*?setVeilStage\("out"\)/);
  assert.match(styles, /\.lightVeil[\s\S]*?linear-gradient\(90deg, rgba\(248, 231, 200, 0\)/);
  assert.match(styles, /transform: translate3d\(/);
  assert.match(styles, /\[data-home-carousel\]\[data-light-veil="in"\] \.lightVeil/);
  assert.match(styles, /\[data-home-carousel\]\[data-light-veil="out"\] \.lightVeil/);
  assert.match(styles, /\[data-home-carousel\]\[data-video-enabled="true"\] \.poster \{ opacity: 0; \}/);
  assert.match(styles, /\.video \{ z-index: 1; opacity: 0; transition: none;/);
  assert.doesNotMatch(styles, /crossfadeVeil|videoIncomingVisible|videoOutgoing/);
  assert.doesNotMatch(carousel, /setVeil\(VEIL_OPACITY\)|waitForOpacity/);
});

test("reduced motion uses the already-decoded next opening frame and swaps directly", () => {
  assert.match(carousel, /if \(reducedMotion\) \{[\s\S]*?await commitAtomicSwap\(outgoing, incoming, incomingStoryIndex, controller, run\);/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.video \{ transition: none; \}[\s\S]*?\.lightVeil \{ display: none; \}/);
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
