import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createAccountDeletionHandler } from "../deletion/_handler";
import { createAccountDataExportHandler } from "../export/_handler";
import { createCommerceOrdersHandler } from "../../commerce/orders/_handler";
import { createCommerceRefundsHandler } from "../../commerce/refunds/_handler";
import { createConsentsHandler } from "../../consents/_handler";
import { createMemoryItemHandlers, MEMORY_DELETION_CONFIRMATION } from "../../memories/[id]/_handlers";
import { createOwnerVideoShareHandler } from "../../memories/[id]/video-shares/_handler";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/features/account-deletion/account-deletion-service";
import { UnderstandingAssistanceError } from "@/features/understanding-assistance/understanding-assistance-postgres";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
process.env.ACCOUNT_DATA_EXPORT_ENABLED = "true";
process.env.ACCOUNT_DELETION_ENABLED = "true";
process.env.AUTH_SESSION_REVOCATION_ENFORCED = "true";

const userId = "00000000-0000-4000-8000-000000000001";
const memoryId = "00000000-0000-4000-8000-000000000002";
const session = async () => ({ userId, externalUserId: "phone:assistance-owner", authenticatedAt: new Date().toISOString(), expiresAt: "2026-12-31T00:00:00.000Z" });
const blockedGuard = { assertHighRiskAllowed: async () => { throw new UnderstandingAssistanceError("UNDERSTANDING_ASSISTANCE_REQUIRED"); } };
const guardianGuard = { assertHighRiskAllowed: async () => { throw new UnderstandingAssistanceError("GUARDIAN_CONFIRMATION_REQUIRED"); } };
const origin = { origin: "https://memoryai.test", "content-type": "application/json" };

test("assistance status fail-closes every implemented high-risk operation before a write", async () => {
  let writes = 0;
  const order = createCommerceOrdersHandler(
    () => ({ createOrder: async () => { writes += 1; throw new Error("not reached"); }, listOrders: async () => [] }),
    session,
    () => ({ rail: "test", prepareCheckout: async () => ({ kind: "test_callback_required", orderNo: "YC20260727000000AAAAAAAAAAA1", chargesMoney: false }) }),
    () => undefined,
    async () => true,
    blockedGuard,
  );
  const orderResponse = await order.POST(new NextRequest("https://memoryai.test/api/commerce/orders", { method: "POST", headers: { ...origin, "idempotency-key": "understanding-order-0001" }, body: JSON.stringify({ memoryId, productId: "memory_video_49", platform: "web" }) }));
  assert.equal(orderResponse.status, 409);
  assert.deepEqual((await orderResponse.json()).actions, ["EXPLAIN_AGAIN", "DO_NOT_PROCEED", "TRUSTED_PERSON_ASSISTANCE"]);

  const refund = createCommerceRefundsHandler(
    () => ({ requestRefund: async () => { writes += 1; throw new Error("not reached"); }, listRefunds: async () => [] }),
    session,
    blockedGuard,
  );
  assert.equal((await refund.POST(new NextRequest("https://memoryai.test/api/commerce/refunds", { method: "POST", headers: { ...origin, "idempotency-key": "understanding-refund-0001" }, body: JSON.stringify({ orderNo: "YC20260727000000AAAAAAAAAAA1", reason: "service_failure" }) }))).status, 409);

  const exporter = createAccountDataExportHandler({ create: async () => { writes += 1; throw new Error("not reached"); } }, session, blockedGuard);
  assert.equal((await exporter.POST(new NextRequest("https://memoryai.test/api/account/export", { method: "POST", headers: origin }))).status, 409);

  const deletion = createAccountDeletionHandler({ request: async () => { writes += 1; throw new Error("not reached"); }, getProgress: async () => null, getProgressByReceipt: async () => null }, session, blockedGuard);
  assert.equal((await deletion.POST(new NextRequest("https://memoryai.test/api/account/deletion", { method: "POST", headers: origin, body: JSON.stringify({ confirmation: ACCOUNT_DELETION_CONFIRMATION }) }))).status, 409);

  const memory = createMemoryItemHandlers(
    () => ({ getMemoryForUser: async () => null, updateMemoryForUser: async () => { throw new Error("not reached"); }, deleteMemoryForUser: async () => { writes += 1; } }),
    session,
    blockedGuard,
  );
  assert.equal((await memory.DELETE(new NextRequest(`https://memoryai.test/api/memories/${memoryId}`, { method: "DELETE", headers: origin, body: JSON.stringify({ confirmation: MEMORY_DELETION_CONFIRMATION }) }), { params: Promise.resolve({ id: memoryId }) })).status, 409);

  const shares = createOwnerVideoShareHandler({ listForOwner: async () => [], createForOwner: async () => { writes += 1; throw new Error("not reached"); } }, session, blockedGuard);
  assert.equal((await shares.POST(new NextRequest(`https://memoryai.test/api/memories/${memoryId}/video-shares`, { method: "POST", headers: origin, body: JSON.stringify({ jobId: "00000000-0000-4000-8000-000000000003", title: "test" }) }), { params: Promise.resolve({ id: memoryId }) })).status, 409);

  const consent = createConsentsHandler(async () => { writes += 1; }, session, blockedGuard);
  assert.equal((await consent(new NextRequest("https://memoryai.test/api/consents", { method: "POST", headers: { ...origin, "idempotency-key": "understanding-consent-0001" }, body: JSON.stringify({ consentType: "commercial_use", memoryId }) }))).status, 409);
  assert.equal(writes, 0);
});

test("existing guardian confirmation contract is reused and crisis authorization remains a separate safety path", async () => {
  const exporter = createAccountDataExportHandler({ create: async () => { throw new Error("not reached"); } }, session, guardianGuard);
  const guardianRequired = await exporter.POST(new NextRequest("https://memoryai.test/api/account/export", { method: "POST", headers: origin }));
  assert.deepEqual(await guardianRequired.json(), { error: "GUARDIAN_CONFIRMATION_REQUIRED" });

  let crisisWrites = 0;
  const crisis = createConsentsHandler(async () => { crisisWrites += 1; }, session, blockedGuard);
  const crisisResponse = await crisis(new NextRequest("https://memoryai.test/api/consents", { method: "POST", headers: { ...origin, "idempotency-key": "understanding-crisis-0001" }, body: JSON.stringify({ consentType: "crisis_support_escalation" }) }));
  assert.equal(crisisResponse.status, 200);
  assert.equal(crisisWrites, 1);
});
