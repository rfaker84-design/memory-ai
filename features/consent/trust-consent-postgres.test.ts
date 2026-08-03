import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { hasAdultBirthDate } from "./trust-consent-postgres";

test("TA-bound consent requires a current server-recorded adult birth date", () => {
  assert.equal(hasAdultBirthDate("2000-01-01"), true);
  assert.equal(hasAdultBirthDate("2010-01-01"), false);
  assert.equal(hasAdultBirthDate(null), false);
  const source = readFileSync(new URL("./trust-consent-postgres.ts", import.meta.url), "utf8");
  assert.match(source, /account\.profile ->> 'birth_date' AS birth_date/);
  assert.match(source, /return hasAdultBirthDate/);
});
