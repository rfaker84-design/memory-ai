import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gradle = readFileSync(new URL("../android/app/build.gradle", import.meta.url), "utf8");
const gitignore = readFileSync(new URL("../android/.gitignore", import.meta.url), "utf8");

test("Android Release is fail-closed on signing references and cannot fall back to debug signing", () => {
  for (const variable of [
    "MEMORYAI_RELEASE_STORE_FILE",
    "MEMORYAI_RELEASE_STORE_PASSWORD",
    "MEMORYAI_RELEASE_KEY_ALIAS",
    "MEMORYAI_RELEASE_KEY_PASSWORD",
  ]) {
    assert.match(gradle, new RegExp(`System\\.getenv\\("${variable}"\\)`));
  }

  assert.match(gradle, /if \(releaseRequested\)[\s\S]*throw new GradleException\("Release signing is required/);
  assert.match(gradle, /signingConfigs \{[\s\S]*release \{/);
  assert.match(gradle, /buildTypes \{[\s\S]*release \{[\s\S]*signingConfig signingConfigs\.release/);
  assert.doesNotMatch(gradle, /signingConfig signingConfigs\.debug/);
  assert.match(gitignore, /^\*\.jks$/m);
  assert.match(gitignore, /^\*\.keystore$/m);
});
