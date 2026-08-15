const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "migrations", "029_companion_micro_motion_acknowledgement.sql"), "utf8");
const runner = fs.readFileSync(path.join(root, "..", "scripts", "postgresql", "apply-migrations.sh"), "utf8");

test("acknowledgement adds one companion slot without changing existing rows", () => {
  assert.match(migration, /DROP CONSTRAINT IF EXISTS ck_video_generation_jobs_motion_variant/);
  assert.match(migration, /motion_variant IN \('idle', 'attentive', 'reflective', 'acknowledgement'\)/);
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/);
});

test("candidate acknowledgement migration is not silently added to the production runner", () => {
  assert.doesNotMatch(runner, /029_companion_micro_motion_acknowledgement\.sql/);
});
