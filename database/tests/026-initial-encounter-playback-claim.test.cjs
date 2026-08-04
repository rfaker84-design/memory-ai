const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

test("Migration 026 keeps first-encounter claims manual-only and unique per job", () => {
  const sql = readFileSync("database/migrations/026_initial_encounter_playback_claim.sql", "utf8");
  assert.match(sql, /CANDIDATE ONLY/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.initial_encounter_playback_claims/);
  assert.match(sql, /job_id UUID PRIMARY KEY/);
  assert.match(sql, /FOREIGN KEY \(memory_id, user_id\) REFERENCES public\.memories/);
  assert.match(sql, /ix_initial_encounter_claims_owner_memory/);
  assert.match(sql, /do not add to an automatic runner/i);
});
