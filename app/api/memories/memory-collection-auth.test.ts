import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { AUTH_SESSION_COOKIE, issueSession } from "@/src/server/auth";

import { GET, POST } from "./route";

process.env.SESSION_SECRET = "collection-test-session-secret-at-least-32-bytes";
process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

test("Memory collection GET and POST reject unauthenticated requests", async () => {
  const getResponse = await GET(new NextRequest("https://memoryai.test/api/memories"));
  assert.equal(getResponse.status, 401);

  const postResponse = await POST(new NextRequest("https://memoryai.test/api/memories", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://memoryai.test" },
    body: JSON.stringify({ name: "Synthetic" }),
  }));
  assert.equal(postResponse.status, 401);
});

test("Memory collection rejects a forged compatibility user before database access", async () => {
  const token = await issueSession({
    userId: "00000000-0000-4000-8000-000000000001",
    externalUserId: "phone:owner-hash",
  });
  const response = await GET(new NextRequest(
    "https://memoryai.test/api/memories?userId=phone%3Aattacker-hash",
    { headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}` } }
  ));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "SESSION_USER_MISMATCH");
});
