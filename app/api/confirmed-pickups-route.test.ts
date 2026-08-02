import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createConfirmedPickupHandlers } from "./memories/[id]/pickups/_handlers";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const memoryId = "00000000-0000-4000-8000-000000000001";
const pickupId = "00000000-0000-4000-8000-000000000002";
const requestKey = "pickup-confirm-0001";
const session = async () => ({
  userId: "00000000-0000-4000-8000-000000000003",
  externalUserId: "phone:13800138000",
  authenticatedAt: new Date().toISOString(),
  expiresAt: "2026-08-03T00:00:00.000Z",
});
const collection = { params: Promise.resolve({ id: memoryId }) };
const item = { params: Promise.resolve({ id: memoryId, pickupId }) };

function request(method: string, body?: unknown, key?: string) {
  return new NextRequest(`https://memoryai.test/api/memories/${memoryId}/pickups`, {
    method,
    headers: {
      origin: "https://memoryai.test",
      "content-type": "application/json",
      ...(key ? { "idempotency-key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const pickup = {
  id: pickupId,
  memoryId,
  requestKey,
  originalText: "小时候她会在雨天接我放学。",
  organizedText: "一段关于雨天接送的已确认回忆。",
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

test("pickup confirmation is Owner-bound, explicit, origin-guarded and idempotency-keyed", async () => {
  let received: unknown;
  const handlers = createConfirmedPickupHandlers(() => ({
    async confirm(input) { received = input; return pickup; },
    async list() { return []; },
    async update() { return pickup; },
    async delete() {},
  }), session);

  const missingConfirmation = await handlers.POST(request("POST", { originalText: pickup.originalText, organizedText: pickup.organizedText, confirmed: false }, requestKey), collection);
  assert.equal(missingConfirmation.status, 400);
  assert.equal(received, undefined);

  const accepted = await handlers.POST(request("POST", { originalText: pickup.originalText, organizedText: pickup.organizedText, confirmed: true }, requestKey), collection);
  assert.equal(accepted.status, 201);
  assert.deepEqual(await accepted.json(), { pickup });
  assert.deepEqual(received, {
    externalUserId: "phone:13800138000",
    memoryId,
    requestKey,
    originalText: pickup.originalText,
    organizedText: pickup.organizedText,
  });
});

test("pickup list, edit and delete never accept a caller-supplied Owner", async () => {
  let listed: unknown;
  let updated: unknown;
  let deleted: unknown;
  const handlers = createConfirmedPickupHandlers(() => ({
    async confirm() { return pickup; },
    async list(input) { listed = input; return [pickup]; },
    async update(input) { updated = input; return pickup; },
    async delete(input) { deleted = input; },
  }), session);

  const list = await handlers.GET(request("GET"), collection);
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), { pickups: [pickup] });
  assert.deepEqual(listed, { externalUserId: "phone:13800138000", memoryId });

  const edit = await handlers.PATCH(request("PATCH", { originalText: "修订原话", organizedText: "修订整理稿", userId: "forged" }), item);
  assert.equal(edit.status, 400);
  assert.equal(updated, undefined);

  const edited = await handlers.PATCH(request("PATCH", { originalText: "修订原话", organizedText: "修订整理稿" }), item);
  assert.equal(edited.status, 200);
  assert.deepEqual(updated, { externalUserId: "phone:13800138000", memoryId, pickupId, originalText: "修订原话", organizedText: "修订整理稿" });

  const removed = await handlers.DELETE(request("DELETE"), item);
  assert.equal(removed.status, 204);
  assert.deepEqual(deleted, { externalUserId: "phone:13800138000", memoryId, pickupId });
});
