import assert from "node:assert/strict";
import test from "node:test";

import {
  assertProductCapabilityEnabled,
  ProductCapabilityUnavailableError,
} from "./product-capability-gate";

test("product capability gates preserve defaults and fail closed when disabled or malformed", () => {
  assert.doesNotThrow(() => assertProductCapabilityEnabled("video_generation", {}));
  assert.doesNotThrow(() => assertProductCapabilityEnabled("commerce_purchase", {
    YIJIAN_COMMERCE_PURCHASE_ENABLED: "true",
  }));
  for (const [capability, environment, code] of [
    ["video_generation", { YIJIAN_VIDEO_GENERATION_ENABLED: "false" }, "VIDEO_GENERATION_DISABLED"],
    ["commerce_purchase", { YIJIAN_COMMERCE_PURCHASE_ENABLED: "False" }, "COMMERCE_PURCHASES_DISABLED"],
  ] as const) {
    assert.throws(
      () => assertProductCapabilityEnabled(capability, environment),
      (error: unknown) => error instanceof ProductCapabilityUnavailableError && error.code === code,
    );
  }
});
