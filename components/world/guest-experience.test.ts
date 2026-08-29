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

test("the current and next native video tags preload before hydration and the next remains paused at its real first frame", () => {
  assert.match(carousel, /\{\(\[0, 1\] as const\)\.map\(\(slot\) => \{/);
  assert.match(carousel, /src=\{assetPath\(story, "mp4"\)\}[\s\S]*?preload="auto"/);
  assert.match(carousel, /void first\.play\(\)\.catch\(\(\) => undefined\);[\s\S]*?void warmSlot\(1, 1\)/);
  assert.match(carousel, /video\.src = assetPath\(story, "mp4"\);[\s\S]*?video\.load\(\)/);
  assert.match(carousel, /if \(video\.networkState === HTMLMediaElement\.NETWORK_EMPTY\) video\.load\(\);/);
  assert.doesNotMatch(carousel, /as="video"|preloadNextStory|data-home-carousel-next-preload/);
  assert.match(carousel, /await waitForCurrentData\(video, controller\.signal\);[\s\S]*?await seek\(video, 0\.05, controller\.signal\);[\s\S]*?await video\.play\(\);[\s\S]*?await waitForDecodedFrame\(video, controller\.signal\);[\s\S]*?video\.pause\(\);[\s\S]*?await seek\(video, 0, controller\.signal\)/);
  assert.match(carousel, /requestVideoFrameCallback/);
  assert.doesNotMatch(carousel, /canplaythrough/);
  assert.match(carousel, /PREPARE_WINDOW_MS = 2_000/);
});

test("the handoff cannot put two faces on screen or recycle the outgoing source early", () => {
  const fadeOutEnd = carousel.indexOf("await waitForOpacity(outgoingVideo, 0");
  const incomingPlay = carousel.indexOf("const incomingPlayback = incomingVideo.play()");
  const incomingFadeEnd = carousel.indexOf("await waitForOpacity(incomingVideo, VISIBLE_OPACITY");
  const recycle = carousel.indexOf("assignSource(outgoing, followingIndex)");
  assert.ok(fadeOutEnd >= 0 && incomingPlay > fadeOutEnd, "the incoming video starts only after outgoing opacity is zero");
  assert.ok(incomingFadeEnd >= 0 && recycle > incomingFadeEnd, "the old source is stable through both transitionend boundaries");
  assert.match(carousel, /setOpacityForSlot\(outgoing, 0\);[\s\S]*?setVeil\(VEIL_OPACITY\)/);
  assert.match(carousel, /incomingVideo\.currentTime = 0;[\s\S]*?const incomingPlayback = incomingVideo\.play\(\);[\s\S]*?setOpacityForSlot\(incoming, VISIBLE_OPACITY\);[\s\S]*?await incomingPlayback/);
  assert.match(carousel, /data-carousel-layer=\{slot === visibleSlot \? "visible" : "hidden"\}/);
  assert.doesNotMatch(styles, /videoIncomingVisible|videoOutgoing|homeCrossfadeVeil/);
  assert.match(carousel, /data-video-enabled=\{videoEnabled \? "true" : "false"\}/);
  assert.match(styles, /\[data-home-carousel\]\[data-video-enabled="true"\] \.poster \{ opacity: 0; \}/);
});

test("a missing next asset never pauses or freezes the visible person", () => {
  assert.match(carousel, /if \(incomingVideo\.readyState < HTMLMediaElement\.HAVE_CURRENT_DATA \|\| incomingVideo\.currentTime >= 0\.2\)/);
  assert.match(carousel, /outgoingVideo\.loop = true;[\s\S]*?void outgoingVideo\.play\(\)/);
  assert.match(carousel, /slow next asset never freezes the visible person/);
  assert.match(carousel, /retryTimerRef\.current = window\.setTimeout/);
  assert.doesNotMatch(carousel, /onEnded=/);
});

test("a late next clip takes over in the opening loop beat instead of repeating a full story", () => {
  assert.match(carousel, /const missedEndWindowRef = useRef\(false\)/);
  assert.match(carousel, /if \(inEndWindow\) missedEndWindowRef\.current = true;/);
  assert.match(carousel, /const readyAfterMissedEnd = missedEndWindowRef\.current[\s\S]*?video\.currentTime < 1;/);
  assert.match(carousel, /if \(inEndWindow \|\| readyAfterMissedEnd\) void startTransition\(\);/);
  const reset = carousel.indexOf("missedEndWindowRef.current = false;");
  const nextVisible = carousel.indexOf("visibleSlotRef.current = incoming;");
  assert.ok(reset >= 0 && reset < nextVisible, "the delayed-end marker resets only as the new person takes over");
});

test("mobile uses per-story focal metadata rather than one centered crop", () => {
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

