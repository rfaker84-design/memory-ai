import assert from "node:assert/strict";
import test from "node:test";

import {
  LOGIN_AGREEMENT_NOTICE,
  WECHAT_AUTH_START_PATH,
  WECHAT_AUTH_STATUS_PATH,
  WECHAT_AUTH_UNAVAILABLE_NOTICE,
  loadWeChatProviderState,
  resolveWeChatLoginAction,
  smsSendFailureNotice,
} from "./loginExperienceClient";

test("WeChat provider status accepts only the frozen safe response", async () => {
  let requestedPath = "";
  const available = await loadWeChatProviderState(async (input, init) => {
    requestedPath = String(input);
    assert.equal(init?.method, "GET");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.cache, "no-store");
    return Response.json({ provider: "wechat", available: true });
  });

  assert.equal(requestedPath, WECHAT_AUTH_STATUS_PATH);
  assert.equal(available, "available");
  assert.equal(
    await loadWeChatProviderState(async () => Response.json({ provider: "wechat", available: false })),
    "unavailable",
  );
  assert.equal(
    await loadWeChatProviderState(async () => Response.json({ available: true })),
    "unavailable",
  );
  assert.equal(
    await loadWeChatProviderState(async () => new Response(null, { status: 503 })),
    "unavailable",
  );
});

test("agreement and provider guards never invent a WeChat success path", () => {
  assert.deepEqual(resolveWeChatLoginAction(false, "available"), {
    type: "notice",
    message: LOGIN_AGREEMENT_NOTICE,
  });
  assert.deepEqual(resolveWeChatLoginAction(true, "unavailable"), {
    type: "notice",
    message: WECHAT_AUTH_UNAVAILABLE_NOTICE,
  });
  assert.equal(resolveWeChatLoginAction(true, "checking").type, "notice");
  assert.deepEqual(resolveWeChatLoginAction(true, "available"), {
    type: "navigate",
    href: WECHAT_AUTH_START_PATH,
  });
});

test("SMS error states keep explicit invalid, limited, and unavailable messages", () => {
  assert.equal(smsSendFailureNotice(400), "请输入有效的中国大陆手机号。");
  assert.equal(smsSendFailureNotice(429), "请求过于频繁，请稍后再试。");
  assert.equal(smsSendFailureNotice(503), "短信登录暂时不可用，请稍后重试。");
});
