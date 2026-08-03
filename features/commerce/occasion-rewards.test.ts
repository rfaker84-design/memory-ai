import assert from "node:assert/strict";
import test from "node:test";

import { isOccasionClaimOpen, occasionRewardWindow } from "./occasion-rewards";

test("birthday reward observes a China-time 30 day window without crossing calendar year", () => {
  const window = occasionRewardWindow("birthday", "1990-12-15", new Date("2026-12-15T01:00:00.000Z"));
  assert.deepEqual(window, {
    occasion: "birthday",
    calendarYear: 2026,
    eligibleOn: "2026-12-15",
    claimDeadline: "2026-12-31",
  });
  assert.equal(isOccasionClaimOpen(window!, new Date("2026-12-15T01:00:00.000Z")), true);
  assert.equal(isOccasionClaimOpen(window!, new Date("2027-01-01T01:00:00.000Z")), false);
});

test("Mother's and Father's Day use their fixed annual Sunday rules", () => {
  assert.deepEqual(
    occasionRewardWindow("mothers_day", "1990-01-01", new Date("2026-05-10T03:00:00.000Z")),
    { occasion: "mothers_day", calendarYear: 2026, eligibleOn: "2026-05-10", claimDeadline: "2026-06-08" },
  );
  assert.deepEqual(
    occasionRewardWindow("fathers_day", "1990-01-01", new Date("2026-06-21T03:00:00.000Z")),
    { occasion: "fathers_day", calendarYear: 2026, eligibleOn: "2026-06-21", claimDeadline: "2026-07-20" },
  );
});

test("invalid birthday data cannot create a birthday reward window", () => {
  assert.equal(occasionRewardWindow("birthday", "not-a-date", new Date("2026-08-03T03:00:00.000Z")), null);
});
