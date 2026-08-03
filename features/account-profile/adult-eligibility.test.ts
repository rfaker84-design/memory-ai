import assert from "node:assert/strict";
import test from "node:test";

import { adultEligibilityError, isAtLeast18, isIsoCalendarDate } from "./adult-eligibility";

const now = new Date("2026-08-03T12:00:00.000Z");

test("birth dates are real calendar dates", () => {
  assert.equal(isIsoCalendarDate("2008-02-29"), true);
  assert.equal(isIsoCalendarDate("2007-02-29"), false);
  assert.equal(isIsoCalendarDate("2008-13-01"), false);
});

test("adult eligibility uses the birthday boundary", () => {
  assert.equal(isAtLeast18("2008-08-03", now), true);
  assert.equal(isAtLeast18("2008-08-04", now), false);
  assert.equal(adultEligibilityError("2008-08-04", now), "ADULT_ELIGIBILITY_REQUIRED");
  assert.equal(adultEligibilityError("2007-02-29", now), "INVALID_BIRTH_DATE");
});
