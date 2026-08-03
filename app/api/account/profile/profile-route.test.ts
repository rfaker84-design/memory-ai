import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createAccountProfileHandlers } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const session = async () => ({ userId: "00000000-0000-4000-8000-000000000001", externalUserId: "phone:13800138000", expiresAt: new Date(Date.now() + 60_000).toISOString() });
const noSession = async () => null;

function request(method: "GET" | "PATCH", body?: unknown) {
  return new NextRequest("https://memoryai.test/api/account/profile", {
    method,
    headers: { origin: "https://memoryai.test", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("profile reads and updates only the authenticated owner birth date", async () => {
  const writes: Array<{ externalUserId: string; birthDate: string }> = [];
  const handlers = createAccountProfileHandlers({
    read: async () => ({ birthDate: "1990-01-02", adultEligible: true }),
    updateBirthDate: async (externalUserId, birthDate) => {
      writes.push({ externalUserId, birthDate });
      return { birthDate, adultEligible: true };
    },
  }, session);

  assert.deepEqual(await (await handlers.GET(request("GET"))).json(), { birthDate: "1990-01-02", adultEligible: true });
  const updated = await handlers.PATCH(request("PATCH", { birthDate: "1990-01-02" }));
  assert.equal(updated.status, 200);
  assert.deepEqual(writes, [{ externalUserId: "phone:13800138000", birthDate: "1990-01-02" }]);
});

test("profile saves an editable birthday while malformed and unauthenticated writes fail", async () => {
  const service = { read: async () => ({ birthDate: null, adultEligible: false }), updateBirthDate: async (_externalUserId: string, birthDate: string) => ({ birthDate, adultEligible: false }) };
  const handlers = createAccountProfileHandlers(service, session);
  assert.deepEqual(await (await handlers.PATCH(request("PATCH", { birthDate: "2010-01-01" }))).json(), { birthDate: "2010-01-01", adultEligible: false });
  assert.deepEqual(await (await handlers.PATCH(request("PATCH", { birthDate: "not-a-date" }))).json(), { error: "INVALID_BIRTH_DATE" });
  const anonymous = createAccountProfileHandlers(service, noSession);
  assert.equal((await anonymous.GET(request("GET"))).status, 401);
});

test("profile mutation requires the shared same-origin boundary", async () => {
  const handlers = createAccountProfileHandlers({
    read: async () => ({ birthDate: null, adultEligible: false }),
    updateBirthDate: async (_externalUserId, birthDate) => ({ birthDate, adultEligible: true }),
  }, session);
  const response = await handlers.PATCH(new NextRequest("https://memoryai.test/api/account/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ birthDate: "1990-01-02" }),
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "ORIGIN_NOT_ALLOWED" });
});
