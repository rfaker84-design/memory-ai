import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
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
  assert.match(carousel, /const HOME_ASSET_VERSION = "home-v2"/);
  assert.match(carousel, /\$\{story\.slug\}\.\$\{HOME_ASSET_VERSION\}\.\$\{extension\}/);
  assert.match(carousel, /data-carousel-visible-index/);
});

test("each homepage story uses a new versioned MP4 and a poster extracted alongside it", () => {
  for (const slug of ["elderly-woman", "elderly-man", "child-drawing", "young-woman", "younger-man"]) {
    const video = new URL(`../../public/home-hero-assets/${slug}.home-v2.mp4`, import.meta.url);
    const poster = new URL(`../../public/home-hero-assets/${slug}.home-v2.poster.webp`, import.meta.url);
    assert.ok(existsSync(video), `missing versioned video for ${slug}`);
    assert.ok(existsSync(poster), `missing versioned poster for ${slug}`);
    assert.ok(statSync(video).size > 1_000_000, `versioned video for ${slug} is unexpectedly small`);
    assert.ok(statSync(poster).size > 10_000, `versioned poster for ${slug} is unexpectedly small`);
  }
});

test("the hidden native layer only preloads at time zero and gates the dissolve on playable data", () => {
  assert.match(carousel, /video\.pause\(\);[\s\S]*?video\.currentTime = 0;[\s\S]*?video\.preload = "auto";[\s\S]*?video\.load\(\)/);
  assert.match(carousel, /if \(prepared \|\| video\.readyState < HTMLMediaElement\.HAVE_CURRENT_DATA\) return;[\s\S]*?video\.pause\(\);[\s\S]*?video\.currentTime = 0;[\s\S]*?setIncomingReady\(true\)/);
  assert.match(carousel, /let prepared = false;[\s\S]*?if \(prepared \|\| video\.readyState < HTMLMediaElement\.HAVE_CURRENT_DATA\) return;[\s\S]*?prepared = true;[\s\S]*?detachReadyListeners\(\)/);
  assert.match(carousel, /if \(!videoEnabled \|\| !incomingReady \|\| crossfading \|\| transitionInFlightRef\.current\) return;/);
  assert.match(carousel, /incomingVideo\.readyState < HTMLMediaElement\.HAVE_CURRENT_DATA/);
  assert.match(carousel, /if \(video\.duration - video\.currentTime <= END_WINDOW_SECONDS\) void beginTransition\(\);/);
  assert.match(carousel, /const videoARef = useRef<HTMLVideoElement>\(null\);/);
  assert.match(carousel, /const videoBRef = useRef<HTMLVideoElement>\(null\);/);
  assert.match(carousel, /ref=\{layer === "a" \? videoARef : videoBRef\}/);
  assert.match(carousel, /data-carousel-layer=\{layer\}/);
  assert.match(carousel, /preload="auto"/);
  assert.match(carousel, /useLayoutEffect\(\(\) => \{[\s\S]*?const video = videoForLayer\(activeLayer\);[\s\S]*?void video\.play\(\)\.catch\(\(\) => undefined\);/);
  assert.doesNotMatch(carousel, /key=\{`(?:active|incoming)-/);
  assert.doesNotMatch(carousel, /requestVideoFrameCallback|canplaythrough|seek\(|0\.05|NEUTRAL_CUT_MS/);
});

test("the approved original dissolve promotes the already-playing fixed layer without restarting it", () => {
  assert.match(carousel, /const CROSSFADE_MS = 1_000/);
  assert.match(carousel, /setCrossfading\(true\);[\s\S]*?window\.setTimeout\([\s\S]*?completeTransition\(incomingLayer, incomingIndex\)[\s\S]*?CROSSFADE_MS/);
  const complete = carousel.indexOf("const completeTransition");
  const pauseOutgoing = carousel.indexOf("outgoingVideo?.pause()", complete);
  const swapLayer = carousel.indexOf("setActiveLayer(nextLayer)", complete);
  const recycleHidden = carousel.indexOf("[outgoingLayer]: (nextIndex + 1) % HOME_STORIES.length", complete);
  const changeLabel = carousel.indexOf("onActiveStoryChange(HOME_STORIES[nextIndex])", complete);
  assert.ok(complete >= 0 && pauseOutgoing > complete && swapLayer > pauseOutgoing && recycleHidden > swapLayer && changeLabel > recycleHidden, "the playing incoming layer is promoted before only the hidden layer is recycled and the label changes");
  assert.match(carousel, /const \[activeLayer, setActiveLayer\] = useState<Layer>\("a"\);/);
  assert.match(carousel, /const \[layerStories, setLayerStories\] = useState<LayerStories>\(\{ a: 0, b: 1 \}\);/);
  assert.match(carousel, /incomingVideo\.currentTime = 0;[\s\S]*?await incomingVideo\.play\(\);[\s\S]*?setCrossfading\(true\)/);
  assert.match(carousel, /Only then does[\s\S]*?hidden node receive the following person at time zero/);
  assert.doesNotMatch(carousel, /setActiveIndex\(|key=\{|incomingVideoRef|activeVideoRef/);
  assert.match(styles, /--home-transition: 1s cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(styles, /\.video \{ z-index: 1; opacity: 0\.92; transition: opacity var\(--home-transition\);/);
  assert.match(styles, /\.videoOutgoing, \.videoIncoming \{ opacity: 0; \}/);
  assert.match(styles, /\.videoIncomingVisible \{ opacity: 0\.92; \}/);
  assert.doesNotMatch(carousel, /lightVeil|veilStage|neutral-fade|atomic-layer-swap|preparing-next|next-frame-ready/);
});

test("outside the one-second dissolve only the active layer is permitted to play", () => {
  assert.match(carousel, /const isActive = layer === activeLayer;/);
  assert.match(carousel, /!isActive \? styles\.videoIncoming : ""/);
  assert.match(carousel, /crossfading && !isActive \? styles\.videoIncomingVisible : ""/);
  assert.match(carousel, /if \(layer !== activeLayer \|\| crossfading \|\| !incomingReady/);
  assert.match(carousel, /outgoingVideo\?\.pause\(\);[\s\S]*?outgoingVideo\.currentTime = 0;/);
});

test("mobile keeps per-story focal metadata while the approved media fills the entire viewport", () => {
  assert.match(styles, /object-position: var\(--story-desktop-position/);
  assert.match(styles, /@media \(max-aspect-ratio: 3 \/ 4\)[\s\S]*?object-position: var\(--story-mobile-position/);
  assert.match(styles, /\.media, \.poster, \.video, \.mediaVeil \{ position: absolute; inset: 0; width: 100%; height: 100%; \}/);
  assert.doesNotMatch(styles, /height: min\(58dvh, 490px\)/);
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
