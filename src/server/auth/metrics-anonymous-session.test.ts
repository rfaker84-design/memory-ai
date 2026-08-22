import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest, NextResponse } from "next/server";

import { METRICS_ANONYMOUS_COOKIE, resolveMetricsAnonymousSession, setMetricsAnonymousSessionCookie } from "./metrics-anonymous-session";

process.env.SESSION_SECRET ??= "metrics-test-session-secret-at-least-32-bytes";

test("metrics anonymous session is an opaque server-issued Host cookie", async () => {
  const first = await resolveMetricsAnonymousSession(new NextRequest("https://memoryai.test/api/product-interactions"));
  assert.equal(first.newlyIssued, true);
  const response = NextResponse.json({});
  await setMetricsAnonymousSessionCookie(response, first);
  const header = response.headers.get("set-cookie") ?? "";
  assert.match(header, new RegExp(`^${METRICS_ANONYMOUS_COOKIE}=`));
  assert.match(header, /HttpOnly/i);
  assert.match(header, /Secure/i);
  assert.match(header, /SameSite=lax/i);
  assert.match(header, /Path=\//i);
  assert.doesNotMatch(header, /Domain=/i);
  const token = /=[^;]+/.exec(header)?.[0].slice(1);
  const next = await resolveMetricsAnonymousSession(new NextRequest("https://memoryai.test/api/product-interactions", { headers: { cookie: `${METRICS_ANONYMOUS_COOKIE}=${token}` } }));
  assert.equal(next.id, first.id);
  assert.equal(next.newlyIssued, false);
});
