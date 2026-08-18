import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scene = readFileSync(new URL("./MemoryConversationScene.tsx", import.meta.url), "utf8");

test("reply correction is an honestly non-modal panel with keyboard focus recovery", () => {
  assert.match(scene, /const correctionTriggerRef = useRef<HTMLButtonElement \| null>\(null\)/);
  assert.match(scene, /correctionCloseRef\.current\?\.focus\(\)/);
  assert.match(scene, /event\.key === "Escape" && correctionPhase !== "saving"/);
  assert.match(scene, /queueMicrotask\(\(\) => correctionTriggerRef\.current\?\.focus\(\)\)/);
  assert.match(scene, /role="dialog"/);
  assert.doesNotMatch(scene, /aria-modal="true"/);
});

test("reply correction uses the bounded JSON transport for its owner-only read and write", () => {
  assert.match(scene, /fetchConversationJson\(`\/api\/memories\/\$\{encodeURIComponent\(memoryId\)\}`, \{/);
  assert.match(scene, /method: "PATCH"/);
  assert.doesNotMatch(scene, /const currentResponse = await fetch\(/);
  assert.doesNotMatch(scene, /const updateResponse = await fetch\(/);
});

test("chat presence uses only the approved idle loop", () => {
  assert.match(scene, /variant="idle"/);
  assert.doesNotMatch(scene, /resolveConversationMotionVariant/);
  assert.doesNotMatch(scene, /draft\.trim\(\) \? "attentive"/);
  assert.doesNotMatch(scene, /replyPulse/);
});
