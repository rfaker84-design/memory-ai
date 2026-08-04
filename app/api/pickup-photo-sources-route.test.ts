import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createPickupPhotoSourceHandlers } from "./memories/[id]/pickup-photo-sources/_handlers";

const memoryId = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id: memoryId }) };
const session = async () => ({
  userId: "00000000-0000-4000-8000-000000000003",
  externalUserId: "phone:13800138000",
  authenticatedAt: new Date().toISOString(),
  expiresAt: "2026-08-05T00:00:00.000Z",
});

test("pickup photo sources are session-owner scoped and expose only the selection DTO", async () => {
  let received: unknown;
  const photo = {
    id: "00000000-0000-4000-8000-000000000004",
    mimeType: "image/jpeg",
    sizeBytes: 1234,
    createdAt: "2026-08-04T00:00:00.000Z",
  };
  const handlers = createPickupPhotoSourceHandlers(() => ({
    async list(input) { received = input; return [photo]; },
  }), session);

  const response = await handlers.GET(
    new NextRequest(`https://memoryai.test/api/memories/${memoryId}/pickup-photo-sources?userId=forged`),
    context,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { photos: [photo] });
  assert.deepEqual(received, { externalUserId: "phone:13800138000", memoryId });
  assert.match(response.headers.get("cache-control") ?? "", /(?:^|,\s*)no-store(?:,|$)/);
});
