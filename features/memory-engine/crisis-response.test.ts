import assert from "node:assert/strict";
import test from "node:test";

import { CRISIS_RESPONSE, crisisResponseFor } from "./crisis-response";

test("immediate crisis language receives a fixed non-role safety response", () => {
  for (const message of [
    "我不想活了",
    "我活不下去了",
    "我想伤害自己",
    "我准备割腕",
    "我现在要杀了他",
    "有人正在伤害我",
    "我被家暴了",
    "未成年人正在遭受侵害",
  ]) {
    assert.equal(crisisResponseFor(message), CRISIS_RESPONSE);
  }
  assert.equal(crisisResponseFor("我今天很想念妈妈"), null);
  assert.match(CRISIS_RESPONSE, /忆见安全陪伴助手/);
  assert.match(CRISIS_RESPONSE, /紧急服务/);
  assert.match(CRISIS_RESPONSE, /不会替你联系任何人/);
  assert.doesNotMatch(CRISIS_RESPONSE, /我是|妈妈|爸爸/);
});
