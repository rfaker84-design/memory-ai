import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("submitted input cleanup logs only a stable non-identifying error code", () => {
  const source = readFileSync("features/video/first-presence-video-service.ts", "utf8");
  const cleanupLog = source.match(/console\.error\("\[video\] submitted input cleanup failed", \{[\s\S]*?\n      \}\);/)?.[0] ?? "";
  assert.match(cleanupLog, /VIDEO_INPUT_CLEANUP_FAILED/);
  assert.doesNotMatch(cleanupLog, /jobId|\.message|error instanceof/);
});
