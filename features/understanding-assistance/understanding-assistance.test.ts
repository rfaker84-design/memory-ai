import assert from "node:assert/strict";
import test from "node:test";

import { assistanceExplanation, blockedHighRiskResponse, hasExplicitAssistanceRequest, isHighRiskOperation, shouldOfferAssistanceAfterConfirmationFailures } from "./understanding-assistance";

test("understanding assistance reacts only to a direct request, not grief, age, typos, or emotion", () => {
  for (const ordinaryConversation of ["我很想她", "我七十多岁了", "我今天打字很慢", "我好难过", "我不知到怎么说"]) {
    assert.equal(hasExplicitAssistanceRequest(ordinaryConversation), false, ordinaryConversation);
  }
  assert.equal(hasExplicitAssistanceRequest("我看不懂这是什么意思，请帮我解释一次"), true);
  assert.equal(hasExplicitAssistanceRequest("我无法自己决定，需要可信任的人帮助"), true);
});

test("the high-risk response explains choices without medical or legal diagnosis", () => {
  const response = blockedHighRiskResponse("account_deletion");
  assert.deepEqual(response.actions, ["EXPLAIN_AGAIN", "DO_NOT_PROCEED", "TRUSTED_PERSON_ASSISTANCE"]);
  assert.match(assistanceExplanation, /不会替你判断/);
  assert.doesNotMatch(JSON.stringify(response), /心智能力|精神|诊断|行为能力/);
  assert.equal(isHighRiskOperation("purchase"), true);
  assert.equal(isHighRiskOperation("free_chat"), false);
});

test("only repeated failed confirmations of a high-risk operation offer assistance", () => {
  assert.equal(shouldOfferAssistanceAfterConfirmationFailures({ operation: "purchase", failedConfirmations: 2 }), false);
  assert.equal(shouldOfferAssistanceAfterConfirmationFailures({ operation: "purchase", failedConfirmations: 3 }), true);
  assert.equal(shouldOfferAssistanceAfterConfirmationFailures({ operation: "free_chat", failedConfirmations: 99 }), false);
});
