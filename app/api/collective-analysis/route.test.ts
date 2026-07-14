import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

const sensitiveNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LEGACY_SUPABASE_URL",
  "LEGACY_SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "TENCENT_SECRET_ID",
  "TENCENT_SECRET_KEY",
  "COS_MEDIA_BUCKET",
] as const;

for (const name of sensitiveNames) delete process.env[name];

test("route imports without database or AI configuration", async () => {
  const route = await import("./route");
  assert.equal(typeof route.GET, "function");
});

test("missing phone is rejected without touching a data source", async () => {
  const { GET } = await import("./route");
  const response = await GET(
    new NextRequest("http://localhost/api/collective-analysis")
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "INVALID_REQUEST",
    message: "phone is required",
  });
});

test("legacy route fails closed with a controlled 503", async () => {
  const { GET } = await import("./route");
  const response = await GET(
    new NextRequest("http://localhost/api/collective-analysis?phone=13800000000")
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "COLLECTIVE_ANALYSIS_UNAVAILABLE",
    message: "This legacy analysis data source is not available",
  });
});
