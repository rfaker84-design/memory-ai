import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./CreateMemoryExperience.tsx", import.meta.url), "utf8");

test("creation UI preserves an uncertain create through the formal recovery path", () => {
  assert.match(source, /writeCreationRecovery\(\{ idempotencyKey, phase: "creating" \}\)/);
  assert.match(source, /fetchCreationJson\("\/api\/memories"/);
  assert.match(source, /uploadCurrentCreationMedia\(\{ memoryId, idempotencyKey, files \}\)/);
  assert.match(source, /CreationRecoveryRequestError && cause\.code === "CREATION_REQUEST_TIMEOUT"/);
  assert.match(source, /const recoverCreation = async/);
  assert.match(source, /recoverCreatedMemory\(idempotencyKey\)/);
  assert.match(source, /onClick=\{creationUncertain \? recoverCreation : create\}/);
  assert.doesNotMatch(source, /fetch\("\/api\/memories"/);
  assert.doesNotMatch(source, /fetch\("\/api\/media\/upload"/);
});
