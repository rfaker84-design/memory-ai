import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { NextRequest } from "next/server";

import { createStagingMediaUrl } from "@/src/server/runtime/staging-media";
import { StagingLocalMediaStorage } from "@/src/server/storage/staging-local-media-storage";

import { GET } from "./route";

test("staging local-media route requires a short-lived signature and reads only isolated storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "memoryai-staging-media-route-"));
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "staging",
    DATABASE_URL: "postgresql://staging:secret@127.0.0.1:5432/memoryai_staging",
    STAGING_DATABASE_ISOLATION: "isolated",
    STAGING_DATABASE_NAME: "memoryai_staging",
    STAGING_DATA_SOURCE: "empty",
    AUTH_ALLOWED_ORIGIN: "https://app.staging.yijianmemory.cn",
    STAGING_ACCESS_TOKEN: "a".repeat(48),
    STAGING_FIXED_SMS_CODE: "246810",
    STAGING_FIXED_SMS_PHONES: "+8613800013800,+8613900013900",
    STAGING_MEDIA_ROOT: root,
    STAGING_MEDIA_SIGNING_SECRET: "m".repeat(32),
    LLM_PROVIDER: "mock",
    TTS_PROVIDER: "mock",
  };
  const previous = new Map(Object.keys(environment).map((key) => [key, process.env[key]]));
  const key = "media/phone:test/11111111-1111-4111-8111-111111111111/image/22222222-2222-4222-8222-222222222222.jpg";
  try {
    Object.assign(process.env, environment);
    const storage = new StagingLocalMediaStorage(root);
    await storage.put({ key, body: Buffer.from("staging-only"), contentType: "image/jpeg", contentLength: 12, sha256: "x" });
    const url = createStagingMediaUrl(key, 300);
    const response = await GET(new NextRequest(url));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(await response.text(), "staging-only");

    const denied = await GET(new NextRequest("https://api.staging.yijianmemory.cn/api/media/local"));
    assert.equal(denied.status, 403);
  } finally {
    for (const [keyName, value] of previous) {
      if (value === undefined) delete process.env[keyName];
      else process.env[keyName] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
