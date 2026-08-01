import assert from "node:assert/strict";
import test from "node:test";

import { hasValidInternalAccessToken } from "./internal-access-token";

const name = "INTERNAL_TOKEN";
const current = "c".repeat(48);
const previous = "p".repeat(48);
const now = new Date("2026-08-02T00:00:00.000Z");

test("internal control tokens accept one current or short-lived previous value only", () => {
  const environment = {
    [name]: current,
    [`${name}_PREVIOUS`]: previous,
    [`${name}_PREVIOUS_VALID_UNTIL`]: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
  };
  assert.equal(hasValidInternalAccessToken({ candidate: current, currentName: name, minimumBytes: 48, environment, now }), true);
  assert.equal(hasValidInternalAccessToken({ candidate: previous, currentName: name, minimumBytes: 48, environment, now }), true);
  assert.equal(hasValidInternalAccessToken({ candidate: "x".repeat(48), currentName: name, minimumBytes: 48, environment, now }), false);
});

test("internal control token rotation fails closed for an incomplete, expired, long, weak, or duplicate previous value", () => {
  for (const environment of [
    { [name]: current, [`${name}_PREVIOUS`]: previous },
    { [name]: current, [`${name}_PREVIOUS`]: previous, [`${name}_PREVIOUS_VALID_UNTIL`]: new Date(now.getTime() - 1).toISOString() },
    { [name]: current, [`${name}_PREVIOUS`]: previous, [`${name}_PREVIOUS_VALID_UNTIL`]: new Date(now.getTime() + 15 * 60 * 1000 + 1).toISOString() },
    { [name]: current, [`${name}_PREVIOUS`]: "short", [`${name}_PREVIOUS_VALID_UNTIL`]: new Date(now.getTime() + 60_000).toISOString() },
    { [name]: current, [`${name}_PREVIOUS`]: current, [`${name}_PREVIOUS_VALID_UNTIL`]: new Date(now.getTime() + 60_000).toISOString() },
  ]) {
    assert.equal(hasValidInternalAccessToken({ candidate: current, currentName: name, minimumBytes: 48, environment, now }), false);
  }
});
