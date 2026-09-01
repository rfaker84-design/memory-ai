"use strict";

// This command accepts one JSON object on stdin only.  The secret never
// appears in arguments, process titles, PM2 state, stdout, or diagnostics.
const { readFileSync } = require("node:fs");
const { serializedSecretFile, writeStagingQwenSecrets } = require("./staging-web-secret-runtime-wrapper.cjs");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function main() {
  const argumentsAfterNode = process.argv.slice(2);
  if (argumentsAfterNode.length > 1 || (argumentsAfterNode.length === 1 && argumentsAfterNode[0] !== "--validate-only")) {
    fail("STAGING_QWEN_SECRET_ARGUMENTS_INVALID");
  }
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8")); } catch { fail("STAGING_QWEN_SECRET_INPUT_INVALID"); }
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).sort().join(",") !== "apiKey,endpoint") {
    fail("STAGING_QWEN_SECRET_INPUT_INVALID");
  }
  // The Staging-only validation path exists solely for the secure-input
  // regression test. It exercises JSON stdin and the same strict wrapper
  // parser without creating or changing the secret file.
  if (argumentsAfterNode[0] === "--validate-only") {
    serializedSecretFile(input);
    console.log("STAGING_QWEN_SECRET_VALIDATED");
    return;
  }
  writeStagingQwenSecrets(input);
  console.log("STAGING_QWEN_SECRET_STORED mode=0600");
}

try { main(); } catch (error) {
  console.error(`STAGING_QWEN_SECRET_STORE_FAILED code=${error?.code ?? "UNKNOWN"}`);
  process.exitCode = 1;
}
