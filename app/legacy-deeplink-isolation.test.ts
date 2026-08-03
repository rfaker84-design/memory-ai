import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const timeline = readFileSync(new URL("./timeline/[id]/page.tsx", import.meta.url), "utf8");

test("legacy timeline cannot bypass the approved owner-bound pickup flow", () => {
  assert.doesNotMatch(timeline, /import\s+\{\s*supabase\s*\}/i);
  assert.doesNotMatch(timeline, /\.from\(\s*["']timeline_events["']\s*\)/i);
  assert.match(timeline, /redirect\(`\/memory\/\$\{encodeURIComponent\(id\)\}\/pickup`\)/);
  assert.match(timeline, /await params/);
});
