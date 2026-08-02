import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createConsentsHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const session = async () => ({ userId: "session-user", externalUserId: "phone:13800138000", expiresAt: "2026-12-31T00:00:00.000Z" });
const request = (body: unknown, headers: Record<string, string> = {}) => new NextRequest("https://memoryai.test/api/consents", {
  method: "POST",
  headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": "consent-1234567890abcd", ...headers },
  body: JSON.stringify(body),
});

test("records a session-bound trust acknowledgement without client identity", async () => {
  let written: unknown;
  const handler = createConsentsHandler(async (input) => { written = input; }, session);
  const response = await handler(request({ consentType: "memory_profile" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { recorded: true });
  assert.deepEqual(written, { externalUserId: "phone:13800138000", consentType: "memory_profile", memoryId: null, requestKey: "consent-1234567890abcd" });
});

test("records the adult self-attestation as a distinct account-level consent", async () => {
  let written: unknown;
  const handler = createConsentsHandler(async (input) => { written = input; }, session);
  const response = await handler(request({ consentType: "adult_eligibility" }));
  assert.equal(response.status, 200);
  assert.deepEqual(written, { externalUserId: "phone:13800138000", consentType: "adult_eligibility", memoryId: null, requestKey: "consent-1234567890abcd" });
});

test("records a separately explicit crisis support escalation authorization", async () => {
  let written: unknown;
  const handler = createConsentsHandler(async (input) => { written = input; }, session);
  const response = await handler(request({ consentType: "crisis_support_escalation" }));
  assert.equal(response.status, 200);
  assert.deepEqual(written, { externalUserId: "phone:13800138000", consentType: "crisis_support_escalation", memoryId: null, requestKey: "consent-1234567890abcd" });
});

test("requires a memory for media and commerce acknowledgement", async () => {
  const handler = createConsentsHandler(async () => {}, session);
  const response = await handler(request({ consentType: "commercial_use" }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "INVALID_CONSENT_REQUEST" });
});

test("rejects client supplied identity and malformed keys", async () => {
  const handler = createConsentsHandler(async () => {}, session);
  assert.equal((await handler(request({ consentType: "memory_profile", userId: "forged" }))).status, 400);
  assert.equal((await handler(request({ consentType: "memory_profile" }, { "idempotency-key": "short" }))).status, 400);
});
