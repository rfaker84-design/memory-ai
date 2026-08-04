import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createInitialEncounterPlaybackHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const memoryId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const context = { params: Promise.resolve({ id: memoryId, jobId }) };
const session = async () => ({ externalUserId: "owner-a" } as never);
const request = () => new NextRequest(`https://memoryai.test/api/memories/${memoryId}/first-presence-video/${jobId}/encounter-playback`, { method: "POST", headers: { origin: "https://memoryai.test" } });

test("initial encounter claim is session-bound, origin-protected, and never returns a second playback URL", async () => {
  let received: unknown;
  const handler = createInitialEncounterPlaybackHandler(
    () => ({ claim: async (input) => { received = input; return { status: "claimed" as const, playback: { url: "/controlled", expiresAt: "2026-08-04T00:00:00.000Z", contentDisposition: "inline" as const, saveAllowed: false } }; } }),
    session,
  );
  const response = await handler.POST(request(), context);
  assert.equal(response.status, 200);
  assert.deepEqual(received, { externalUserId: "owner-a", memoryId, jobId });
  assert.deepEqual(await response.json(), { encounter: { status: "claimed", playback: { url: "/controlled", expiresAt: "2026-08-04T00:00:00.000Z", contentDisposition: "inline", saveAllowed: false } } });

  const replay = createInitialEncounterPlaybackHandler(() => ({ claim: async () => ({ status: "already_viewed" as const }) }), session);
  assert.deepEqual(await (await replay.POST(request(), context)).json(), { encounter: { status: "already_viewed" } });
});

test("initial encounter claim rejects unauthenticated, cross-origin, and body-bearing requests", async () => {
  const unavailable = createInitialEncounterPlaybackHandler(() => ({ claim: async () => ({ status: "already_viewed" as const }) }), async () => null);
  assert.equal((await unavailable.POST(request(), context)).status, 401);
  const handler = createInitialEncounterPlaybackHandler(() => ({ claim: async () => ({ status: "already_viewed" as const }) }), session);
  const cross = new NextRequest("https://memoryai.test/api/memories/x/first-presence-video/y/encounter-playback", { method: "POST", headers: { origin: "https://attacker.test" } });
  assert.equal((await handler.POST(cross, context)).status, 403);
  const body = new NextRequest("https://memoryai.test/api/memories/x/first-presence-video/y/encounter-playback", { method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json" }, body: "{}" });
  assert.equal((await handler.POST(body, context)).status, 400);
});
