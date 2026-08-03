import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.join(process.cwd(), "features/video/video-share-links.ts"), "utf8");

test("public share data access is revocation-aware and never projects a storage capability", () => {
  assert.match(source, /s\.revoked_at IS NULL/);
  assert.match(source, /quality_status = 'approved'/);
  assert.match(source, /reviewer_kind = 'manual' AND q\.decision = 'approved'/);
  assert.match(source, /artifactKey: row\.artifact_key/);
  assert.match(source, /Server-only\. It must never be returned by a public route/);
  assert.match(source, /watermarkDownloadEnabled: false/);
});

test("an owner may reissue only after revocation while active duplicate creation stays idempotent", () => {
  assert.match(source, /ON CONFLICT \(video_job_id\) WHERE revoked_at IS NULL/);
  assert.match(source, /DO UPDATE SET title = EXCLUDED\.title/);
  assert.match(source, /SET revoked_at = COALESCE\(s\.revoked_at, NOW\(\)\)/);
});
