import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const mutationPaths = [
  "/api/auth/send-code",
  "/api/memories",
  "/api/memories/memory-id",
  "/api/memories/memory-id/chat-session",
  "/api/memory-chat",
  "/api/media/upload",
  "/api/media/media-id",
  "/api/chat-sessions",
  "/api/chat-sessions/session-id/messages",
  "/api/chat-mvp",
  "/api/memories-mvp",
];

test("every production API mutation is guarded by the shared Origin boundary", async (t) => {
  for (const pathname of mutationPaths) {
    await t.test(pathname, async () => {
      const rejected = middleware(new NextRequest(`https://memoryai.test${pathname}`, {
        method: "POST",
      }));
      assert.equal(rejected.status, 403);
      assert.equal((await rejected.json()).error, "ORIGIN_NOT_ALLOWED");

      const allowed = middleware(new NextRequest(`https://memoryai.test${pathname}`, {
        method: "POST",
        headers: { origin: "https://memoryai.test" },
      }));
      assert.equal(allowed.headers.get("x-middleware-next"), "1");
    });
  }
});

test("Origin boundary fails closed when production configuration is missing", async () => {
  const configured = process.env.AUTH_ALLOWED_ORIGIN;
  delete process.env.AUTH_ALLOWED_ORIGIN;
  try {
    const response = middleware(new NextRequest("https://memoryai.test/api/memories", {
      method: "DELETE",
      headers: { origin: "https://memoryai.test" },
    }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "AUTH_UNAVAILABLE");
  } finally {
    process.env.AUTH_ALLOWED_ORIGIN = configured;
  }
});

test("safe methods pass through without Origin", () => {
  const response = middleware(new NextRequest("https://memoryai.test/api/health"));
  assert.equal(response.headers.get("x-middleware-next"), "1");
});
