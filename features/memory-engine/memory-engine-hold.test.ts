import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("formal chat keeps automatic summaries and ordinary-chat long-term writes out of the first release", () => {
  assert.equal(existsSync("features/memory-engine/summary-engine.ts"), false);
  const index = readFileSync("features/memory-engine/index.ts", "utf8");
  const service = readFileSync("features/memory-engine/memory-engine-service.ts", "utf8");
  const context = readFileSync("features/memory-engine/context-builder.ts", "utf8");

  assert.doesNotMatch(index, /summary-engine/);
  assert.doesNotMatch(service, /SummaryEngine|updateSummary/);
  assert.match(context, /ConfirmedPickupPostgresService/);
  assert.match(context, /const allowedPickups = pickups\.slice\(0, 20\)/);
  assert.match(context, /longTermMemories = allowedPickups\.map\(\(pickup\) => pickup\.organizedText\)/);
  assert.match(context, /confirmedPickupSources = allowedPickups\.map/);
  assert.match(context, /history: \[\]/);
});
