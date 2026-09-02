import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(new URL("./GuestExperience.tsx", import.meta.url), "utf8");
const carousel = readFileSync(new URL("./HomeCarousel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./GuestExperience.module.css", import.meta.url), "utf8");

const stories = ["elderly-woman", "elderly-man", "child-drawing", "young-woman", "younger-man"];
const masterAssets = [
  ["home-master-v1.desktop.mp4", 15_000_000],
  ["home-master-v1.mobile.mp4", 7_000_000],
  ["home-master-v1.desktop.poster.webp", 10_000],
  ["home-master-v1.mobile.poster.webp", 10_000],
] as const;

test("the approved synthetic stories retain their five-person order and corrected accessible names", () => {
  let previous = -1;
  for (const slug of stories) {
    const position = carousel.indexOf(`slug: "${slug}"`);
    assert.ok(position > previous, `${slug} must retain its approved display order`);
    previous = position;
  }
  assert.match(carousel, /label: "窗边的母亲"/);
  assert.match(carousel, /label: "安静的父亲"/);
  assert.match(carousel, /label: "窗边写字的孩子"/);
  assert.match(carousel, /label: "熟悉的伴侣"/);
  assert.match(carousel, /label: "眼镜男士"/);
});

test("the five approved home-v2 sources remain available while versioned desktop and mobile masters are present", () => {
  for (const slug of stories) {
    const source = new URL(`../../public/home-hero-assets/${slug}.home-v2.mp4`, import.meta.url);
    assert.ok(existsSync(source), `missing approved source for ${slug}`);
    assert.ok(statSync(source).size > 1_000_000, `approved source for ${slug} is unexpectedly small`);
  }
  for (const [name, minimumSize] of masterAssets) {
    const asset = new URL(`../../public/home-hero-assets/${name}`, import.meta.url);
    assert.ok(existsSync(asset), `missing master asset ${name}`);
    assert.ok(statSync(asset).size > minimumSize, `${name} is unexpectedly small`);
  }
});

test("both masters are progressive faststart MP4s, so metadata is readable before media payload", () => {
  for (const name of ["home-master-v1.desktop.mp4", "home-master-v1.mobile.mp4"]) {
    const media = readFileSync(new URL(`../../public/home-hero-assets/${name}`, import.meta.url));
    const moovOffset = media.indexOf(Buffer.from("moov"));
    const mdatOffset = media.indexOf(Buffer.from("mdat"));
    assert.ok(moovOffset >= 0 && mdatOffset >= 0, `${name} must contain moov and mdat atoms`);
    assert.ok(moovOffset < mdatOffset, `${name} must place moov before mdat for progressive playback`);
  }
});

test("the homepage has exactly one real video player and no A/B handoff controller", () => {
  const videoTags = carousel.match(/<video\b/g) ?? [];
  assert.equal(videoTags.length, 1, "the carousel must render exactly one video element");
  assert.match(carousel, /data-carousel-player="single-master"/);
  assert.match(carousel, /autoPlay[\s\S]*?loop[\s\S]*?muted[\s\S]*?playsInline[\s\S]*?preload="auto"/);
  for (const rejected of [
    "videoARef",
    "videoBRef",
    "nextReady",
    "incomingReady",
    "crossfading",
    "activeLayer",
    "layerStories",
    "setTimeout",
    "requestVideoFrameCallback",
    "currentTime = 0",
  ]) {
    assert.doesNotMatch(carousel, new RegExp(rejected));
  }
});

test("desktop and mobile download only their matching master source and poster", () => {
  assert.match(carousel, /window\.matchMedia\("\(max-aspect-ratio: 3 \/ 4\)"\)/);
  assert.match(carousel, /<source media="\(max-aspect-ratio: 3 \/ 4\)" srcSet=\{posterMobile\}/);
  assert.match(carousel, /\{hasVideo && \([\s\S]*?src=\{masterAssetPath\(variant, "mp4"\)\}/);
  assert.match(carousel, /poster=\{masterAssetPath\(variant, "poster\.webp"\)\}/);
  assert.doesNotMatch(carousel, /<source[^>]+home-v2/);
});

test("the accessible story indicator follows master time only and never controls playback", () => {
  assert.match(carousel, /export function masterStoryIndexAt\(time: number\)/);
  assert.match(carousel, /Math\.floor\(time \/ HOME_MASTER_SEGMENT_SECONDS\)/);
  assert.match(carousel, /onTimeUpdate=\{\(event\) => updateActiveStory\(event\.currentTarget\.currentTime\)\}/);
  assert.doesNotMatch(carousel, /\.pause\(\)|\.load\(\)|\.play\(\).*setActiveIndex/);
});

test("the single master keeps approved full-viewport coverage without a veil or mobile black lower panel", () => {
  assert.match(styles, /\.media, \.poster, \.poster img, \.video \{ position: absolute; inset: 0; width: 100%; height: 100%; \}/);
  assert.match(styles, /\.poster img, \.video \{[\s\S]*?object-fit: cover;/);
  assert.doesNotMatch(styles, /mediaVeil|videoIncoming|videoOutgoing|videoIncomingVisible/);
  assert.doesNotMatch(styles, /height: min\(58dvh, 490px\)/);
  assert.match(styles, /100dvh/);
});

test("the public homepage remains minimal and cannot read private data or write business data", () => {
  assert.match(experience, /<HomeCarousel reducedMotion=\{reducedMotion\} onActiveStoryChange=\{setActiveStory\} \/>/);
  assert.match(experience, /<PublicProductNavigation active="home" overMedia \/>/);
  for (const rejected of ["从一张照片开始", "一张照片，一个称呼", "体验一次遇见", "<h1", "<h2"]) {
    assert.doesNotMatch(experience, new RegExp(rejected));
  }
  assert.doesNotMatch(carousel, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|\/api\//);
  assert.doesNotMatch(carousel, /method:\s*"(?:POST|PATCH|PUT|DELETE)"/);
});
