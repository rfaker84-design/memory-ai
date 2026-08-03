import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { ACCOUNT_DELETION_CONFIRMATION, type AccountDeletionProgress } from "@/features/account-deletion/account-deletion-service";
import { createAccountDeletionHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
process.env.ACCOUNT_DELETION_ENABLED = "true";
process.env.AUTH_SESSION_REVOCATION_ENFORCED = "true";

const progress: AccountDeletionProgress = {
  requestId: "00000000-0000-4000-8000-000000000001",
  status: "requested",
  requestedAt: "2026-08-01T00:00:00.000Z",
  contentDeleteAfter: "2026-08-08T00:00:00.000Z",
  providerDeleteAfter: "2026-08-31T00:00:00.000Z",
  backupExpireAfter: "2026-10-30T00:00:00.000Z",
  legalHold: false,
  completedAt: null,
  tasks: [],
};

const freshSession = async () => ({
  userId: "00000000-0000-4000-8000-000000000001",
  externalUserId: "phone:13800138000",
  authenticatedAt: new Date().toISOString(),
  expiresAt: "2026-08-01T01:00:00.000Z",
});

function request(method: "GET" | "POST", body?: unknown) {
  return new NextRequest("https://memoryai.test/api/account/deletion", {
    method,
    headers: method === "POST" ? { origin: "https://memoryai.test", "content-type": "application/json" } : undefined,
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

test("requires a five-minute reauthentication and an explicit deletion confirmation", async () => {
  const handler = createAccountDeletionHandler({ request: async () => progress, getProgress: async () => progress, getProgressByReceipt: async () => progress }, async () => ({
    ...(await freshSession()), authenticatedAt: new Date(Date.now() - 5 * 60 * 1000 - 1).toISOString(),
  }));
  assert.equal((await handler.POST(request("POST", { confirmation: ACCOUNT_DELETION_CONFIRMATION }))).status, 403);
  const malformed = createAccountDeletionHandler({ request: async () => progress, getProgress: async () => progress, getProgressByReceipt: async () => progress }, freshSession);
  assert.equal((await malformed.POST(request("POST", { confirmation: "DELETE" }))).status, 400);
});

test("commits the server-bound account request and clears the current session cookie", async () => {
  let received: unknown;
  const handler = createAccountDeletionHandler({
    request: async (input) => { received = input; return progress; },
    getProgress: async () => progress,
    getProgressByReceipt: async () => progress,
  }, freshSession);
  const response = await handler.POST(request("POST", { confirmation: ACCOUNT_DELETION_CONFIRMATION }));
  assert.equal(response.status, 202);
  assert.deepEqual(received && { userId: (received as { userId: string }).userId, externalUserId: (received as { externalUserId: string }).externalUserId }, { userId: "00000000-0000-4000-8000-000000000001", externalUserId: "phone:13800138000" });
  assert.match(response.headers.get("set-cookie") ?? "", /memoryai_session=;/);
  assert.match(response.headers.get("set-cookie") ?? "", /memoryai_deletion_receipt=/);
  assert.deepEqual(await response.json(), { deletion: progress });
});

test("returns deletion progress to either the account or its opaque receipt cookie", async () => {
  let receiptCalls = 0;
  const handler = createAccountDeletionHandler({ request: async () => progress, getProgress: async () => progress, getProgressByReceipt: async () => { receiptCalls += 1; return progress; } }, freshSession);
  const response = await handler.GET(request("GET"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deletion: progress });
  const receiptRequest = new NextRequest("https://memoryai.test/api/account/deletion", { headers: { cookie: "memoryai_deletion_receipt=" + "a".repeat(43) } });
  const receiptResponse = await createAccountDeletionHandler({ request: async () => progress, getProgress: async () => progress, getProgressByReceipt: async () => { receiptCalls += 1; return progress; } }, async () => null).GET(receiptRequest);
  assert.equal(receiptResponse.status, 200);
  assert.equal(receiptCalls, 1);
});

test("pre-issues a receipt cookie and binds the deletion request to it", async () => {
  let receivedReceipt: string | null = null;
  const handler = createAccountDeletionHandler({
    request: async (input) => { receivedReceipt = input.receiptToken; return progress; },
    getProgress: async () => null,
    getProgressByReceipt: async () => progress,
  }, freshSession);
  const status = await handler.GET(request("GET"));
  const cookie = status.headers.get("set-cookie") ?? "";
  const receipt = /memoryai_deletion_receipt=([A-Za-z0-9_-]{43})/.exec(cookie)?.[1];
  assert.ok(receipt);
  const response = await handler.POST(new NextRequest("https://memoryai.test/api/account/deletion", {
    method: "POST",
    headers: { origin: "https://memoryai.test", "content-type": "application/json", cookie: `memoryai_deletion_receipt=${receipt}` },
    body: JSON.stringify({ confirmation: ACCOUNT_DELETION_CONFIRMATION }),
  }));
  assert.equal(response.status, 202);
  assert.equal(receivedReceipt, receipt);
  const recovered = await createAccountDeletionHandler({ request: async () => progress, getProgress: async () => null, getProgressByReceipt: async (token) => token === receipt ? progress : null }, async () => null).GET(
    new NextRequest("https://memoryai.test/api/account/deletion", { headers: { cookie: `memoryai_deletion_receipt=${receipt}` } }),
  );
  assert.deepEqual(await recovered.json(), { deletion: progress });
});
