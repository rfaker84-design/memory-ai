import assert from "node:assert/strict";
import test from "node:test";

import { FreeChatAdmissionConfigurationError, configuredDailyLimit } from "./free-chat-daily-admission";

test("free chat daily admission requires an explicit bounded runtime limit", () => {
  assert.throws(
    () => configuredDailyLimit({}),
    (error: unknown) => error instanceof FreeChatAdmissionConfigurationError
      && error.code === "FREE_CHAT_DAILY_LIMIT_NOT_CONFIGURED",
  );
  assert.throws(
    () => configuredDailyLimit({ MEMORYAI_FREE_CHAT_DAILY_LIMIT: "0" }),
    (error: unknown) => error instanceof FreeChatAdmissionConfigurationError
      && error.code === "FREE_CHAT_DAILY_LIMIT_INVALID",
  );
  assert.throws(
    () => configuredDailyLimit({ MEMORYAI_FREE_CHAT_DAILY_LIMIT: "201" }),
    (error: unknown) => error instanceof FreeChatAdmissionConfigurationError
      && error.code === "FREE_CHAT_DAILY_LIMIT_INVALID",
  );
  assert.throws(
    () => configuredDailyLimit({ MEMORYAI_FREE_CHAT_DAILY_LIMIT: "999999" }),
    (error: unknown) => error instanceof FreeChatAdmissionConfigurationError
      && error.code === "FREE_CHAT_DAILY_LIMIT_INVALID",
  );
  assert.equal(configuredDailyLimit({ MEMORYAI_FREE_CHAT_DAILY_LIMIT: "80" }), 80);
  assert.equal(configuredDailyLimit({ MEMORYAI_FREE_CHAT_DAILY_LIMIT: "200" }), 200);
});
