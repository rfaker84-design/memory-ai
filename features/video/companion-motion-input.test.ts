import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import sharp from "sharp";

import {
  COMPANION_MOTION_FRAME_HEIGHT,
  COMPANION_MOTION_FRAME_WIDTH,
  deriveCompanionMotionInput,
} from "./companion-motion-input";

async function landscapePortrait(): Promise<Buffer> {
  const width = 1502;
  const height = 1382;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const value = (x * 17 + y * 13) % 256;
      pixels[offset] = value;
      pixels[offset + 1] = (value + 41) % 256;
      pixels[offset + 2] = (value + 83) % 256;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

test("companion motion derives a provider-only vertical frame without mutating or cropping the source", async () => {
  const source = await landscapePortrait();
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const sourceUrl = `data:image/jpeg;base64,${source.toString("base64")}`;
  const derived = await deriveCompanionMotionInput(sourceUrl);
  const encoded = Buffer.from(derived.imageDataUrl.split(",", 2)[1]!, "base64");
  const metadata = await sharp(encoded).metadata();

  assert.equal(metadata.width, COMPANION_MOTION_FRAME_WIDTH);
  assert.equal(metadata.height, COMPANION_MOTION_FRAME_HEIGHT);
  assert.equal(derived.inputSha256, createHash("sha256").update(encoded).digest("hex"));
  assert.notEqual(derived.imageDataUrl, sourceUrl);
  assert.equal(createHash("sha256").update(source).digest("hex"), sourceHash);
});

test("companion motion rejects malformed private staging input", async () => {
  await assert.rejects(
    deriveCompanionMotionInput("data:text/plain;base64,aGVsbG8="),
    /COMPANION_MOTION_INPUT_INVALID/,
  );
});
