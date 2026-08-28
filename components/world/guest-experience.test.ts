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
  assert.match(experience, /TRANSITION_START_REMAINING_SECONDS = 1\.1/);
  assert.match(experience, /autoPlay[\s\S]*?muted[\s\S]*?playsInline/);
  assert.match(experience, /const firstVideoRef = useRef<HTMLVideoElement>\(null\)/);
  assert.match(experience, /const secondVideoRef = useRef<HTMLVideoElement>\(null\)/);
  assert.match(experience, /const \[slotStories, setSlotStories\] = useState<\[number, number\]>\(\[0, 1\]\)/);
  assert.match(experience, /preload="auto"/);
  assert.match(experience, /video\.load\(\)/);
  assert.match(experience, /video\.duration - video\.currentTime > TRANSITION_START_REMAINING_SECONDS/);
  assert.match(experience, /nextVideo\.readyState < HTMLMediaElement\.HAVE_CURRENT_DATA/);
  assert.match(experience, /loop=\{isFront\}/);
  assert.match(styles, /\.videoFront/);
  assert.match(styles, /\.videoIncomingVisible/);
  assert.match(styles, /@keyframes homeCrossfadeVeil/);
  assert.match(styles, /50% \{ opacity: 0\.12; \}/);
});

test("the carousel cannot recycle an outgoing source before its opacity transition ends", () => {
  assert.match(experience, /type CarouselPhase = "idle" \| "preparing" \| "crossfading" \| "settling"/);
  assert.match(experience, /requestVideoFrameCallback/);
  assert.match(experience, /function waitForMediaReady/);
  assert.match(experience, /waitForPlaybackProgress/);
  assert.match(experience, /await video\.play\(\);[\s\S]*?Promise\.all\(\[[\s\S]*?waitForDecodedFirstFrame[\s\S]*?waitForPlaybackProgress/);
  assert.match(experience, /onTransitionEnd=\{\(event\) => handleTransitionEnd\(slot, event\)\}/);
  assert.match(experience, /setCarouselPhase\("settling"\)[\s\S]*?setFrontSlot\(incoming\)[\s\S]*?window\.requestAnimationFrame/);
  assert.match(experience, /window\.requestAnimationFrame\([\s\S]*?setSlotStoryAfterSettling\(outgoing, followingStoryIndex\)/);
  assert.match(experience, /phaseRef\.current === "crossfading"[\s\S]*?transitionRef\.current = null[\s\S]*?setCarouselPhase\("idle"\)/);
  assert.doesNotMatch(experience, /setSlotStories\(\(current\) =>[\s\S]*?setFrontSlot\(/);
  assert.doesNotMatch(experience, /freezeCurrentFrame|holdingLastFrame|onEnded=/);
});

test("the homepage contains no rejected photo landing page, public demo flow, or marketing copy", () => {
  for (const rejected of ["从一张照片开始", "一张照片，一个称呼", "体验一次遇见", "family-frame-hero-v2", "awakening", "guest-experience"]) {
    assert.doesNotMatch(experience, new RegExp(rejected));
  }
  assert.match(experience, />创建 TA</);
  assert.match(experience, /showLogin && <button className=\{styles\.loginAction\}[^>]*>登录/);
  assert.match(experience, /<PublicProductNavigation active="home" overMedia \/>/);
  assert.doesNotMatch(experience, /<h1|<h2|invitationLine|heroSecondaryAction/);
});

test("the public carousel is read-only, privacy-safe, and falls back to its approved posters", () => {
  assert.doesNotMatch(experience, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|\/api\//);
  assert.doesNotMatch(experience, /method:\s*"(?:POST|PATCH|PUT|DELETE)"/);
  assert.match(experience, /src=\{assetPath\(activeStory, "poster\.webp"\)\}/);
  assert.match(experience, /shouldUseStaticHero/);
  assert.match(experience, /useReducedMotion/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /safe-area-inset-top/);
  assert.match(styles, /safe-area-inset-bottom/);
});
