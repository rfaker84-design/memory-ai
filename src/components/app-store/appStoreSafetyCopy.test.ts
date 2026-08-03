import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = [
  readFileSync(new URL("./AppStoreShowcase.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("./AppStoreScreens.tsx", import.meta.url), "utf8"),
];

test("app-store artwork carries durable AI disclosure and avoids revival or dependency claims", () => {
  for (const source of sources) {
    assert.match(source, /AI生成 · 基于已确认资料/);
    assert.match(source, /思念可以被温柔记录/);
    assert.doesNotMatch(source, /我一直在你身边|我一直都在|从未真正离开|再次和他们对话/);
  }
});
