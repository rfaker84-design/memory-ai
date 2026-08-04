import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createOwnerWatermarkedVideoDownloadHandler } from "./_handler";

const memoryId = "00000000-0000-4000-8000-000000000001";
const publicId = "00000000-0000-4000-8000-000000000003";
const session = async () => ({ userId: "00000000-0000-4000-8000-000000000099", externalUserId: "owner", expiresAt: "2026-08-05T00:00:00.000Z" });
const context = { params: Promise.resolve({ id: memoryId, publicId }) };

test("Owner watermarked download is session-bound, private, and returns no storage identifiers", async () => {
  const calls: unknown[] = [];
  const handler = createOwnerWatermarkedVideoDownloadHandler(() => ({ async prepare(value) { calls.push(value); return { body: Buffer.from("video"), fileName: `memoryai-watermarked-${publicId}.mp4` }; } }), session);
  const response = await handler.GET(new NextRequest(`https://memoryai.test/api/memories/${memoryId}/video-shares/${publicId}/download`), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.match(response.headers.get("content-disposition") ?? "", /^attachment; filename=memoryai-watermarked-/);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal((await response.text()), "video");
  assert.deepEqual(calls, [{ externalUserId: "owner", memoryId, publicId }]);
  assert.doesNotMatch(JSON.stringify([...response.headers]), /artifact|storage|provider/i);
});

test("Owner watermarked download rejects an old session and query injection before preparation", async () => {
  let prepared = 0;
  const handler = createOwnerWatermarkedVideoDownloadHandler(() => ({ async prepare() { prepared += 1; return { body: Buffer.from("video"), fileName: "video.mp4" }; } }), async () => null);
  assert.equal((await handler.GET(new NextRequest(`https://memoryai.test/api/memories/${memoryId}/video-shares/${publicId}/download`), context)).status, 401);
  const authenticated = createOwnerWatermarkedVideoDownloadHandler(() => ({ async prepare() { prepared += 1; return { body: Buffer.from("video"), fileName: "video.mp4" }; } }), session);
  assert.equal((await authenticated.GET(new NextRequest(`https://memoryai.test/api/memories/${memoryId}/video-shares/${publicId}/download?artifactKey=forged`), context)).status, 400);
  assert.equal(prepared, 0);
});
