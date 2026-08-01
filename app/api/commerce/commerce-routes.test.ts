import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { NextRequest } from "next/server";

import { createCommerceOrdersHandler } from "./orders/_handler";
import { createReferralQualificationHandler } from "./referrals/qualifications/_handler";
import { createCommerceTestCallbackHandler } from "./testing/callbacks/_handler";
import type {
  CheckoutAction,
  CommerceOrder,
  CommercePaymentAdapter,
} from "@/features/commerce";
import { CommerceStateError } from "@/features/commerce";
import { ProductCapabilityUnavailableError } from "@/src/server/runtime/product-capability-gate";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  externalUserId: `phone:${"a".repeat(64)}`,
  expiresAt: "2026-07-28T00:00:00.000Z",
};

const order: CommerceOrder = {
  id: "00000000-0000-4000-8000-000000000002",
  orderNo: "YC20260727000000AAAAAAAAAAA1",
  productId: "memory_video_49",
  platform: "ios",
  paymentRail: "storekit_iap",
  amountFen: 4900,
  currency: "CNY",
  generationCredits: 2,
  grantsFirstPreviewSave: true,
  status: "pending",
  providerTransactionId: null,
  createdAt: "2026-07-27T00:00:00.000Z",
  paidAt: null,
  refundedAt: null,
};

test("orders API accepts only product and platform and delegates iOS to StoreKit", async () => {
  const calls: unknown[] = [];
  const adapter: CommercePaymentAdapter = {
    rail: "storekit_iap",
    prepareCheckout: async (): Promise<CheckoutAction> => ({
      kind: "storekit_required",
      orderNo: order.orderNo,
      appAccountToken: order.id,
      chargesMoney: false,
    }),
  };
  const handler = createCommerceOrdersHandler(
    () => ({
      createOrder: async (input) => {
        calls.push(input);
        return {
          order,
          checkout: await adapter.prepareCheckout(order),
        };
      },
      listOrders: async () => [order],
    }),
    async () => session,
    (platform) => {
      assert.equal(platform, "ios");
      return adapter;
    },
    () => undefined,
    async () => true,
  );
  const response = await handler.POST(
    new NextRequest("https://memoryai.test/api/commerce/orders", {
      method: "POST",
      headers: {
        origin: "https://memoryai.test",
        "content-type": "application/json",
        "idempotency-key": "commerce-order-route-0001",
      },
      body: JSON.stringify({
        memoryId: "00000000-0000-4000-8000-000000000003",
        productId: "memory_video_49",
        platform: "ios",
      }),
    }),
  );
  assert.equal(response.status, 201);
  assert.equal((await response.json()).checkout.kind, "storekit_required");
  assert.equal(calls.length, 1);

  const tampered = await handler.POST(
    new NextRequest("https://memoryai.test/api/commerce/orders", {
      method: "POST",
      headers: {
        origin: "https://memoryai.test",
        "content-type": "application/json",
        "idempotency-key": "commerce-order-route-0002",
      },
      body: JSON.stringify({
        productId: "memory_video_49",
        platform: "ios",
        amountFen: 1,
      }),
    }),
  );
  assert.equal(tampered.status, 400);
});

test("orders API never exposes a dynamic commerce state message", async () => {
  const handler = createCommerceOrdersHandler(
    () => ({
      createOrder: async () => {
        throw new CommerceStateError("Idempotency-Key payload conflict");
      },
      listOrders: async () => [],
    }),
    async () => session,
    undefined,
    undefined,
    async () => true,
  );
  const response = await handler.POST(
    new NextRequest("https://memoryai.test/api/commerce/orders", {
      method: "POST",
      headers: {
        origin: "https://memoryai.test",
        "content-type": "application/json",
        "idempotency-key": "commerce-order-route-state-conflict",
      },
      body: JSON.stringify({ memoryId: "00000000-0000-4000-8000-000000000003", productId: "memory_video_49", platform: "web" }),
    }),
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "COMMERCE_STATE_CONFLICT" });
});

test("purchase kill switch blocks order creation after authentication and Origin verification", async () => {
  let createCalls = 0;
  const handler = createCommerceOrdersHandler(
    () => ({
      async createOrder() { createCalls += 1; throw new Error("must not create an order"); },
      async listOrders() { return []; },
    }),
    async () => session,
    () => { throw new Error("payment adapter must not be selected"); },
    () => { throw new ProductCapabilityUnavailableError("COMMERCE_PURCHASES_DISABLED"); },
    async () => true,
  );
  const response = await handler.POST(new NextRequest("https://memoryai.test/api/commerce/orders", {
    method: "POST",
    headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": "commerce-kill-switch-0001" },
    body: JSON.stringify({ memoryId: "00000000-0000-4000-8000-000000000003", productId: "memory_video_49", platform: "web" }),
  }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "COMMERCE_PURCHASES_DISABLED" });
  assert.equal(createCalls, 0);
});

test("orders API rejects direct purchase without TA-bound commercial consent", async () => {
  let createCalls = 0;
  const handler = createCommerceOrdersHandler(
    () => ({
      async createOrder() { createCalls += 1; throw new Error("must not create an order"); },
      async listOrders() { return []; },
    }),
    async () => session,
    () => ({ rail: "test", prepareCheckout: async () => ({ kind: "test_callback_required", orderNo: order.orderNo, chargesMoney: false }) }),
    () => undefined,
    async () => false,
  );
  const response = await handler.POST(new NextRequest("https://memoryai.test/api/commerce/orders", {
    method: "POST",
    headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": "commerce-consent-required-0001" },
    body: JSON.stringify({ memoryId: "00000000-0000-4000-8000-000000000003", productId: "memory_video_49", platform: "web" }),
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "COMMERCIAL_CONSENT_REQUIRED" });
  assert.equal(createCalls, 0);
});

test("referral qualification uses verified server device output, not the raw token", async () => {
  const calls: unknown[] = [];
  const handler = createReferralQualificationHandler(
    () => ({
      qualifyReferral: async (input) => {
        calls.push(input);
        return {
          inviterExternalUserId: `phone:${"b".repeat(64)}`,
          inviteeExternalUserId: input.inviteeExternalUserId,
          qualifiedCount: 1,
          rewardGranted: false,
          rewardCohort: null,
        };
      },
    }),
    async () => session,
    {
      verify: async (token) => {
        assert.equal(token, "signed-device-attestation");
        return { deviceKeyHash: "c".repeat(64) };
      },
    },
  );
  const response = await handler(
    new NextRequest(
      "https://memoryai.test/api/commerce/referrals/qualifications",
      {
        method: "POST",
        headers: {
          origin: "https://memoryai.test",
          "content-type": "application/json",
          "idempotency-key": "referral-route-request-0001",
        },
        body: JSON.stringify({
          code: "ABCDEFGH23",
          deviceAttestation: "signed-device-attestation",
        }),
      },
    ),
  );
  assert.equal(response.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(
    (calls[0] as { deviceKeyHash: string }).deviceKeyHash,
    "c".repeat(64),
  );
  assert.doesNotMatch(JSON.stringify(calls[0]), /signed-device-attestation/);
});

test("test callback requires HMAC, is duplicate-safe, and disappears in production", async () => {
  const secret = "test-callback-secret-with-at-least-32-bytes";
  const rawBody = JSON.stringify({
    amountFen: 4900,
    eventId: "test-event-0001",
    kind: "payment",
    orderNo: order.orderNo,
    status: "succeeded",
    transactionId: "test-transaction-0001",
  });
  let calls = 0;
  const handler = createCommerceTestCallbackHandler(
    () => ({
      applyPaymentEvent: async () => {
        calls += 1;
        return { outcome: "duplicate", orderNo: order.orderNo };
      },
    }),
    {
      NODE_ENV: "test",
      COMMERCE_TEST_MODE: "true",
      COMMERCE_TEST_CALLBACK_SECRET: secret,
    },
  );
  const signature = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const accepted = await handler(
    new NextRequest(
      "https://memoryai.test/api/commerce/testing/callbacks",
      {
        method: "POST",
        headers: { "x-commerce-test-signature": signature },
        body: rawBody,
      },
    ),
  );
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).settlement.outcome, "duplicate");
  assert.equal(calls, 1);

  const rejected = await handler(
    new NextRequest(
      "https://memoryai.test/api/commerce/testing/callbacks",
      { method: "POST", body: rawBody },
    ),
  );
  assert.equal(rejected.status, 401);
  assert.equal(calls, 1);

  const production = createCommerceTestCallbackHandler(
    () => ({
      applyPaymentEvent: async () => {
        calls += 1;
        return { outcome: "paid", orderNo: order.orderNo };
      },
    }),
    {
      NODE_ENV: "production",
      COMMERCE_TEST_MODE: "true",
      COMMERCE_TEST_CALLBACK_SECRET: secret,
    },
  );
  const hidden = await production(
    new NextRequest(
      "https://memoryai.test/api/commerce/testing/callbacks",
      {
        method: "POST",
        headers: { "x-commerce-test-signature": signature },
        body: rawBody,
      },
    ),
  );
  assert.equal(hidden.status, 404);
  assert.equal(calls, 1);
});
