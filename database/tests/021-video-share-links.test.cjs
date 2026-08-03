const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "migrations", "021_video_share_links.sql"), "utf8");
const postflight = fs.readFileSync(path.join(root, "verification", "021-video-share-links-postflight.sql"), "utf8");
const runner = fs.readFileSync(path.join(root, "..", "scripts", "postgresql", "apply-migrations.sh"), "utf8");

test("021 creates an opaque, revocable, candidate-only video share link without a media capability", () => {
  assert.match(migration, /CANDIDATE ONLY/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.video_share_links/);
  assert.match(migration, /public_id UUID NOT NULL DEFAULT pg_catalog\.gen_random_uuid/);
  assert.match(migration, /revoked_at TIMESTAMPTZ/);
  assert.match(migration, /watermark_download_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /uq_video_share_links_public_id/);
  assert.doesNotMatch(migration, /provider_url|artifact_key|storage_key|playback_url/i);
  assert.doesNotMatch(runner, /021_video_share_links/);
});

test("021 postflight is read-only and proves ownership and catalog integrity", () => {
  assert.match(postflight, /BEGIN READ ONLY;/);
  for (const token of ["video_share_links is missing", "an invalid public index remains", "an unvalidated public constraint remains", "a share link does not match its owner video job"]) assert.match(postflight, new RegExp(token));
  assert.doesNotMatch(postflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\b/i);
});
