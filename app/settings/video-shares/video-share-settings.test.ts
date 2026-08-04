import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("video share management lives under My and only exposes approved videos with explicit revoke recovery", () => {
  const page = readFileSync("app/settings/video-shares/page.tsx", "utf8");
  const continuity = readFileSync("app/(continuity)/continuity/page.tsx", "utf8");
  assert.match(continuity, /\/settings\/video-shares/);
  assert.match(page, /status === "succeeded" && job\.saveAllowed && job\.artifactAvailable && !job\.manualReviewRequired/);
  assert.match(page, /\/api\/memories\/\$\{encodeURIComponent\(memoryId\)\}\/video-shares/);
  assert.match(page, /撤销后将立即不可查看/);
  assert.match(page, /结果尚未确认；请不要重复/);
  assert.match(page, /function boundedFetch/);
  assert.match(page, /12_000/);
  assert.match(page, /20_000/);
  assert.match(page, /minHeight: 44/);
  assert.match(page, /setWatermarkDownload/);
  assert.match(page, /\/download/);
  assert.match(page, /URL\.createObjectURL/);
  assert.match(page, /AI Generated \| MemoryAI/);
  assert.match(page, /method: "PATCH"/);
});
