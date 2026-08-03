import assert from "node:assert/strict";
import test from "node:test";

import {
  appendConfirmedCorrection,
  createReplyCorrectionSuggestion,
} from "./memoryReplyCorrection";

test("correction suggestion only reflects the user's supplied correction", () => {
  const result = createReplyCorrectionSuggestion(
    "TA 不会这样说",
    "她会更克制地表达关心",
    "我一直在等你",
  );

  assert.deepEqual(result, {
    field: "speechStyle",
    text: "用户已确认：不要使用与“我一直在等你”相近的表达；更合适的方式是：她会更克制地表达关心",
  });
});

test("empty detail never produces a guessed correction", () => {
  assert.equal(createReplyCorrectionSuggestion("语气不对", "   ", "任何回复"), null);
});

test("confirmed corrections preserve the existing formal profile", () => {
  assert.equal(
    appendConfirmedCorrection("说话简洁", "用户已确认的表达偏好：温和"),
    "说话简洁\n\n用户已确认的表达偏好：温和",
  );
});
