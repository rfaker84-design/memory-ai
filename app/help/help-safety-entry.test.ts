import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const help = readFileSync("app/help/page.tsx", "utf8");
const profile = readFileSync("app/(continuity)/continuity/page.tsx", "utf8");

test("help and profile expose the user-controlled crisis-support setting without promising external contact", () => {
  assert.match(help, /href="\/settings\/companion"/);
  assert.match(help, /陪伴安全设置/);
  assert.match(profile, /label:"陪伴安全设置"/);
  assert.equal((profile.match(/陪伴安全设置/g) ?? []).length, 1);
  assert.match(profile, /router\.push\("\/settings\/companion"\)/);
  assert.doesNotMatch(help, /已经联系.*外部|已通知.*外部/);
});
