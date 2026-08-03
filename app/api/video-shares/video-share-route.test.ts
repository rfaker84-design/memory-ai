import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createPublicVideoShareHandler } from "./[publicId]/_handler";
import { createPublicVideoSharePlaybackHandler } from "./[publicId]/playback/_handler";

const publicId = "00000000-0000-4000-8000-000000000001";
const active = { publicId, title: "想念", jobId: "00000000-0000-4000-8000-000000000002", memoryId: "00000000-0000-4000-8000-000000000003", artifactKey: "private/approved.mp4" };
const context = { params: Promise.resolve({ publicId }) };

class Shares { constructor(private readonly value: typeof active | null = active) {} async findActivePublic(id: string) { return id === publicId ? this.value : null; } }
class Reader { async readRange(input: { artifactKey: string; start?: number; end?: number }) { assert.equal(input.artifactKey, active.artifactKey); const all = Buffer.from("0123456789"); const start = input.start ?? 0; const end = input.end ?? 9; return { body: all.subarray(start, end + 1), contentType: "video/mp4", totalBytes: 10 }; } }

test("public metadata is noindex, no-store and excludes any internal media capability", async () => {
  const handler = createPublicVideoShareHandler(new Shares());
  const response = await handler.GET(new NextRequest(`https://memoryai.test/api/video-shares/${publicId}`), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  const body = await response.json();
  assert.deepEqual(body, { share: { id: publicId, title: "想念", aiGenerated: true, viewOnly: true } });
  assert.doesNotMatch(JSON.stringify(body), /artifact|storage|provider/i);
});

test("public playback rechecks an active share on every range request and stays inline", async () => {
  const handler = createPublicVideoSharePlaybackHandler(() => ({ shares: new Shares(), reader: new Reader() }));
  const response = await handler.GET(new NextRequest(`https://memoryai.test/api/video-shares/${publicId}/playback`, { headers: { range: "bytes=2-5" } }), context);
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "2345");
  assert.match(response.headers.get("content-disposition") ?? "", /^inline/);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.equal(response.headers.get("x-ai-generated-content"), "true");
});

test("revoked or unknown public links are uniformly unreadable", async () => {
  const metadata = createPublicVideoShareHandler(new Shares(null));
  const playback = createPublicVideoSharePlaybackHandler(() => ({ shares: new Shares(null), reader: new Reader() }));
  assert.equal((await metadata.GET(new NextRequest(`https://memoryai.test/api/video-shares/${publicId}`), context)).status, 404);
  assert.equal((await playback.GET(new NextRequest(`https://memoryai.test/api/video-shares/${publicId}/playback`), context)).status, 404);
});
