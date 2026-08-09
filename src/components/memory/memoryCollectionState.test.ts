import assert from "node:assert/strict";
import test from "node:test";

import { buildConfirmedMemoryCollection, memoryCollectionTitle } from "./memoryCollectionState";

test("confirmed records receive a stable display title and are ordered by the latest confirmed update", () => {
  assert.equal(memoryCollectionTitle("- 下雨天，妈妈会来接我。\n- 她总带一把蓝伞。"), "下雨天，妈妈会来接我。");
  assert.equal(memoryCollectionTitle(""), "一段已确认的记忆");
  assert.equal(memoryCollectionTitle("一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十"), "一二三四五六七八九十一二三四五六七八九十一二三四…");

  const items = buildConfirmedMemoryCollection(
    [{ id: "memory-a", name: "妈妈", relationship: "母亲" }],
    new Map([["memory-a", [
      { id: "older", originalText: "旧原话", organizedText: "旧记忆", createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z" },
      { id: "newer", originalText: "新原话", organizedText: "新记忆", createdAt: "2026-08-02T00:00:00Z", updatedAt: "2026-08-02T00:00:00Z" },
    ]]]),
  );
  assert.deepEqual(items.map((item) => item.id), ["newer", "older"]);
  assert.equal(items[0]?.memoryName, "妈妈");
  assert.equal(items[0]?.title, "新记忆");
});
