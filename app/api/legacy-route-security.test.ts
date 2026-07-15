import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import * as chatMvp from "./chat-mvp/route";
import * as chatSessions from "./chat-sessions/route";
import * as chatMessages from "./chat-sessions/[id]/messages/route";
import * as legacyChat from "./chat/route";
import * as memoriesMvp from "./memories-mvp/route";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const routes = [
  { name: "chat-sessions", route: chatSessions },
  { name: "chat-sessions messages", route: chatMessages },
  { name: "chat-mvp", route: chatMvp },
  { name: "memories-mvp", route: memoriesMvp },
  { name: "legacy chat", route: legacyChat },
];

test("legacy ownership routes cannot enumerate or mutate victim data", async (t) => {
  for (const entry of routes) {
    await t.test(entry.name, async () => {
      const read = await entry.route.GET();
      assert.equal(read.status, 410);
      assert.deepEqual(await read.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" });

      const mutation = await entry.route.POST(new NextRequest(
        `https://memoryai.test/api/${entry.name}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://memoryai.test",
          },
          body: JSON.stringify({
            userId: "victim-user-id",
            phone: "13800000000",
            user_phone: "13800000000",
          }),
        },
      ));
      assert.equal(mutation.status, 410);
      assert.deepEqual(await mutation.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" });
    });
  }
});

test("legacy mutations still require the shared Origin boundary", async () => {
  const response = await chatSessions.POST(new NextRequest(
    "https://memoryai.test/api/chat-sessions",
    { method: "POST", body: JSON.stringify({ userId: "victim" }) },
  ));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "ORIGIN_NOT_ALLOWED");
});
