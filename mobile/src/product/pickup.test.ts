import assert from "node:assert/strict";
import test from "node:test";

import { mayConfirmPickup, pickupDraft } from "./pickup";

test("native pickup only becomes confirmable after an explicit owner confirmation", () => {
  assert.equal(mayConfirmPickup("原话", "整理稿", false), false);
  assert.equal(mayConfirmPickup("原话", "", true), false);
  assert.equal(mayConfirmPickup("原话", "整理稿", true), true);
});

test("native pickup draft preserves all user sentences without inventing details", () => {
  assert.equal(pickupDraft("春天一起散步。后来去吃面。"), "- 春天一起散步。\n- 后来去吃面。");
});
