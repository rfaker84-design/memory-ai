import assert from "node:assert/strict";
import test from "node:test";

import { pickupDeleteWasPersisted, pickupEditWasPersisted } from "./pickupRecovery";

const pickup = { id: "pickup-1", originalText: "原话", organizedText: "整理稿" };

test("pickup recovery confirms an edit only when both user-visible texts match", () => {
  assert.equal(pickupEditWasPersisted([pickup], pickup), true);
  assert.equal(pickupEditWasPersisted([{ ...pickup, organizedText: "旧整理稿" }], pickup), false);
});

test("pickup recovery confirms a delete only after a read shows the item absent", () => {
  assert.equal(pickupDeleteWasPersisted([], pickup.id), true);
  assert.equal(pickupDeleteWasPersisted([pickup], pickup.id), false);
});
