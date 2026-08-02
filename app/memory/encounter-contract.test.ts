import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./[id]/encounter/page.tsx", import.meta.url), "utf8");

test("encounter only reads an approved owner preview and never submits a generation", () => {
  assert.match(source, /method:\s*"GET"|fetch\(`\/api\/memories/);
  assert.match(source, /intent === "initial_preview"/);
  assert.match(source, /job\.status === "succeeded"/);
  assert.match(source, /artifactAvailable/);
  assert.match(source, /saveAllowed === false/);
  assert.match(source, /onEnded=\{afterPlayback\}/);
  assert.doesNotMatch(source, /method:\s*"POST"/);
  assert.doesNotMatch(source, /loop=/);
});
