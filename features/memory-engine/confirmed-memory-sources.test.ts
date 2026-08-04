import assert from "node:assert/strict";
import test from "node:test";

import { extractConfirmedMemorySources } from "./confirmed-memory-sources";

const first = { id: "11111111-1111-4111-8111-111111111111", sourceKind: "user_confirmed_pickup" as const };
const second = { id: "22222222-2222-4222-8222-222222222222", sourceKind: "user_confirmed_pickup" as const };

test("only an allowlisted source trailer is retained and it never reaches the user reply", () => {
  const result = extractConfirmedMemorySources(
    `我记得那场雨。\n[[MEMORYAI_SOURCES:${first.id},${second.id},${first.id}]]`,
    [first, second],
  );
  assert.equal(result.content, "我记得那场雨。");
  assert.deepEqual(result.sources, [first, second]);
});

test("unknown or malformed provider source markers never create a visible reference", () => {
  const unknown = extractConfirmedMemorySources(
    "我不能确认。\n[[MEMORYAI_SOURCES:33333333-3333-4333-8333-333333333333]]",
    [first],
  );
  assert.equal(unknown.content, "我不能确认。");
  assert.deepEqual(unknown.sources, []);

  const malformed = extractConfirmedMemorySources("普通回复 [[MEMORYAI_SOURCES:not-an-id]]", [first]);
  assert.equal(malformed.content, "普通回复 [[MEMORYAI_SOURCES:not-an-id]]");
  assert.deepEqual(malformed.sources, []);
});
