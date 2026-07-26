import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync("src/components/memorial-preview/MemorialPreviewExperience.tsx", "utf8");
const styles = readFileSync("src/components/memorial-preview/MemorialPreviewExperience.module.css", "utf8");
const home = readFileSync("app/page.tsx", "utf8");
const acceptance = readFileSync("app/sprint21-core-experience/page.tsx", "utf8");

test("public flow is photo-first, quality-gated, and zero-write", () => {
  assert.match(experience, /上传 TA 的照片/);
  assert.match(experience, /assessPhotoFile\(file\)/);
  assert.match(experience, /质量判断/);
  assert.match(experience, /不会先展示照片/);
  assert.match(experience, /照片只在当前设备完成本次预览/);
  assert.doesNotMatch(experience, /fetch\(|localStorage|sessionStorage|recordTrustConsent/);
});

test("first appearance is ten seconds, vertical, silent, and has no speaking simulation", () => {
  assert.match(experience, /const PREVIEW_DURATION_MS = 10_000/);
  assert.match(experience, /10 秒 · 9:16 · 静音 · 无口型/);
  assert.match(styles, /aspect-ratio: 9 \/ 16/);
  assert.match(styles, /animation: portraitTakeOne 10s/);
  assert.doesNotMatch(experience, /audio|voice|speech|lip/i);
});

test("save choice is restrained and library keeps preview explicitly unsaved", () => {
  assert.match(experience, /把这一刻留下/);
  assert.match(experience, /再生成一次/);
  assert.match(experience, /这里不会突然扣费/);
  assert.match(experience, /影像库/);
  assert.match(experience, /本次预览 · 未保存/);
  assert.doesNotMatch(experience, /49元|立即购买|支付/);
});

test("public home and dedicated acceptance route both expose the experience", () => {
  assert.match(home, /MemorialPreviewExperience/);
  assert.match(acceptance, /acceptanceMode/);
  assert.match(acceptance, /MemorialPreviewExperience/);
});

test("mobile safe areas and reduced motion are present", () => {
  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
