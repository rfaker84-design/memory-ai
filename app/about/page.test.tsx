import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const about = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../../components/Navbar.tsx", import.meta.url), "utf8");

test("the reachable about surface preserves the frozen first-release truth boundary", () => {
  assert.match(about, /首发不收集声音、不录音，也不提供声音克隆/);
  assert.match(about, /不代表真实人物具有意识、意图或现实行动/);
  assert.match(about, /href="\/"/);
  assert.doesNotMatch(about, /重现亲人的声音|继续陪伴|\/#experience/);
  assert.doesNotMatch(navigation, /href: "#experience"/);
});
