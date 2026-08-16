import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeCompanionMotionPlayback,
  companionMotionPackNeedsEnsure,
  companionMotionPackNeedsPolling,
  companionMotionPackReady,
  ensureCompanionMotionPack,
  ensureCompanionMotionPackOnce,
  loadCompanionMotionPack,
  normalizeCompanionMotionPack,
} from "./companionMotionClient";
import { resolveConversationMotionVariant, resolvePlayableMotionVariant } from "./companionMotionState";

const memoryId = "00000000-0000-4000-8000-000000000001";
const jobs = {
  idle: "00000000-0000-4000-8000-000000000011",
  attentive: "00000000-0000-4000-8000-000000000012",
  reflective: "00000000-0000-4000-8000-000000000013",
};

test("companion motion DTO is strict, distinct by variant, and needs all three approved artifacts", () => {
  const pack = normalizeCompanionMotionPack({
    eligible: true,
    slots: [
      { variant: "idle", status: "succeeded", jobId: jobs.idle, artifactAvailable: true },
      { variant: "attentive", status: "running", jobId: jobs.attentive, artifactAvailable: false },
      { variant: "reflective", status: "succeeded", jobId: jobs.reflective, artifactAvailable: true },
    ],
  });
  assert.ok(pack);
  assert.equal(pack.slots.length, 3);
  assert.equal(companionMotionPackReady(pack), false);
  assert.equal(companionMotionPackNeedsEnsure(pack), false);
  assert.equal(companionMotionPackNeedsPolling(pack), true);
  assert.equal(companionMotionPackNeedsPolling({
    eligible: true,
    slots: [{ variant: "idle", status: "submission_uncertain", jobId: jobs.idle, artifactAvailable: false }],
  }), false);
  assert.equal(companionMotionPackNeedsEnsure({ eligible: false, slots: [] }), false);
  assert.equal(companionMotionPackNeedsEnsure({
    eligible: true,
    slots: [
      { variant: "idle", status: "succeeded", jobId: jobs.idle, artifactAvailable: true },
      { variant: "attentive", status: "succeeded", jobId: jobs.attentive, artifactAvailable: true },
      { variant: "reflective", status: "succeeded", jobId: jobs.reflective, artifactAvailable: true },
    ],
  }), false);
  assert.equal(normalizeCompanionMotionPack({ eligible: "yes", slots: [] }), null);
  assert.equal(normalizeCompanionMotionPack({
    eligible: true,
    slots: [{ variant: "visitor-demo", status: "succeeded", jobId: jobs.idle, artifactAvailable: true }],
  }), null);
  assert.equal(normalizeCompanionMotionPack({
    eligible: true,
    slots: [{ variant: "idle", status: "running", jobId: jobs.idle, artifactAvailable: true }],
  }), null);
  const acknowledgement = normalizeCompanionMotionPack({
    eligible: true,
    slots: [{ variant: "acknowledgement", status: "manual_review_required", jobId: jobs.idle, artifactAvailable: false }],
  });
  assert.ok(acknowledgement, "the additive one-shot slot is readable without making a legacy three-slot pack incomplete");
});

test("GET and POST use only the owner-scoped companion pack endpoint and empty POST body", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const request = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return Response.json({ eligible: false, slots: [] });
  };
  await loadCompanionMotionPack(memoryId, undefined, request as typeof fetch);
  await ensureCompanionMotionPack(memoryId, undefined, request as typeof fetch);
  assert.deepEqual(calls.map((call) => [call.input, call.init?.method]), [
    [`/api/memories/${memoryId}/companion-motion`, "GET"],
    [`/api/memories/${memoryId}/companion-motion`, "POST"],
  ]);
  assert.equal(calls[1].init?.credentials, "same-origin");
  assert.equal(calls[1].init?.body, "{}");
});

test("concurrent mounts coalesce the one missing-pack POST while later GET remains the source of reuse", async () => {
  const onceMemoryId = "00000000-0000-4000-8000-000000000099";
  let postCalls = 0;
  const request = (async () => {
    postCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json({ eligible: true, slots: [] }, { status: 202 });
  }) as typeof fetch;
  const first = ensureCompanionMotionPackOnce(onceMemoryId, request);
  const second = ensureCompanionMotionPackOnce(onceMemoryId, request);
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(postCalls, 1);
});

test("playback accepts only the existing owner-authorized first-presence route", async () => {
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const validRequest = (async () => Response.json({
    playback: { url: "/api/first-presence-video/playback/signed.token", expiresAt },
  })) as typeof fetch;
  const valid = await authorizeCompanionMotionPlayback(memoryId, jobs.idle, undefined, validRequest);
  assert.deepEqual(valid, { url: "/api/first-presence-video/playback/signed.token?rendition=mobile", expiresAt });
  await assert.rejects(
    authorizeCompanionMotionPlayback(memoryId, jobs.idle, undefined, (async () => Response.json({
      playback: { url: "https://provider.example/raw.mp4", expiresAt },
    })) as typeof fetch),
    /COMPANION_MOTION_PLAYBACK_INVALID/,
  );
  await assert.rejects(
    authorizeCompanionMotionPlayback(memoryId, jobs.idle, undefined, (async () => Response.json({
      playback: {
        url: "/api/first-presence-video/playback/signed.token",
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      },
    })) as typeof fetch),
    /COMPANION_MOTION_PLAYBACK_INVALID/,
  );
});

test("chat maps typing to attentive, in-flight requests to reflective, then idle", () => {
  assert.equal(resolveConversationMotionVariant({ phase: "ready", draft: "", hasPendingMessage: false }), "idle");
  assert.equal(resolveConversationMotionVariant({ phase: "ready", draft: "一件小事", hasPendingMessage: false }), "attentive");
  assert.equal(resolveConversationMotionVariant({ phase: "sending", draft: "", hasPendingMessage: true }), "reflective");
  assert.equal(resolveConversationMotionVariant({ phase: "replying", draft: "", hasPendingMessage: true }), "reflective");
  assert.equal(resolveConversationMotionVariant({ phase: "ready", draft: "", hasPendingMessage: true }), "reflective");
  assert.equal(resolveConversationMotionVariant({ phase: "recovering", draft: "", hasPendingMessage: true }), "reflective");
  assert.equal(resolveConversationMotionVariant({ phase: "greeting", draft: "", hasPendingMessage: false }), "reflective");
  assert.equal(resolveConversationMotionVariant({ phase: "error", draft: "", hasPendingMessage: true }), "idle");
});

test("a missing active variant falls back to idle, then to the static portrait", () => {
  assert.equal(resolvePlayableMotionVariant("attentive", new Set(["idle"])), "idle");
  assert.equal(resolvePlayableMotionVariant("reflective", new Set()), null);
  assert.equal(resolvePlayableMotionVariant("reflective", new Set(["reflective"])), "reflective");
});
