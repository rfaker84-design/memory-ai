import assert from "node:assert/strict";
import test from "node:test";

import { clearPresentationCache } from "./clearPresentationCache";

function storage(...keys: string[]) {
  const values = new Map(keys.map((key) => [key, "value"]));
  return {
    get length() { return values.size; },
    key(index: number) { return Array.from(values.keys())[index] ?? null; },
    removeItem(key: string) { values.delete(key); },
    values,
  };
}

test("presentation cache clearing removes only display keys and preserves safe recovery records", () => {
  const local = storage("memoryai.companion.primary", "memoryai.companion.daily-greeting", "memoryai.companion.position", "yj_emo_state", "memoryai:create-memory:draft:v1", "memoryai:create-recovery:v1", "unrelated-key");
  const session = storage("memoryai:static-brand-launch-seen", "memoryai.pickup-hint:session-1", "memoryai:create-recovery:v1");

  assert.equal(clearPresentationCache(local, session), 6);
  assert.equal(local.values.has("memoryai.companion.primary"), false);
  assert.equal(local.values.has("yj_emo_state"), false);
  assert.equal(session.values.has("memoryai:static-brand-launch-seen"), false);
  assert.equal(session.values.has("memoryai.pickup-hint:session-1"), false);
  assert.equal(local.values.has("memoryai:create-memory:draft:v1"), true);
  assert.equal(local.values.has("memoryai:create-recovery:v1"), true);
  assert.equal(session.values.has("memoryai:create-recovery:v1"), true);
  assert.equal(local.values.has("unrelated-key"), true);
});
