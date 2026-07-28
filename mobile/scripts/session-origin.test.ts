import assert from "node:assert/strict";
import test from "node:test";

import { resolveMobileSessionContract, validateApiBaseUrl } from "../build/session-origin";

test("Debug connects only the packaged staging App origin to its HTTPS API sibling", () => {
  const contract = resolveMobileSessionContract("debug", {
    MOBILE_APP_ORIGIN_HOST: "app.staging.yijianmemory.cn",
    VITE_MOBILE_API_BASE_URL: "https://api.staging.yijianmemory.cn",
    VITE_MOBILE_STAGING_ACCESS_TOKEN: "a".repeat(48),
  });
  assert.deepEqual(contract, {
    channel: "debug",
    appHostname: "app.staging.yijianmemory.cn",
    appOrigin: "https://app.staging.yijianmemory.cn",
    apiBaseUrl: "https://api.staging.yijianmemory.cn",
    stagingAccessToken: "a".repeat(48),
  });
  assert.throws(
    () => validateApiBaseUrl("debug", "app.staging.yijianmemory.cn", "http://api.staging.yijianmemory.cn"),
    /exactly https:\/\/api\.staging\.yijianmemory\.cn/,
  );
  assert.throws(
    () => resolveMobileSessionContract("debug", {
      MOBILE_APP_ORIGIN_HOST: "app.staging.yijianmemory.cn",
      VITE_MOBILE_API_BASE_URL: "https://api.staging.yijianmemory.cn",
    }),
    /VITE_MOBILE_STAGING_ACCESS_TOKEN is required/,
  );
  assert.throws(
    () => validateApiBaseUrl("debug", "app.staging.yijianmemory.cn", "https://api.other.invalid"),
    /exactly https:\/\/api\.staging\.yijianmemory\.cn/,
  );
});

test("Release rejects injected API and Debug-only media while retaining a local HTTPS App origin", () => {
  const contract = resolveMobileSessionContract("release", {});
  assert.equal(contract.appOrigin, "https://app.yijianmemory.cn");
  assert.equal(contract.apiBaseUrl, null);
  assert.throws(
    () => resolveMobileSessionContract("release", { VITE_MOBILE_API_BASE_URL: "https://api.staging.yijianmemory.cn" }),
    /Debug-only/,
  );
  assert.throws(
    () => resolveMobileSessionContract("release", { VITE_MOBILE_TEST_VIDEO_URL: "https://example.invalid/test.mp4" }),
    /Debug-only/,
  );
  assert.throws(
    () => resolveMobileSessionContract("release", { VITE_MOBILE_STAGING_ACCESS_TOKEN: "a".repeat(48) }),
    /Debug-only/,
  );
  assert.throws(
    () => resolveMobileSessionContract("release", { MOBILE_APP_ORIGIN_HOST: "app.staging.yijianmemory.cn" }),
    /app\.yijianmemory\.cn/,
  );
});
