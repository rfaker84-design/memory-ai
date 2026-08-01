import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createReportsHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
const session = async () => ({ userId: "00000000-0000-4000-8000-000000000001", externalUserId: "phone:13800138000", expiresAt: "2026-12-31T00:00:00.000Z" });
const body = { category: "rights", subjectType: "other", subjectId: null, requestedAction: "review", details: "Please review this rights concern." };
const request = (headers: Record<string, string> = {}, value: unknown = body) => new NextRequest("https://memoryai.test/api/reports", { method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": "report-1234567890abcdef", ...headers }, body: JSON.stringify(value) });

test("creates a session-bound report without accepting client identity", async () => {
  let received: unknown;
  const handler = createReportsHandler({ create: async (input) => { received = input; return { id: "r1", category: "rights", subjectType: "other", subjectId: null, requestedAction: "review", status: "received", createdAt: "2026-08-02T00:00:00.000Z", resolvedAt: null }; }, list: async () => [] }, session);
  const response = await handler.POST(request());
  assert.equal(response.status, 201);
  assert.equal((received as { userId: string }).userId, "00000000-0000-4000-8000-000000000001");
  assert.equal((await response.json() as { report: { status: string } }).report.status, "received");
});

test("rejects forged identity, invalid subject combinations, and malformed idempotency", async () => {
  const handler = createReportsHandler({ create: async () => { throw new Error("must not write"); }, list: async () => [] }, session);
  assert.equal((await handler.POST(request({}, { ...body, userId: "forged" }))).status, 400);
  assert.equal((await handler.POST(request({}, { ...body, subjectType: "memory", subjectId: null }))).status, 400);
  assert.equal((await handler.POST(request({ "idempotency-key": "short" }))).status, 400);
});

test("only exposes the current session's report list", async () => {
  let received: unknown;
  const handler = createReportsHandler({ create: async () => { throw new Error("unused"); }, list: async (input) => { received = input; return []; } }, session);
  const response = await handler.GET(new NextRequest("https://memoryai.test/api/reports"));
  assert.equal(response.status, 200); assert.equal((received as { externalUserId: string }).externalUserId, "phone:13800138000");
});
