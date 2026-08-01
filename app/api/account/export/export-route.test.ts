import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createAccountDataExportHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
process.env.ACCOUNT_DATA_EXPORT_ENABLED = "true";
process.env.AUTH_SESSION_REVOCATION_ENFORCED = "true";

const exportBody = {
  schemaVersion: "memoryai-account-data-export-v1" as const,
  generatedAt: "2026-08-02T00:00:00.000Z",
  account: { id: "00000000-0000-4000-8000-000000000001", createdAt: "2026-08-01T00:00:00.000Z" },
  memories: [], memoryFragments: [], conversations: [], messages: [], firstGreetings: [], media: [], videoJobs: [], consents: [], payments: [], refunds: [], notices: [],
};

const freshSession = async () => ({
  userId: "00000000-0000-4000-8000-000000000001",
  externalUserId: "phone:13800138000",
  authenticatedAt: new Date().toISOString(),
  expiresAt: "2026-08-02T01:00:00.000Z",
});

const request = () => new NextRequest("https://memoryai.test/api/account/export", { method: "POST", headers: { origin: "https://memoryai.test" } });

test("data export requires the currently authenticated Owner, same-origin request, and five-minute reauthentication", async () => {
  const handler = createAccountDataExportHandler({ create: async () => exportBody }, async () => null);
  assert.equal((await handler.POST(request())).status, 401);

  const stale = createAccountDataExportHandler({ create: async () => exportBody }, async () => ({ ...(await freshSession()), authenticatedAt: new Date(Date.now() - 5 * 60 * 1000 - 1).toISOString() }));
  assert.equal((await stale.POST(request())).status, 403);
});

test("data export is a private attachment and only invokes the server-bound Owner export", async () => {
  let received: unknown;
  const handler = createAccountDataExportHandler({
    create: async (input) => { received = input; return exportBody; },
  }, freshSession);
  const response = await handler.POST(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename=memoryai-account-data-export\.json/);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.deepEqual(received, { userId: "00000000-0000-4000-8000-000000000001", externalUserId: "phone:13800138000" });
  assert.deepEqual(await response.json(), exportBody);
});
