import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createGuardianDeletionConfirmationHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
process.env.ACCOUNT_DELETION_ENABLED = "true";
process.env.AUTH_SESSION_REVOCATION_ENFORCED = "true";

const guardianSession = async () => ({ userId: "00000000-0000-4000-8000-000000000002", externalUserId: "guardian:verified", authenticatedAt: new Date().toISOString(), expiresAt: "2026-08-02T00:00:00.000Z" });
const request = (body: unknown) => new NextRequest("https://memoryai.test/api/account/deletion/guardian-confirmation", { method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json" }, body: JSON.stringify(body) });

test("guardian confirmation requires a fresh guardian session, explicit confirmation and server-bound dependent identity", async () => {
  let received: unknown;
  const handler = createGuardianDeletionConfirmationHandler({ confirmGuardian: async (input) => { received = input; } }, guardianSession);
  const response = await handler.POST(request({ confirmation: "CONFIRM_GUARDIAN_ACCOUNT_DELETION", dependentUserId: "00000000-0000-4000-8000-000000000001" }));
  assert.equal(response.status, 202);
  assert.deepEqual(received, { dependentUserId: "00000000-0000-4000-8000-000000000001", guardianUserId: "00000000-0000-4000-8000-000000000002", guardianExternalUserId: "guardian:verified" });
  assert.equal((await handler.POST(request({ confirmation: "CONFIRM_GUARDIAN_ACCOUNT_DELETION", dependentUserId: "not-a-uuid" }))).status, 400);
});
