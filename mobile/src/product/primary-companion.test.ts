import assert from "node:assert/strict";
import test from "node:test";

import { selectPrimaryCompanion } from "./primary-companion";

const memories = [{ id: "incomplete", photoAssetId: null }, { id: "first", photoAssetId: "asset-1" }, { id: "second", photoAssetId: "asset-2" }];

test("stored mobile primary companion is used only when it is in the freshly owner-scoped list", () => {
  assert.equal(selectPrimaryCompanion(memories, "second")?.id, "second");
  assert.equal(selectPrimaryCompanion(memories, "foreign")?.id, "first");
  assert.equal(selectPrimaryCompanion([], "second"), null);
});
