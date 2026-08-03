import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { sourceAuditFiles } from "@/scripts/security/source-audit-files";

const forbidden = [
  /href\s*=\s*["']#(?:["']|\s)/,
  /href\s*=\s*["']javascript:/i,
  /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/,
  /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*undefined\s*\}/,
];

test("reachable web and mobile React sources contain no dead links or empty click controls", () => {
  const files = sourceAuditFiles().filter((file) => (
    (/^(?:app|src\/components|mobile\/src)\/.+\.tsx?$/.test(file))
    && !/\.test\.tsx?$/.test(file)
  ));
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const expression of forbidden) assert.doesNotMatch(source, expression, file);
  }
});
