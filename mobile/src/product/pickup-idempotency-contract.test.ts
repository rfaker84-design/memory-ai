import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");

test("native pickup keeps one idempotency key for an unchanged uncertain submission", () => {
  assert.match(app, /pickupRequestIdempotencyKey \?\? pickupRequestKey\(\)/);
  assert.match(app, /setPickupRequestIdempotencyKey\(idempotencyKey\)/);
  assert.match(app, /confirmPickup\(memory\.id, input, idempotencyKey\)/);
  assert.match(api, /confirmPickup\(memoryId: string, input: \{ originalText: string; organizedText: string \}, idempotencyKey: string\)/);
  assert.match(api, /"Idempotency-Key": idempotencyKey/);
});
