import assert from "node:assert/strict";
import test from "node:test";

import { loadNotificationPreferences, NotificationPreferencesRequestError, updateNotificationPreferences } from "./notificationPreferencesClient";

test("notification preference client uses only the formal account route and maps an explicit boolean", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ greetingNotificationsEnabled: true }), { status: 200 });
  };
  try {
    assert.deepEqual(await loadNotificationPreferences(), { greetingNotificationsEnabled: true });
    assert.deepEqual(await updateNotificationPreferences(false), { greetingNotificationsEnabled: true });
    assert.equal(calls[0]?.input, "/api/account/notification-preferences");
    assert.equal(calls[0]?.init?.credentials, "same-origin");
    assert.equal(calls[1]?.init?.method, "PATCH");
    assert.equal(calls[1]?.init?.body, JSON.stringify({ greetingNotificationsEnabled: false }));
  } finally { globalThis.fetch = originalFetch; }
});

test("notification preference client does not turn a server failure into a local success", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "NOTIFICATION_PREFERENCES_UNAVAILABLE" }), { status: 503 });
  try {
    await assert.rejects(updateNotificationPreferences(true), (error: unknown) => error instanceof NotificationPreferencesRequestError && error.status === 503);
  } finally { globalThis.fetch = originalFetch; }
});
