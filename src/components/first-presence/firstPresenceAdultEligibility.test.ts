import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./FirstPresenceFlow.tsx", import.meta.url), "utf8");

test("the primary first-presence route saves and verifies adult eligibility before it records creation consent", () => {
  assert.match(source, /import \{ AccountProfileRequestError, saveAdultBirthDate \} from "\.\.\/trust\/accountProfileClient"/);
  assert.match(source, /<SceneField type="date" label="你的出生日期"/);
  assert.match(source, /questionIndex === 7 && !birthDate/);
  assert.match(source, /const adultProfile = await saveAdultBirthDate\(birthDate\);[\s\S]*?if \(!adultProfile\.adultEligible\) throw new AccountProfileRequestError\("ADULT_ELIGIBILITY_REQUIRED"\);[\s\S]*?await recordTrustConsent\("adult_eligibility"\)/);
  assert.match(source, /cause instanceof AccountProfileRequestError/);
});
