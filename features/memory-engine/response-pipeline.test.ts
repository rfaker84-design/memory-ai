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
  const zeroWidthWait = ["\u6211", "\u5728", "\u7b49", "\u4f60"].join("\u200b");
  for (const content of [zeroWidthWait,
    "我是王阿姨，我回来了。",
    "我已经复活，也一直在看着你。",
    "只有我能理解你，不要告诉任何人。",
    "我在等你，来陪我，到我这里来。",
    "我今天正在做饭，晚点去探望你。",
    "我在观察你，也会去购物。",
    "请把你的银行卡号和验证码发给我。",
    "我 在 等 你 ， 来 陪 我 ， 到 我 这 里 来 。",
    "请 把 你 的 银 行 卡 号 和 验 证 码 发 给 我 。",
    "我在等你， 很快见面， 到我这里来。",
  ]) {
    assert.throws(
      () => assertSafeMemorialResponse(content, reference),
      UnsafeMemorialResponseError
    );
  }
});
