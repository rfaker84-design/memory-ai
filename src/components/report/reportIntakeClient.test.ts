import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { prepareReportSubmission, type ReportDraft } from "./reportIntakeClient";

const draft: ReportDraft = {
  category: "rights",
  requestedAction: "review",
  details: "Please review this content concern.",
};

test("an unconfirmed report retry reuses only the exact in-memory draft key", () => {
  let calls = 0;
  const createKey = () => `report-test-key-${++calls}`;
  const first = prepareReportSubmission(null, draft, createKey);
  assert.equal(first.idempotencyKey, "report-test-key-1");
  assert.equal(prepareReportSubmission(first, { ...draft }, createKey), first);
  const changed = prepareReportSubmission(first, { ...draft, details: "A different concern." }, createKey);
  assert.equal(changed.idempotencyKey, "report-test-key-2");
  assert.notEqual(changed, first);
});

test("report retry recovery never persists complaint text to browser storage", () => {
  const source = readFileSync(new URL("./reportIntakeClient.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
