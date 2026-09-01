"use strict";

// This command accepts one JSON object on stdin only.  The secret never
// appears in arguments, process titles, PM2 state, stdout, or diagnostics.
const { readFileSync } = require("node:fs");
const { writeStagingQwenSecrets } = require("./staging-web-secret-runtime-wrapper.cjs");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8")); } catch { fail("STAGING_QWEN_SECRET_INPUT_INVALID"); }
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).sort().join(",") !== "apiKey,endpoint") {
    fail("STAGING_QWEN_SECRET_INPUT_INVALID");
  }
  writeStagingQwenSecrets(input);
  console.log("STAGING_QWEN_SECRET_STORED mode=0600");
}

try { main(); } catch (error) {
  console.error(`STAGING_QWEN_SECRET_STORE_FAILED code=${error?.code ?? "UNKNOWN"}`);
  process.exitCode = 1;
}
