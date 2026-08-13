import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  PhotoQualityPreflightError,
  portraitQualityMetadata,
  preflightPortraitPhoto,
} from "./photo-quality-preflight";

async function clearPortrait(): Promise<Buffer> {
  const width = 720;
  const height = 1280;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      const value = ((x >> 4) + (y >> 4)) % 2 === 0 ? 78 : 178;
      pixels[index] = value;
      pixels[index + 1] = value + 8;
      pixels[index + 2] = value + 16;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}

test("portrait preflight decodes pixels and returns the canonical passed metadata", async () => {
  const preflight = await preflightPortraitPhoto(await clearPortrait());

  assert.equal(preflight.status, "passed");
  assert.equal(preflight.version, 1);
  assert.equal(preflight.width, 720);
  assert.equal(preflight.height, 1280);
  assert.ok((preflight.sharpness ?? 0) >= 40);
  assert.deepEqual(portraitQualityMetadata(preflight), {
    qualityPreflightStatus: "passed",
    qualityPreflight: preflight,
  });
});

test("portrait preflight rejects an undersized photo with a formal replacement state", async () => {
  const tiny = await sharp({
    create: { width: 320, height: 320, channels: 3, background: { r: 100, g: 100, b: 100 } },
  }).jpeg().toBuffer();

  await assert.rejects(
    preflightPortraitPhoto(tiny),
    (error) => error instanceof PhotoQualityPreflightError
      && error.code === "PHOTO_REPLACEMENT_REQUIRED"
      && error.preflight.status === "failed"
      && error.preflight.reason === "IMAGE_DIMENSIONS_TOO_SMALL",
  );
});

test("portrait preflight rejects a decoded but low-contrast image instead of stamping it passed", async () => {
  const flat = await sharp({
    create: { width: 720, height: 1280, channels: 3, background: { r: 124, g: 124, b: 124 } },
  }).jpeg().toBuffer();

  await assert.rejects(
    preflightPortraitPhoto(flat),
    (error) => error instanceof PhotoQualityPreflightError
      && error.preflight.status === "failed"
      && error.preflight.reason === "IMAGE_CONTRAST_TOO_LOW",
  );
});
