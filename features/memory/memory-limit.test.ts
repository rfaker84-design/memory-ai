import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./memory-postgres-datasource.ts", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../../app/api/memories/route.ts", import.meta.url),
  "utf8",
);

test("memory creation serializes by user and rejects a fourth memory", () => {
  assert.match(source, /memoryai:memory-create-limit/);
  assert.match(source, /COUNT\(\*\)::text AS count FROM memories WHERE user_id/);
  assert.match(source, />= 3/);
  assert.match(source, /MemoryLimitError/);
});

test("the public route reports the three-memory boundary without a 500", () => {
  assert.match(route, /MEMORY_LIMIT_REACHED/);
  assert.match(route, /maxMemories: 3/);
  assert.match(route, /status: 409/);
});
