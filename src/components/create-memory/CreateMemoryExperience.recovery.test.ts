import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./CreateMemoryExperience.tsx", import.meta.url), "utf8");

test("creation UI preserves an uncertain create through the formal recovery path", () => {
  assert.match(source, /writeCreationRecovery\(\{ idempotencyKey, phase: "creating" \}\)/);
  assert.match(source, /fetchCreationJson\("\/api\/memories"/);
  assert.match(source, /const files = photo \? \{ photo \} : \{\};/);
  assert.match(source, /uploadCurrentCreationMedia\(\{ memoryId: memory\.id, idempotencyKey, files \}\)/);
  assert.match(source, /CreationRecoveryRequestError && cause\.code === "CREATION_REQUEST_TIMEOUT"/);
  assert.match(source, /const recoverCreation = async/);
  assert.match(source, /recoverCreatedMemory\(idempotencyKey\)/);
  assert.match(source, /onClick=\{creationUncertain \? recoverCreation : create\}/);
  assert.doesNotMatch(source, /fetch\("\/api\/memories"/);
  assert.doesNotMatch(source, /fetch\("\/api\/media\/upload"/);
});

test("a known memory limit is terminal, while unknown creation outcomes remain recoverable", () => {
  assert.match(source, /const memoryLimitReached = cause instanceof Error && cause\.message === "MEMORY_LIMIT_REACHED"/);
  assert.match(source, /if \(memoryLimitReached\) \{[\s\S]{0,240}?clear\(\);[\s\S]{0,240}?clearCreationRecovery\(\);[\s\S]{0,240}?setCreationUncertain\(false\);/);
  assert.match(source, /else \{[\s\S]{0,320}?CreationRecoveryRequestError && cause\.code === "CREATION_REQUEST_TIMEOUT"/);
});

test("an explicit exit discards local creation state before returning to the home route", () => {
  assert.match(source, /const exitCreateFlow = \(\) => \{[\s\S]{0,240}?clear\(\);[\s\S]{0,240}?clearCreationRecovery\(\);[\s\S]{0,240}?router\.replace\("\/"\);/);
  assert.match(source, /onClick=\{\(\) => stage === 0 \? exitCreateFlow\(\) : setStage\(0\)\}/);
  assert.doesNotMatch(source, /stage === 0 \? router\.back\(\) : setStage\(0\)/);
});
