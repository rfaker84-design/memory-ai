import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./chat-postgres-datasource.ts", import.meta.url),
  "utf8"
);

test("first-greeting PostgreSQL datasource locks owner scope and persists only assistant completion", () => {
  assert.match(source, /async claimFirstGreeting/);
  assert.match(source, /async completeFirstGreeting/);
  assert.match(source, /async failFirstGreeting/);
  assert.match(source, /lockOwnedMemory/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /memory_first_greetings/);
  assert.match(source, /status: "in_progress"/);
  assert.match(source, /status: "replayed"/);
  assert.match(source, /SET status = 'completed', assistant_message_id/);
  assert.match(source, /SET status = 'failed'/);

  const completion = source.slice(source.indexOf("async completeFirstGreeting"));
  assert.match(completion, /VALUES \(\$1, \$2, \$3, 'assistant', \$4, \$5::jsonb\)/);
  assert.doesNotMatch(completion, /'user'/);
});
