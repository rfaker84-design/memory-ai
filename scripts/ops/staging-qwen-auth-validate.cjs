"use strict";

// A non-mutating authentication probe.  It deliberately asks the provider for
// a random, nonexistent voice rather than creating, listing, or exposing one.
const crypto = require("node:crypto");
const { loadStagingQwenSecrets } = require("./staging-web-secret-runtime-wrapper.cjs");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

async function verifyAuth() {
  const secret = loadStagingQwenSecrets();
  const response = await fetch(secret.DASHSCOPE_VOICE_CLONE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret.DASHSCOPE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voice-enrollment",
      input: { action: "query_voice", voice_id: `staging-auth-probe-${crypto.randomUUID()}` },
    }),
  });
  if (response.status === 401) fail("STAGING_QWEN_AUTH_401");
  // An authenticated request may still be rejected for model entitlement or
  // because the random voice does not exist.  Those are reported only by the
  // later E2E gate; they must never be misreported as an invalid API key.
  console.log(`QWEN_AUTH_VERIFIED status=${response.status}`);
}

verifyAuth().catch((error) => {
  console.error(`QWEN_AUTH_FAILED code=${error?.code ?? "STAGING_QWEN_AUTH_NETWORK_OR_ENDPOINT_FAILED"}`);
  process.exitCode = 1;
});
