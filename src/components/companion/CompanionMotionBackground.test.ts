import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("./CompanionMotionBackground.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./CompanionMotionBackground.module.css", import.meta.url), "utf8");

test("owner motion reads the durable pack without generating and never blocks its still portrait", () => {
  assert.match(component, /await loadCompanionMotionPack\(memoryId, controller\.signal\)/);
  assert.match(component, /<img[\s\S]*data-motion-still="true"[\s\S]*src=\{portraitUrl\}/);
  assert.doesNotMatch(component, /ensureCompanionMotionPackOnce|companionMotionPackNeedsEnsure/);
  assert.doesNotMatch(component, /home-hero|visitor-demo|initial_preview|encounter-playback|provider/i);
});

test("owner motion loads idle first, warms state changes before crossfading, and reduced motion remains fully static", () => {
  assert.match(component, /<video[\s\S]*autoPlay[\s\S]*muted[\s\S]*loop[\s\S]*playsInline/);
  assert.match(component, /const requestedVariant: CompanionMotionVariant = sources\.idle \? variant : "idle"/);
  assert.match(component, /preload=\{motionVariant === targetVariant \? "auto" : "none"\}/);
  assert.match(component, /onLoadedData=\{\(\) => \{[\s\S]*warm\(motionVariant\);[\s\S]*\}\}/);
  assert.match(component, /onTimeUpdate=\{\(\) => \{[\s\S]*showAfterFirstMovingFrame\(motionVariant\);[\s\S]*\}\}/);
  assert.match(component, /data-visible=\{visibleVariant === motionVariant/);
  assert.match(component, /videoNodes\.current\.get\(previous\)\?\.pause\(\)/);
  assert.match(css, /transition: opacity 900ms/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*display: none !important/);
  assert.match(component, /motionEnabled && Object\.entries\(sources\)/);
});

test("Staging-only debug panel observes the existing media chain without generating or changing production playback", () => {
  assert.match(component, /const STAGING_DEBUG_HOST = "app\.staging\.yijianmemory\.cn"/);
  assert.match(component, /window\.location\.hostname === STAGING_DEBUG_HOST/);
  assert.match(component, /get\("motionDebug"\) === "1"/);
  assert.match(component, /data-motion-video=\{motionVariant\}/);
  assert.match(component, /readyState: video\?\.readyState/);
  assert.match(component, /networkState: video\?\.networkState/);
  assert.match(component, /currentTime: video \? Number\(video\.currentTime\.toFixed\(3\)\)/);
  assert.match(component, /navigator\.clipboard\.writeText\(payload\)/);
  assert.doesNotMatch(component, /ensureCompanionMotionPackOnce|ensureCompanionMotionPack\(memoryId/);
  assert.match(css, /\.debugPanel/);
});
