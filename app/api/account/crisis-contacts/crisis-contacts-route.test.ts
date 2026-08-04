import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";
import { createCrisisContactsHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
const ownerSession = async () => ({ userId: "00000000-0000-4000-8000-000000000001", externalUserId: "phone:owner", expiresAt: "2026-12-31T00:00:00.000Z" });
const contactSession = async () => ({ userId: "00000000-0000-4000-8000-000000000002", externalUserId: "phone:contact", expiresAt: "2026-12-31T00:00:00.000Z" });
const consentId = "00000000-0000-4000-8000-000000000099";

function request(method: "GET" | "POST" | "PATCH", body?: unknown) {
  return new NextRequest("https://memoryai.test/api/account/crisis-contacts", { method, headers: { origin: "https://memoryai.test", ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("crisis contact requests are session-bound and do not reveal whether the target exists", async () => {
  const calls: unknown[] = [];
  const handler = createCrisisContactsHandler({ list: async () => [], request: async (input) => { calls.push(input); }, accept: async () => false, revoke: async () => false }, ownerSession);
  assert.equal((await handler.POST(request("POST", {}))).status, 400);
  const response = await handler.POST(request("POST", { contactExternalId: "phone:unknown-or-known" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { requested: true });
  assert.deepEqual(calls, [{ ownerUserId: "00000000-0000-4000-8000-000000000001", contactExternalId: "phone:unknown-or-known" }]);
  assert.equal((await createCrisisContactsHandler({ list: async () => [], request: async () => {}, accept: async () => false, revoke: async () => false }, async () => null).GET(request("GET"))).status, 401);
});

test("only the receiving session can accept, while either participant may revoke", async () => {
  const calls: unknown[] = [];
  const contacts = { list: async () => [], request: async () => {}, accept: async (input: unknown) => { calls.push(["accept", input]); return true; }, revoke: async (input: unknown) => { calls.push(["revoke", input]); return true; } };
  const accepted = await createCrisisContactsHandler(contacts, contactSession).PATCH(request("PATCH", { consentId, action: "accept" }));
  const revoked = await createCrisisContactsHandler(contacts, ownerSession).PATCH(request("PATCH", { consentId, action: "revoke" }));
  assert.equal(accepted.status, 200);
  assert.equal(revoked.status, 200);
  assert.deepEqual(await accepted.json(), { updated: true });
  assert.deepEqual(await revoked.json(), { updated: true });
  assert.deepEqual(calls, [["accept", { contactUserId: "00000000-0000-4000-8000-000000000002", consentId }], ["revoke", { userId: "00000000-0000-4000-8000-000000000001", consentId }]]);
});

test("a no-op change is not presented as an accepted or revoked consent", async () => {
  const contacts = { list: async () => [], request: async () => {}, accept: async () => false, revoke: async () => false };
  const response = await createCrisisContactsHandler(contacts, contactSession).PATCH(request("PATCH", { consentId, action: "accept" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { updated: false });
});
