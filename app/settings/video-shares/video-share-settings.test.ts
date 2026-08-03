import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("video share management lives under My and only exposes approved videos with explicit revoke recovery", () => {
  const page = readFileSync("app/settings/video-shares/page.tsx", "utf8");
  const continuity = readFileSync("app/(continuity)/continuity/page.tsx", "utf8");
  assert.match(continuity, /\/settings\/video-shares/);
  assert.match(page, /status === "succeeded" && job\.artifactAvailable && !job\.manualReviewRequired/);
  assert.match(page, /\/api\/memories\/\$\{encodeURIComponent\(memoryId\)\}\/video-shares/);
  assert.match(page, /撤销后将立即不可查看/);
  assert.match(page, /结果尚未确认；请不要重复/);
  assert.doesNotMatch(page, /download|attachment/i);
});
