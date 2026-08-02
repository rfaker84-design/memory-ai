import assert from "node:assert/strict";
import test from "node:test";

import {
  companionDay,
  dailyGreetingMarker,
  isDailyCompanionGreetingDue,
  selectPrimaryCompanion,
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
