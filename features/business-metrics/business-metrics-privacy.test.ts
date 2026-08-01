import assert from "node:assert/strict";
import test from "node:test";

import { aggregateFunnelReport, BUSINESS_METRICS_MINIMUM_COHORT_SIZE } from "./business-metrics-postgres-datasource";

const from = new Date("2026-08-01T00:00:00.000Z");
const to = new Date("2026-08-02T00:00:00.000Z");

test("business funnel suppresses non-zero cohorts below the privacy minimum", () => {
  const report = aggregateFunnelReport({
    from,
    to,
    counts: new Map([["login_completed", 4], ["memory_created", 3], ["first_greeting_viewed", 0]]),
  });
  assert.equal(report.minimumCohortSize, BUSINESS_METRICS_MINIMUM_COHORT_SIZE);
  assert.deepEqual(report.steps.slice(0, 3), [
    { event: "login_completed", users: null, suppressed: true, conversionFromPrevious: null, conversionFromLogin: null },
    { event: "memory_created", users: null, suppressed: true, conversionFromPrevious: null, conversionFromLogin: null },
    { event: "first_greeting_viewed", users: 0, suppressed: false, conversionFromPrevious: null, conversionFromLogin: null },
  ]);
});

test("business funnel calculates rates only for visible aggregate cohorts", () => {
  const report = aggregateFunnelReport({
    from,
    to,
    counts: new Map([["login_completed", 10], ["memory_created", 5], ["first_greeting_viewed", 7]]),
  });
  assert.deepEqual(report.steps.slice(0, 3), [
    { event: "login_completed", users: 10, suppressed: false, conversionFromPrevious: null, conversionFromLogin: 1 },
    { event: "memory_created", users: 5, suppressed: false, conversionFromPrevious: 0.5, conversionFromLogin: 0.5 },
    { event: "first_greeting_viewed", users: 7, suppressed: false, conversionFromPrevious: 1.4, conversionFromLogin: 0.7 },
  ]);
});
