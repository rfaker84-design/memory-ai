import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { InternalBetaVoiceCloneService, type VoiceCloneReservation } from "@/features/voice-clone";
import { MediaType, type MediaAsset } from "@/features/media";

import { createQwenVoiceCloneHandlers } from "./_handler";

const memoryId = "11111111-1111-4111-8111-111111111111";
const audioAssetId = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ id: memoryId }) };
const idempotencyKey = "voice-clone-test-request-0001";

process.env.AUTH_ALLOWED_ORIGIN = "http://localhost";

function request(file = new File([
  Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]),
], "voice.wav", { type: "audio/wav" })) {
  const form = new FormData();
  form.set("file", file);
  return new NextRequest(`http://localhost/api/memories/${memoryId}/voice-clone`, {
    method: "POST",
    headers: { origin: "http://localhost", "idempotency-key": idempotencyKey },
    body: form,
  });
}

function fakes() {
  const calls: string[] = [];
  const service: Pick<InternalBetaVoiceCloneService, "reserve" | "create" | "complete" | "fail"> = {
    async reserve(): Promise<VoiceCloneReservation> {
      calls.push("reserve");
      return { jobId: "job-1", storageKey: "staging/voice.wav", existing: false, status: "pending", voiceId: null };
    },
    async create() {
      calls.push("create");
      return {
        provider: "qwen_audio_tts_flash",
        providerJobId: "voice-1",
        status: "completed",
        progress: 100,
        voiceId: "voice-1",
        providerRequest: {},
        providerResponse: {},
      };
    },
    async complete() { calls.push("complete"); },
    async fail() { calls.push("fail"); },
  };
  const audioAsset: MediaAsset = {
    id: audioAssetId,
    userId: "internal-owner",
    memoryId,
    mediaType: MediaType.AUDIO,
    storageKey: "staging/voice.wav",
    mimeType: "audio/wav",
    sizeBytes: 12,
    sha256: "a".repeat(64),
    status: "uploaded",
    failureCode: null,
    deletedAt: null,
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
  };
  return {
    calls,
    service,
    media: {
      async upload() {
        calls.push("upload");
        return { asset: audioAsset, duplicate: false };
      },
      async createDownloadUrl() {
        calls.push("signed-url");
        return { url: "https://example.test/signed", expiresAt: "2026-08-27T00:00:00.000Z" };
      },
    },
  };
}

const sessionResolver = async () => ({
  userId: "internal-owner",
  externalUserId: "voice-tester",
  expiresAt: "2026-08-27T00:00:00.000Z",
});

test("Qwen voice cloning is invisible before any upload when beta access is denied", async () => {
  const fake = fakes();
  const handlers = createQwenVoiceCloneHandlers(() => fake.service, () => fake.media as never, sessionResolver, () => false, async () => true);
  const response = await handlers.POST(request(), context);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "BETA_NOT_AVAILABLE" });
  assert.deepEqual(fake.calls, []);
});

test("Qwen voice cloning requires recorded consent before storing an audio sample", async () => {
  const fake = fakes();
  const handlers = createQwenVoiceCloneHandlers(() => fake.service, () => fake.media as never, sessionResolver, () => true, async () => false);
  const response = await handlers.POST(request(), context);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "VOICE_CLONE_CONSENT_REQUIRED" });
  assert.deepEqual(fake.calls, []);
});

test("an allowed, consented beta account creates one owned Qwen clone without exposing provider details", async () => {
  const fake = fakes();
  const handlers = createQwenVoiceCloneHandlers(() => fake.service, () => fake.media as never, sessionResolver, () => true, async () => true);
  const response = await handlers.POST(request(), context);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { job: { id: "job-1", status: "ready" } });
  assert.deepEqual(fake.calls, ["upload", "reserve", "signed-url", "create", "complete"]);
});

test("an existing idempotent job does not mint a second Qwen voice", async () => {
  const fake = fakes();
  fake.service.reserve = async () => ({ jobId: "job-existing", storageKey: "staging/voice.wav", existing: true, status: "ready", voiceId: "existing-voice" });
  const handlers = createQwenVoiceCloneHandlers(() => fake.service, () => fake.media as never, sessionResolver, () => true, async () => true);
  const response = await handlers.POST(request(), context);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { job: { id: "job-existing", status: "ready" } });
  assert.deepEqual(fake.calls, ["upload"]);
});
