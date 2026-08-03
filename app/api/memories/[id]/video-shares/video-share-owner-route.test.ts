import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createOwnerVideoShareHandler } from "./_handler";
import { createOwnerVideoShareRevokeHandler } from "./[publicId]/_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
const memoryId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const publicId = "00000000-0000-4000-8000-000000000003";
const session = async () => ({ userId: "00000000-0000-4000-8000-000000000099", externalUserId: "owner", expiresAt: "2026-08-05T00:00:00.000Z" });
const createRequest = (body: unknown, origin = "https://memoryai.test") => new NextRequest(`https://memoryai.test/api/memories/${memoryId}/video-shares`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });

test("owner creates a share only through the exact Session and Origin-bound request", async () => {
  const calls: unknown[] = [];
  const handler = createOwnerVideoShareHandler({ async createForOwner(input) { calls.push(input); return { publicId, title: "想念", jobId, memoryId, revokedAt: null, watermarkDownloadEnabled: false as const }; } }, session);
  const response = await handler.POST(createRequest({ jobId, title: " 想念 " }), { params: Promise.resolve({ id: memoryId }) });
  assert.equal(response.status, 201);
  assert.deepEqual(calls, [{ externalUserId: "owner", memoryId, jobId, title: " 想念 " }]);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.share).sort(), ["jobId", "memoryId", "publicId", "revokedAt", "title", "watermarkDownloadEnabled"]);
  assert.doesNotMatch(JSON.stringify(body), /artifact|storage|provider/i);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("owner create rejects no-session, forged origin and altered payload without a write", async () => {
  let writes = 0;
  const shares = { async createForOwner() { writes += 1; throw new Error("must not run"); } };
  const noSession = createOwnerVideoShareHandler(shares, async () => null);
  assert.equal((await noSession.POST(createRequest({ jobId, title: "想念" }), { params: Promise.resolve({ id: memoryId }) })).status, 401);
  const handler = createOwnerVideoShareHandler(shares, session);
  assert.equal((await handler.POST(createRequest({ jobId, title: "想念" }, "https://attacker.test"), { params: Promise.resolve({ id: memoryId }) })).status, 403);
  assert.equal((await handler.POST(createRequest({ jobId, title: "想念", extra: true }), { params: Promise.resolve({ id: memoryId }) })).status, 400);
  assert.equal(writes, 0);
});

test("revocation is owner-scoped, origin-bound and idempotent at the data boundary", async () => {
  const calls: unknown[] = [];
  const handler = createOwnerVideoShareRevokeHandler({ async revokeForOwner(input) { calls.push(input); return true; } }, session);
  const response = await handler.DELETE(new NextRequest(`https://memoryai.test/api/memories/${memoryId}/video-shares/${publicId}`, { method: "DELETE", headers: { origin: "https://memoryai.test" } }), { params: Promise.resolve({ id: memoryId, publicId }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { revoked: true });
  assert.deepEqual(calls, [{ externalUserId: "owner", memoryId, publicId }]);
});
