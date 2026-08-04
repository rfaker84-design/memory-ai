import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { NextRequest } from "next/server";

import { createUnderstandingAssistanceHandler } from "./_handler";
import { UNDERSTANDING_ASSISTANCE_VERSION, type UnderstandingAssistanceState } from "@/features/understanding-assistance/understanding-assistance";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
const session = async () => ({ userId: "00000000-0000-4000-8000-000000000001", externalUserId: "phone:assistance-owner", expiresAt: "2026-12-31T00:00:00.000Z" });
const empty: UnderstandingAssistanceState = { enabled: false, confirmationVersion: null, updatedAt: null };

test("understanding assistance is explicit, minimal, refreshable, revocable, and Owner-bound", async () => {
  let state = empty;
  const calls: unknown[] = [];
  const service = {
    read: async (input: unknown) => { calls.push(["read", input]); return state; },
    enable: async (input: { userId: string; externalUserId: string; requestKey: string }) => { calls.push(["enable", input]); state = { enabled: true, confirmationVersion: UNDERSTANDING_ASSISTANCE_VERSION, updatedAt: "2026-08-04T00:00:00.000Z" }; return state; },
    revoke: async (input: unknown) => { calls.push(["revoke", input]); state = empty; return state; },
    assertHighRiskAllowed: async () => undefined,
  };
  const handler = createUnderstandingAssistanceHandler(service, session);
  const url = "https://memoryai.test/api/account/understanding-assistance";
  const enabled = await handler.POST(new NextRequest(url, { method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": "understanding-assistance-enable-0001" }, body: JSON.stringify({ confirmation: "ENABLE_UNDERSTANDING_ASSISTANCE", confirmationVersion: UNDERSTANDING_ASSISTANCE_VERSION }) }));
  assert.deepEqual(await enabled.json(), { enabled: true, confirmationVersion: UNDERSTANDING_ASSISTANCE_VERSION, updatedAt: "2026-08-04T00:00:00.000Z" });
  assert.equal((await handler.GET(new NextRequest(url))).status, 200);
  const revoked = await handler.DELETE(new NextRequest(url, { method: "DELETE", headers: { origin: "https://memoryai.test", "content-type": "application/json" }, body: JSON.stringify({ confirmation: "REVOKE_UNDERSTANDING_ASSISTANCE" }) }));
  assert.deepEqual(await revoked.json(), empty);
  assert.deepEqual(calls.map((value) => (value as [string])[0]), ["enable", "read", "revoke"]);
  assert.doesNotMatch(JSON.stringify(calls), /看不懂|聊天|诊断|精神/);
});

test("the route rejects forged identity, missing Origin, and malformed confirmations", async () => {
  const service = { read: async () => empty, enable: async () => empty, revoke: async () => empty, assertHighRiskAllowed: async () => undefined };
  const handler = createUnderstandingAssistanceHandler(service, session);
  const url = "https://memoryai.test/api/account/understanding-assistance";
  assert.equal((await handler.POST(new NextRequest(url, { method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": "understanding-assistance-enable-0002" }, body: JSON.stringify({ confirmation: "ENABLE_UNDERSTANDING_ASSISTANCE", confirmationVersion: "forged", userId: "other" }) }))).status, 400);
  assert.equal((await handler.POST(new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "understanding-assistance-enable-0003" }, body: JSON.stringify({ confirmation: "ENABLE_UNDERSTANDING_ASSISTANCE", confirmationVersion: UNDERSTANDING_ASSISTANCE_VERSION }) }))).status, 403);
});

test("the persisted state is owner-isolated, versioned, and reuses the formal guardian confirmation table", () => {
  const source = readFileSync(new URL("../../../../features/understanding-assistance/understanding-assistance-postgres.ts", import.meta.url), "utf8");
  assert.match(source, /account\.id=\$1::uuid AND account\.external_id=\$2/);
  assert.match(source, /account_deletion_guardian_confirmations/);
  assert.match(source, /dependent_user_id=\$1::uuid/);
  assert.match(source, /metadata ->> 'version'/);
  assert.doesNotMatch(source, /console\./);
  assert.doesNotMatch(source, /input\.(?:text|message|content)/i);
});
