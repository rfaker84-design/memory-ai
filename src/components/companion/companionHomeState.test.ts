import assert from "node:assert/strict";
import test from "node:test";

import {
  companionDay,
  dailyGreetingMarker,
  isDailyCompanionGreetingDue,
  restoreCompanionPosition,
  selectPrimaryCompanion,
  serializeCompanionPosition,
} from "./companionHomeState";

const memories = [{ id: "first" }, { id: "second" }];

test("companion home restores an owned preferred TA and safely falls back", () => {
  assert.equal(selectPrimaryCompanion(memories, "second")?.id, "second");
  assert.equal(selectPrimaryCompanion(memories, "missing")?.id, "first");
  assert.equal(selectPrimaryCompanion([], "first"), null);
});

test("daily companion greeting is shown once per day and selected TA", () => {
  const day = companionDay(new Date(2026, 7, 2));
  const marker = dailyGreetingMarker(day, "first");
  assert.equal(isDailyCompanionGreetingDue(marker, day, "first"), false);
  assert.equal(isDailyCompanionGreetingDue(marker, day, "second"), true);
  assert.equal(isDailyCompanionGreetingDue(marker, "2026-08-03", "first"), true);
});

test("companion home restores only a bounded same-day local reading position", () => {
  const stored = serializeCompanionPosition("2026-08-02", 118.6);
  assert.equal(restoreCompanionPosition(stored, "2026-08-02"), 119);
  assert.equal(restoreCompanionPosition(stored, "2026-08-03"), null);
  assert.equal(restoreCompanionPosition('{"day":"2026-08-02","scrollY":-12}', "2026-08-02"), 0);
  assert.equal(restoreCompanionPosition("not-json", "2026-08-02"), null);
});
