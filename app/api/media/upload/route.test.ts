import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { MediaType } from "@/features/media";
import { createUploadMediaHandler } from "./_handler";

const memoryId = "00000000-0000-4000-8000-000000000001";
const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function uploadedAsset(id: string) {
  return {
    id,
    userId: "media-metrics-owner",
    memoryId,
    mediaType: MediaType.IMAGE,
    storageKey: "staging/media-metrics.png",
    mimeType: "image/png",
    sizeBytes: image.length,
    sha256: "a".repeat(64),
    status: "uploaded" as const,
    failureCode: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function request(): NextRequest {
  const form = new FormData();
  form.set("memoryId", memoryId);
  form.set("file", new File([Uint8Array.from(image)], "portrait.png", { type: "image/png" }));
  return new NextRequest("https://memoryai.test/api/media/upload", { method: "POST", body: form });
}

function audioRequest(): NextRequest {
  const form = new FormData();
  form.set("memoryId", memoryId);
  form.set("file", new File([Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])], "voice.wav", { type: "audio/wav" }));
  return new NextRequest("https://memoryai.test/api/media/upload", { method: "POST", body: form });
}

test("a direct media upload cannot bypass its TA-bound media consent", async () => {
  let uploadCalls = 0;
  const handler = createUploadMediaHandler(
    async () => "phone:media-consent-owner",
    () => null,
    () => ({
      async upload() {
        uploadCalls += 1;
        throw new Error("must not upload");
      },
    }),
    async () => false,
  );

  const response = await handler(request());
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("vary"), "Cookie, Origin");
  assert.deepEqual(await response.json(), { error: "MEDIA_CONSENT_REQUIRED" });
  assert.equal(uploadCalls, 0);
});

test("the public media route rejects audio before consent, storage, or database work", async () => {
  let consentCalls = 0;
  let uploadCalls = 0;
  const handler = createUploadMediaHandler(
    async () => "phone:media-consent-owner",
    () => null,
    () => ({ async upload() { uploadCalls += 1; throw new Error("must not upload"); } }),
    async () => { consentCalls += 1; return true; },
  );

  const response = await handler(audioRequest());
  assert.equal(response.status, 415);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("vary"), "Cookie, Origin");
  assert.deepEqual(await response.json(), { error: "AUDIO_UPLOAD_NOT_AVAILABLE" });
  assert.equal(consentCalls, 0);
  assert.equal(uploadCalls, 0);
});

test("a confirmed image upload records the server-owned photo-success fact", async () => {
  const recorded: unknown[] = [];
  const handler = createUploadMediaHandler(
    async () => "phone:media-metrics-owner",
    () => null,
    () => ({
      async upload() {
        return {
          asset: uploadedAsset("asset-metrics"),
          duplicate: false,
        };
      },
    }),
    async () => true,
    () => ({ async recordInteraction(input) { recorded.push(input); return { recorded: true }; } }),
  );

  const response = await handler(request());
  assert.equal(response.status, 201);
  assert.deepEqual(recorded, [{
    schemaVersion: 1,
    eventName: "photo_upload_succeeded",
    idempotencyKey: `metrics:v1:photo-upload:${memoryId}`,
    source: "server",
    externalUserId: "phone:media-metrics-owner",
    memoryId,
    properties: { surface: "first_presence" },
  }]);
});

test("a metrics write failure does not change confirmed media-upload success", async () => {
  const handler = createUploadMediaHandler(
    async () => "phone:media-metrics-owner",
    () => null,
    () => ({
      async upload() {
        return {
          asset: uploadedAsset("asset-metrics-failure"),
          duplicate: false,
        };
      },
    }),
    async () => true,
    () => ({ async recordInteraction() { throw new Error("metrics unavailable"); } }),
  );

  const response = await handler(request());
  assert.equal(response.status, 201);
});
