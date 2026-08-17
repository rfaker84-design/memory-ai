import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  clearPersistedCreateMemoryDraft,
  CREATE_MEMORY_DRAFT_STORAGE_KEY,
  CREATE_MEMORY_IDEMPOTENCY_STORAGE_KEY,
} from "./useCreateMemoryDraft";

function memoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
    values,
  };
}

test("clearing a creation draft removes only the draft and its idempotency key", () => {
  const primary = "memoryai.companion.primary:owner-1";
  const storage = memoryStorage({
    [CREATE_MEMORY_DRAFT_STORAGE_KEY]: '{"name":"妈妈"}',
    [CREATE_MEMORY_IDEMPOTENCY_STORAGE_KEY]: "memory-1234567890",
    [primary]: "5c3b8d99-ab5f-4674-a95f-93d027589d40",
  });

  assert.equal(clearPersistedCreateMemoryDraft(storage), true);
  assert.equal(storage.getItem(CREATE_MEMORY_DRAFT_STORAGE_KEY), null);
  assert.equal(storage.getItem(CREATE_MEMORY_IDEMPOTENCY_STORAGE_KEY), null);
  assert.equal(storage.getItem(primary), "5c3b8d99-ab5f-4674-a95f-93d027589d40");
});

test("clear cancels a queued autosave and suppresses persistence until the next explicit edit", () => {
  const source = readFileSync(new URL("./useCreateMemoryDraft.ts", import.meta.url), "utf8");
  assert.match(source, /const autosaveTimer = useRef<number \| null>\(null\);/);
  assert.match(source, /const persistenceSuppressed = useRef\(false\);/);
  assert.match(source, /if \(!hydrated\.current \|\| persistenceSuppressed\.current\) return;/);
  assert.match(source, /if \(persistenceSuppressed\.current\) return;/);
  assert.match(source, /persistenceSuppressed\.current = true;[\s\S]{0,240}?window\.clearTimeout\(autosaveTimer\.current\)/);
  assert.match(source, /if \(persistenceSuppressed\.current\) \{[\s\S]{0,240}?persistenceSuppressed\.current = false;/);
});
