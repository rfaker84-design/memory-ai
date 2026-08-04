import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";
import { createNotificationPreferencesHandlers } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
const session = async () => ({ userId: "00000000-0000-4000-8000-000000000001", externalUserId: "phone:owner", expiresAt: "2026-12-31T00:00:00.000Z" });

function request(method: "GET" | "PATCH", body?: unknown, origin = "https://memoryai.test") {
  return new NextRequest("https://memoryai.test/api/account/notification-preferences", {
    method,
    headers: { origin, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("notification preferences are session-bound and default to disabled without a device token", async () => {
  const calls: unknown[] = [];
  const handler = createNotificationPreferencesHandlers({
    read: async (userId) => { calls.push(["read", userId]); return { greetingNotificationsEnabled: false }; },
    update: async (input) => { calls.push(["update", input]); return { greetingNotificationsEnabled: input.greetingNotificationsEnabled }; },
  }, session);

  const response = await handler.GET(request("GET"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { greetingNotificationsEnabled: false });
  assert.deepEqual(calls, [["read", "00000000-0000-4000-8000-000000000001"]]);
  assert.equal((await createNotificationPreferencesHandlers({ read: async () => ({ greetingNotificationsEnabled: false }), update: async () => ({ greetingNotificationsEnabled: false }) }, async () => null).GET(request("GET"))).status, 401);
});

test("notification opt-in is explicit, origin-checked, and has no hidden fields", async () => {
  const calls: unknown[] = [];
  const handler = createNotificationPreferencesHandlers({
    read: async () => ({ greetingNotificationsEnabled: false }),
    update: async (input) => { calls.push(input); return { greetingNotificationsEnabled: input.greetingNotificationsEnabled }; },
  }, session);
  assert.equal((await handler.PATCH(request("PATCH", { greetingNotificationsEnabled: "true" }))).status, 400);
  assert.equal((await handler.PATCH(request("PATCH", { greetingNotificationsEnabled: true, deviceToken: "not-accepted" }))).status, 400);
  assert.equal((await handler.PATCH(request("PATCH", { greetingNotificationsEnabled: true }, "https://attacker.test"))).status, 403);
  const response = await handler.PATCH(request("PATCH", { greetingNotificationsEnabled: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { greetingNotificationsEnabled: true });
  assert.deepEqual(calls, [{ userId: "00000000-0000-4000-8000-000000000001", greetingNotificationsEnabled: true }]);
});
