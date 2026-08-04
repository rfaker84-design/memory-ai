import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./crisis-support-escalation.ts", import.meta.url), "utf8");

test("crisis escalation counts accepted contacts only as internal queue context", () => {
  assert.match(source, /to_regclass\('public\.crisis_contact_consents'\) IS NULL THEN '0'/);
  assert.match(source, /status='accepted'/);
  assert.match(source, /No message content retained/);
  assert.match(source, /No external delivery claimed/);
  assert.doesNotMatch(source, /phone|sms|webhook|fetch\(/i);
});
