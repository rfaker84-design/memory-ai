const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const source = readFileSync(join(__dirname, "..", "backup-production.sh"), "utf8");

test("legacy production backup entrypoint cannot claim success without the canonical backup", () => {
  assert.match(source, /set -Eeuo pipefail/);
  assert.match(source, /if \(\( \$# != 0 \)\); then/);
  assert.match(source, /exit 64/);
  assert.match(source, /deprecated; delegating to the canonical PostgreSQL-to-COS backup entrypoint/);
  assert.match(source, /exec "\$script_dir\/backup\/postgresql-to-cos\.sh"/);
  assert.doesNotMatch(source, /placeholder/i);
  assert.doesNotMatch(source, /TODO/);
});
