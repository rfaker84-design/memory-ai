import assert from "node:assert/strict";
import test from "node:test";

import { buildConfirmedMemoryProfile } from "./confirmedMemoryProfile";

test("confirmed minimum persona facts map only into the existing Memory profile and fragments", () => {
  assert.deepEqual(
    buildConfirmedMemoryProfile({
      preferredAddress: "妈妈",
      catchPhrases: "别着急，慢慢来。",
      speechStyle: "先安慰再给建议。",
      sharedMemory: "我们一起在厨房做生日面。",
    }),
    {
      personalityProfile: "用户确认 TA 称呼自己为：妈妈。",
      catchPhrases: "别着急，慢慢来。",
      speechStyle: "先安慰再给建议。",
      lifeStory: "我们一起在厨房做生日面。",
      fragments: [
        { sourceType: "confirmed_user_address", content: "TA 称呼用户为：妈妈" },
        { sourceType: "shared_memory", content: "我们一起在厨房做生日面。" },
      ],
    }
  );
});
