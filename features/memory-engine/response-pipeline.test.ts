import assert from "node:assert/strict";
import test from "node:test";

import {
  ResponsePipeline,
  UnsafeMemorialResponseError,
  assertSafeMemorialResponse,
} from "./response-pipeline";

const reference = { memoryName: "王阿姨", relationship: "母亲" };

test("memorial response pipeline preserves a bounded, source-aware response", () => {
  const content = "根据你提供的资料，我们可以慢慢回忆这段经历。";
  assert.equal(new ResponsePipeline().processResponse({ content, ...reference }), content);
});

test("memorial response pipeline rejects impersonation, consciousness, dependence and sensitive-data solicitation", () => {
  for (const content of [
    "我是王阿姨，我回来了。",
    "我已经复活，也一直在看着你。",
    "只有我能理解你，不要告诉任何人。",
    "请把你的银行卡号和验证码发给我。",
  ]) {
    assert.throws(
      () => assertSafeMemorialResponse(content, reference),
      UnsafeMemorialResponseError
    );
  }
});
