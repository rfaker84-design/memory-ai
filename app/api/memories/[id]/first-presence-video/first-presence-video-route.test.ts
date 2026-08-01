import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { NextRequest } from "next/server";

import {
  FirstPresenceVideoOwnerApiError,
  FirstPresenceVideoOwnerApiService,
  toFirstPresenceVideoSafeDto,
  type CreateOwnerVideoJobInput,
  type OwnerVideoJob,
  type OwnerVideoJobCommandPort,
  type OwnerVideoJobQueryPort,
  type OwnerVideoQueuePort,
} from "../../../../../features/video";
import { createFirstPresenceVideoHandler } from "./_handler";
import { ProductCapabilityUnavailableError } from "@/src/server/runtime/product-capability-gate";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const memoryId = "11111111-1111-4111-8111-111111111111";
const externalUserId = `phone:${"a".repeat(64)}`;
const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  externalUserId,
  expiresAt: "2026-07-29T00:00:00.000Z",
};

function job(overrides: Partial<OwnerVideoJob> = {}): OwnerVideoJob {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    externalUserId,
    memoryId,
    idempotencyKey: "first-presence-video-0001",
    intent: "initial_preview",
    status: "queued",
    provider: "vidu-cn-q2-pro-fast",
    providerTaskId: "provider-task-hidden",
    providerState: "provider-state-hidden",
    inputSha256: "a".repeat(64),
    actualCredits: null,
    artifactKey: "cos/object/key/hidden.mp4",
    quality: {
      status: "manual_review_required",
      reasons: [],
      manualReviewReasons: ["identity_stability_requires_manual_review"],
      media: {
        durationSeconds: 8,
        width: 1080,
        height: 1920,
        hasAudio: false,
        decodable: true,
        sizeBytes: 1024,
        codec: "h264",
        evidence: {
          firstFramePath: "/tmp/first.jpg",
          actionFramePath: "/tmp/action.jpg",
          finalFramePath: "/tmp/last.jpg",
        },
      },
    },
    manualReview: {
      reviewerAccount: "internal-reviewer",
      reviewedAt: "2026-07-29T00:01:00.000Z",
      action: "approve",
      reason: "hidden internal reason",
    },
    saveAllowed: false,
    errorCode: null,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    ...overrides,
  };
}

function request(
  method: "GET" | "POST",
  body?: unknown,
  idempotencyKey = "first-presence-video-0001",
) {
  return new NextRequest(
    `https://memoryai.test/api/memories/${memoryId}/first-presence-video`,
    {
      method,
      headers: {
        origin: "https://memoryai.test",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(method === "POST" ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}

const context = (id = memoryId) => ({ params: Promise.resolve({ id }) });

test("POST accepts only session identity, header idempotency, and the two contracted intents", async () => {
  const calls: CreateOwnerVideoJobInput[] = [];
  const handler = createFirstPresenceVideoHandler(
    () => ({
      create: async (input) => {
        calls.push(input);
        return toFirstPresenceVideoSafeDto(job({ intent: input.intent }));
      },
      list: async () => [],
    }),
    async () => session,
  );
  const accepted = await handler.POST(
    request("POST", {
      intent: "initial_preview",
      externalUserId: "forged-client-user",
      idempotencyKey: "forged-body-key",
    }),
    context(),
  );
  assert.equal(accepted.status, 400);

  const preview = await handler.POST(
    request("POST", { intent: "initial_preview" }),
    context(),
  );
  assert.equal(preview.status, 202);
  const additional = await handler.POST(
    request("POST", { intent: "additional_generation" }, "first-presence-video-0002"),
    context(),
  );
  assert.equal(additional.status, 202);
  assert.deepEqual(
    calls.map((call) => ({
      externalUserId: call.externalUserId,
      memoryId: call.memoryId,
      idempotencyKey: call.idempotencyKey,
      intent: call.intent,
    })),
    [
      {
        externalUserId,
        memoryId,
        idempotencyKey: "first-presence-video-0001",
        intent: "initial_preview",
      },
      {
        externalUserId,
        memoryId,
        idempotencyKey: "first-presence-video-0002",
        intent: "additional_generation",
      },
    ],
  );
});

test("POST rejects unauthenticated, missing key, invalid body, and ownership or eligibility failures", async () => {
  const unauthenticated = createFirstPresenceVideoHandler(
    () => ({ create: async () => toFirstPresenceVideoSafeDto(job()), list: async () => [] }),
    async () => null,
  );
  assert.equal(
    (await unauthenticated.POST(request("POST", { intent: "initial_preview" }), context())).status,
    401,
  );

  const handler = createFirstPresenceVideoHandler(
    () => ({
      create: async (input) => {
        if (input.memoryId === "22222222-2222-4222-8222-222222222222") {
          throw new FirstPresenceVideoOwnerApiError("MEMORY_NOT_FOUND");
        }
        if (input.intent === "additional_generation") {
          throw new FirstPresenceVideoOwnerApiError("TWO_CHAT_ROUNDS_REQUIRED");
        }
        throw new FirstPresenceVideoOwnerApiError("PHOTO_PRECONDITION_REQUIRED");
      },
      list: async () => [],
    }),
    async () => session,
  );
  assert.equal(
    (await handler.POST(request("POST", { intent: "initial_preview" }, "bad"), context())).status,
    400,
  );
  assert.equal(
    (await handler.POST(request("POST", { intent: "initial_preview", extra: true }), context())).status,
    400,
  );
  assert.deepEqual(
    await (await handler.POST(request("POST", { intent: "initial_preview" }), context())).json(),
    { error: "PHOTO_PRECONDITION_REQUIRED" },
  );
  assert.equal(
    (await handler.POST(
      request("POST", { intent: "additional_generation" }),
      context(),
    )).status,
    409,
  );
  assert.equal(
    (await handler.POST(
      request("POST", { intent: "initial_preview" }),
      context("22222222-2222-4222-8222-222222222222"),
    )).status,
    404,
  );
});

test("video generation kill switch blocks queueing before a durable job is created", async () => {
  let createCalls = 0;
  const handler = createFirstPresenceVideoHandler(
    () => ({
      async create() { createCalls += 1; throw new Error("must not queue"); },
      async list() { return []; },
    }),
    async () => session,
    () => { throw new ProductCapabilityUnavailableError("VIDEO_GENERATION_DISABLED"); },
  );
  const response = await handler.POST(request("POST", { intent: "initial_preview" }), context());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "VIDEO_GENERATION_DISABLED" });
  assert.equal(createCalls, 0);
});

test("GET returns owner-scoped safe DTOs without provider, object, or internal review data", async () => {
  const handler = createFirstPresenceVideoHandler(
    () => ({
      create: async () => toFirstPresenceVideoSafeDto(job()),
      list: async (input) => {
        assert.equal(input.externalUserId, externalUserId);
        assert.equal(input.memoryId, memoryId);
        return [toFirstPresenceVideoSafeDto(job({ status: "manual_review_required" }))];
      },
    }),
    async () => session,
  );
  const response = await handler.GET(request("GET"), context());
  assert.equal(response.status, 200);
  const text = JSON.stringify(await response.json());
  assert.match(text, /manualReviewRequired/);
  assert.doesNotMatch(text, /provider-task-hidden|provider-state-hidden|cos\/object|inputSha256|actualCredits|quality|reviewerAccount|hidden internal reason/);
});

test("owner API service enqueues only newly-created durable jobs and replays duplicate idempotency", async () => {
  const queue: string[] = [];
  let created = true;
  const commands: OwnerVideoJobCommandPort = {
    createOrRecover: async (input) => {
      const current = job({ intent: input.intent });
      const result = { job: current, created };
      created = false;
      return result;
    },
  };
  const queries: OwnerVideoJobQueryPort = {
    listForOwner: async () => [],
  };
  const queuePort: OwnerVideoQueuePort = {
    enqueue: async ({ jobId }) => {
      queue.push(jobId);
    },
  };
  const service = new FirstPresenceVideoOwnerApiService(
    commands,
    queries,
    queuePort,
  );
  await service.create({
    externalUserId,
    memoryId,
    idempotencyKey: "first-presence-video-0001",
    intent: "initial_preview",
  });
  await service.create({
    externalUserId,
    memoryId,
    idempotencyKey: "first-presence-video-0001",
    intent: "initial_preview",
  });
  assert.deepEqual(queue, ["22222222-2222-4222-8222-222222222222"]);
});

test("formal owner route preserves session-only identity and persistent worker boundary", () => {
  const handlerSource = readFileSync(new URL("./_handler.ts", import.meta.url), "utf8");
  const ownerApiSource = readFileSync(
    new URL("../../../../../features/video/first-presence-video-owner-api.ts", import.meta.url),
    "utf8",
  );
  assert.match(handlerSource, /verifyRequestSession/);
  assert.match(handlerSource, /request\.headers\.get\("idempotency-key"\)/);
  assert.doesNotMatch(handlerSource, /compatibilityUserId|userId" in body|provider\.submit|ViduFirstPresenceProvider/);
  assert.match(ownerApiSource, /video_generation_jobs/);
  assert.match(ownerApiSource, /commerce_generation_reservations/);
  assert.match(ownerApiSource, /memory_chat_turns[\s\S]*status = 'completed'/);
  assert.match(ownerApiSource, /media_assets[\s\S]*qualityPreflight/);
  assert.match(ownerApiSource, /OwnerVideoInputStagingPort/);
  assert.match(ownerApiSource, /await inputStaging\.stage/);
  assert.match(ownerApiSource, /await inputStaging\.discard\(\{ jobId \}\)\.catch/);
  assert.match(ownerApiSource, /id, user_id, memory_id, reservation_id, idempotency_key, input_sha256/);
  assert.match(ownerApiSource, /OwnerVideoQueuePort/);
  assert.match(handlerSource, /createFirstPresenceVideoOwnerInputStaging/);
  assert.doesNotMatch(ownerApiSource, /ViduFirstPresenceProvider|provider\.submit|provider\.poll/);
});
