import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import type { MediaStorage } from "../../src/server/storage";
import { MediaType, type MediaAsset, type ReserveMediaInput } from "./types";
import { MediaRepository } from "./media-repository";
import { MediaService } from "./media-service";

const owner = "phone:portrait-quality-owner";
const memoryId = "00000000-0000-4000-8000-000000000001";

function asset(input: ReserveMediaInput): MediaAsset {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: owner,
    memoryId,
    mediaType: input.mediaType,
    storageKey: input.storageKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    sha256: input.sha256,
    status: "pending",
    failureCode: null,
    metadata: input.metadata,
    deletedAt: null,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  };
}

test("formal portrait upload persists the same passed quality result consumed by video eligibility", async () => {
  const reservations: ReserveMediaInput[] = [];
  const stored: string[] = [];
  const repository = {
    async reserve(input: ReserveMediaInput) {
      reservations.push(input);
      return { asset: asset(input), duplicate: false };
    },
    async markUploaded(id: string) {
      return { ...asset(reservations[0]), id, status: "uploaded" as const };
    },
    async markFailed() {},
  } as unknown as MediaRepository;
  const storage = {
    async put(input) { stored.push(input.key); return { key: input.key }; },
    async read() { throw new Error("not used by upload"); },
    async delete() {},
    async createSignedDownloadUrl() { return "https://example.test/media"; },
  } as MediaStorage;
  const body = await sharp({
    create: { width: 720, height: 1280, channels: 3, background: { r: 90, g: 110, b: 130 } },
  }).composite([{ input: Buffer.from(`<svg width="720" height="1280"><path d="M0 0L720 1280M720 0L0 1280" stroke="#f8efe2" stroke-width="28"/></svg>`) }]).jpeg({ quality: 92 }).toBuffer();

  const result = await new MediaService(repository, storage).upload({
    externalUserId: owner,
    memoryId,
    file: { name: "portrait.jpg", type: "image/jpeg", body },
  });

  assert.equal(result.asset.status, "uploaded");
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].metadata?.qualityPreflightStatus, "passed");
  assert.equal((reservations[0].metadata?.qualityPreflight as { status?: string }).status, "passed");
  assert.equal(stored.length, 1);
});

test("formal portrait upload records a failed quality outcome and never stores or stamps the file passed", async () => {
  const reservations: ReserveMediaInput[] = [];
  const failed: string[] = [];
  let stored = 0;
  const repository = {
    async reserve(input: ReserveMediaInput) {
      reservations.push(input);
      return { asset: asset(input), duplicate: false };
    },
    async markFailed(_id: string, _userId: string, code: string) { failed.push(code); },
  } as unknown as MediaRepository;
  const storage = {
    async put() { stored += 1; return { key: "unexpected" }; },
    async read() { throw new Error("not used by upload"); },
    async delete() {},
    async createSignedDownloadUrl() { return "https://example.test/media"; },
  } as MediaStorage;
  const body = await sharp({
    create: { width: 320, height: 320, channels: 3, background: { r: 120, g: 120, b: 120 } },
  }).png().toBuffer();

  await assert.rejects(
    new MediaService(repository, storage).upload({
      externalUserId: owner,
      memoryId,
      file: { name: "small.png", type: "image/png", body },
    }),
    (error) => error instanceof Error && error.message === "请更换更清晰照片",
  );
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].metadata?.qualityPreflightStatus, "failed");
  assert.equal(failed[0], "PHOTO_REPLACEMENT_REQUIRED");
  assert.equal(stored, 0);
});

test("a formal re-upload of a legacy photo carries its freshly measured passed result into the existing asset", async () => {
  const reservations: ReserveMediaInput[] = [];
  const repository = {
    async reserve(input: ReserveMediaInput) {
      reservations.push(input);
      return {
        asset: {
          ...asset(input),
          status: "uploaded" as const,
          metadata: input.metadata,
        },
        duplicate: true,
      };
    },
  } as unknown as MediaRepository;
  const storage = {
    async put() { throw new Error("duplicate must not write storage"); },
    async read() { throw new Error("not used by duplicate upload"); },
    async delete() {},
    async createSignedDownloadUrl() { return "https://example.test/media"; },
  } as MediaStorage;
  const body = await clearPortraitForReupload();

  const result = await new MediaService(repository, storage).upload({
    externalUserId: owner,
    memoryId,
    file: { name: "portrait.jpg", type: "image/jpeg", body },
  });

  assert.equal(result.duplicate, true);
  assert.equal(result.asset.metadata?.qualityPreflightStatus, "passed");
  assert.equal(reservations.length, 1);
});

async function clearPortraitForReupload(): Promise<Buffer> {
  const width = 720;
  const height = 1280;
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    const pixel = index / 3;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const step = ((x >> 4) + (y >> 4)) % 2 === 0 ? 85 : 175;
    pixels[index] = step;
    pixels[index + 1] = step + 9;
    pixels[index + 2] = step + 18;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
