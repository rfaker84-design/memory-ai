import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("privacy disclosure distinguishes content deletion, backup rotation, financial isolation and unresolved provider receipts", () => {
  for (const expected of ["7 天", "30 天", "90 天", "删除墓碑", "legal hold", "Vidu", "供应商", "中国大陆律师和会计复核"]) {
    assert.match(source, new RegExp(expected));
  }
  assert.match(source, /href="\/report"/);
  assert.match(source, /href="\/authorization"/);
});
