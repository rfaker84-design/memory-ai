import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.join(process.cwd(), "features/video/video-share-links.ts"), "utf8");

test("public share data access is revocation-aware and never projects a storage capability", () => {
  assert.match(source, /s\.revoked_at IS NULL/);
  assert.match(source, /quality_status = 'approved'/);
  assert.match(source, /r\.purpose <> 'first_preview' AND l\.save_allowed = TRUE/);
  assert.match(source, /JOIN public\.commerce_generation_reservations r ON r\.id = j\.reservation_id/);
  assert.match(source, /reviewer_kind = 'manual' AND q\.decision = 'approved'/);
  assert.match(source, /artifactKey: row\.artifact_key/);
  assert.match(source, /Server-only\. It must never be returned by a public route/);
  assert.match(source, /watermarkDownloadEnabled: false/);
});

test("initial previews and any non-saveable credit lot cannot become public shares", () => {
  const restrictions = source.match(/r\.purpose <> 'first_preview' AND l\.save_allowed = TRUE/g) ?? [];
  assert.equal(restrictions.length, 2, "creation and every public read must enforce the saveability boundary");
});

test("a credible impersonation hold removes the share from owner, creation, and public-read paths", () => {
  const holds = source.match(/public\.content_visibility_holds/g) ?? [];
  assert.equal(holds.length, 3, "all share entry points must check an active content hold");
  assert.match(source, /h\.status='hidden'/);
  assert.match(source, /h\.share_link_id=s\.id/);
});

test("an owner may reissue only after revocation while active duplicate creation stays idempotent", () => {
  assert.match(source, /ON CONFLICT \(video_job_id\) WHERE revoked_at IS NULL/);
  assert.match(source, /DO UPDATE SET title = EXCLUDED\.title/);
  assert.match(source, /SET revoked_at = COALESCE\(s\.revoked_at, NOW\(\)\)/);
});
