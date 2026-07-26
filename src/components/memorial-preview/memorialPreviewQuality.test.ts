import assert from "node:assert/strict";
import test from "node:test";

import { judgePhotoQuality } from "./memorialPreviewQuality";

test("accepts a clear, sufficiently large and evenly lit photo", () => {
  const result = judgePhotoQuality({
    width: 1440,
    height: 1920,
    brightness: 126,
    contrast: 42,
    sharpness: 12,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.code, "ready");
});

test("gently blocks small, dark, washed out, flat, and soft photos", () => {
  assert.equal(judgePhotoQuality({ width: 320, height: 640, brightness: 110, contrast: 30, sharpness: 9 }).code, "too-small");
  assert.equal(judgePhotoQuality({ width: 1080, height: 1440, brightness: 18, contrast: 30, sharpness: 9 }).code, "too-dark");
  assert.equal(judgePhotoQuality({ width: 1080, height: 1440, brightness: 244, contrast: 30, sharpness: 9 }).code, "too-bright");
  assert.equal(judgePhotoQuality({ width: 1080, height: 1440, brightness: 120, contrast: 8, sharpness: 9 }).code, "low-contrast");
  assert.equal(judgePhotoQuality({ width: 1080, height: 1440, brightness: 120, contrast: 30, sharpness: 2 }).code, "soft-focus");
});
