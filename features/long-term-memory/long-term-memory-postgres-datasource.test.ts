import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./long-term-memory-postgres-datasource.ts", import.meta.url),
  "utf8"
);

test("PostgreSQL LTM validates ownership through memories and persists no external user field", () => {
  assert.match(source, /JOIN users u ON u\.id = m\.user_id/);
  assert.match(source, /WHERE m\.id = \$1 AND u\.external_id = \$2/);
  assert.match(source, /FOR KEY SHARE OF m/);
  assert.doesNotMatch(source, /INSERT INTO long_term_memories \([^)]*user_id/i);
  assert.doesNotMatch(source, /external_user_id/);
});

test("PostgreSQL LTM deduplicates by memory, source type, and content hash", () => {
  assert.match(source, /createHash\("sha256"\)\.update\(content\)\.digest\("hex"\)/);
  assert.match(source, /ON CONFLICT \(memory_id, source_type, content_hash\) DO NOTHING/);
  assert.match(source, /WHERE memory_id = \$1 AND source_type = \$2 AND content_hash = \$3/);
});

test("PostgreSQL LTM recall is owner-isolated and ranks relevance before importance and time", () => {
  const recall = source.slice(source.indexOf("async recall"));
  assert.match(recall, /JOIN memories m ON m\.id = l\.memory_id/);
  assert.match(recall, /WHERE l\.memory_id = \$1 AND u\.external_id = \$2/);
  assert.match(recall, /FROM unnest\(\$3::text\[\]\) AS keyword/);
  assert.match(recall, /ORDER BY relevance_score DESC, l\.importance DESC, l\.created_at DESC/);
  assert.match(recall, /LIMIT \$4/);
});

test("PostgreSQL LTM view, correction, and deletion remain owner and memory scoped", () => {
  const list = source.slice(source.indexOf("async list"), source.indexOf("async update"));
  const update = source.slice(source.indexOf("async update"), source.indexOf("async delete"));
  const deletion = source.slice(source.indexOf("async delete"));
  assert.match(list, /u\.external_id = \$2/);
  assert.match(update, /l\.id = \$1 AND l\.memory_id = \$2/);
  assert.match(update, /u\.external_id = \$3/);
  assert.match(update, /userCorrected/);
  assert.match(deletion, /DELETE FROM long_term_memories l/);
  assert.match(deletion, /u\.external_id = \$3/);
});
