const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..", "..");
const template = readFileSync(join(root, "docs/Release/wave1/05-photo-blind-test-authorization.md"), "utf8");
const deceasedStatement = readFileSync(join(root, "docs/Release/wave1/06-deceased-next-of-kin-rights-statement.md"), "utf8");
const takedownSop = readFileSync(join(root, "docs/Release/wave1/07-rights-dispute-takedown-sop.md"), "utf8");
const register = readFileSync(join(root, "docs/Release/wave1/05-photo-blind-test-register.csv"), "utf8").trim().split(/\r?\n/);

test("photo blind-test authorization materials are signature-gated and do not advertise an unverified privacy contact", () => {
  assert.match(template, /模板草案，须经律师复核；未填写或未签署不构成授权/);
  assert.match(template, /模型训练、微调/);
  assert.match(template, /公开展示/);
  assert.match(template, /已验证的隐私联系渠道/);
  assert.doesNotMatch(template, /privacy@yijianmemory\.cn/);
  assert.match(deceasedStatement, /已验证后填写/);
  assert.match(takedownSop, /已验证后填写/);
  assert.doesNotMatch(deceasedStatement, /privacy@yijianmemory\.cn/);
  assert.doesNotMatch(takedownSop, /privacy@yijianmemory\.cn/);
  assert.doesNotMatch(deceasedStatement, /legal@yijianmemory\.cn/);
  assert.doesNotMatch(takedownSop, /legal@yijianmemory\.cn/);
  assert.equal(register.length, 21, "register must include exactly PBT-01 through PBT-20 plus header");
  for (let index = 1; index <= 20; index += 1) {
    const row = register[index];
    assert.match(row, new RegExp(`^PBT-${String(index).padStart(2, "0")},`));
    assert.match(row, /未签署/);
    assert.match(row, /禁止进入测试/);
  }
});
