import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createUploadMediaHandler } from "./_handler";

const memoryId = "00000000-0000-4000-8000-000000000001";
const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
  assert.deepEqual(await response.json(), { error: "AUDIO_UPLOAD_NOT_AVAILABLE" });
  assert.equal(consentCalls, 0);
  assert.equal(uploadCalls, 0);
});
