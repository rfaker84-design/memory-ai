import assert from "node:assert/strict";
import test from "node:test";

import {
  companionPrimaryStorageKey,
  companionDay,
  clearCompanionPrimaryPreference,
  dailyCompanionGreeting,
  dailyGreetingMarker,
  isDailyCompanionGreetingDue,
  persistCompanionPrimaryPreference,
  resolveCreatedMemoryCompanionHandoff,
  resolveCompanionPrimaryPreference,
  restoreCompanionPosition,
  selectPrimaryCompanion,
  serializeCompanionPosition,
} from "./companionHomeState";

const memories = [{ id: "first" }, { id: "second" }];

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => { values.delete(key); },
    values,
  };
}

test("companion home restores only an owned preferred TA and never falls back to a multi-memory array order", () => {
  assert.equal(selectPrimaryCompanion(memories, "second")?.id, "second");
  assert.equal(selectPrimaryCompanion(memories, "missing"), null);
  assert.equal(selectPrimaryCompanion([{ id: "only" }], null)?.id, "only");
  assert.equal(selectPrimaryCompanion([], "first"), null);
});

test("primary preference is owner-scoped and a valid legacy value migrates only for its current owner", () => {
  const local = storage({ "memoryai.companion.primary": "second" });
  const result = resolveCompanionPrimaryPreference(memories, "owner-a", local);
  assert.equal(result.memory?.id, "second");
  assert.equal(result.source, "legacy-migrated");
  assert.equal(local.values.get(companionPrimaryStorageKey("owner-a")), "second");
  assert.equal(local.values.has("memoryai.companion.primary"), false);
  assert.equal(resolveCompanionPrimaryPreference(memories, "owner-b", local).memory, null);
});

test("a missing or invalid multi-memory preference requests an explicit choice instead of pinning the newest list entry", () => {
  const local = storage({ "memoryai.companion.primary": "foreign-memory" });
  const result = resolveCompanionPrimaryPreference(memories, "owner-a", local);
  assert.equal(result.memory, null);
  assert.equal(result.needsExplicitChoice, true);
  assert.equal(result.source, "selection-required");
  assert.equal(local.values.has("memoryai.companion.primary"), false);
  assert.equal(local.values.has(companionPrimaryStorageKey("owner-a")), false);
});

test("a one-person owner is selected safely and explicit choices can later be cleared without touching another owner", () => {
  const local = storage();
  const only = resolveCompanionPrimaryPreference([{ id: "only" }], "owner-a", local);
  assert.equal(only.memory?.id, "only");
  assert.equal(local.values.get(companionPrimaryStorageKey("owner-a")), "only");
  persistCompanionPrimaryPreference(local, "owner-b", "other");
  clearCompanionPrimaryPreference(local, "owner-a", "only");
  assert.equal(local.values.has(companionPrimaryStorageKey("owner-a")), false);
  assert.equal(local.values.get(companionPrimaryStorageKey("owner-b")), "other");
});

test("the fixed homepage never turns a single returned memory into an implicit primary", () => {
  const local = storage();
  const result = resolveCompanionPrimaryPreference([{ id: "only" }], "owner-a", local, { allowSingleMemoryFallback: false });
  assert.equal(result.memory, null);
  assert.equal(result.needsExplicitChoice, true);
  assert.equal(result.source, "selection-required");
  assert.equal(local.values.has(companionPrimaryStorageKey("owner-a")), false);
});

test("only the first successfully created TA becomes current automatically", () => {
  const firstStorage = storage();
  const first = resolveCreatedMemoryCompanionHandoff([{ id: "first" }], "owner-a", "first", firstStorage);
  assert.equal(first.autoEnterCompanion, true);
  assert.equal(first.selectedMemoryId, "first");
  assert.equal(firstStorage.values.get(companionPrimaryStorageKey("owner-a")), "first");

  const laterStorage = storage({ [companionPrimaryStorageKey("owner-a")]: "first" });
  const later = resolveCreatedMemoryCompanionHandoff(memories, "owner-a", "second", laterStorage);
  assert.equal(later.autoEnterCompanion, false);
  assert.equal(later.selectedMemoryId, "first");
  assert.equal(laterStorage.values.get(companionPrimaryStorageKey("owner-a")), "first");
});

test("daily companion greeting is shown once per day and selected TA", () => {
  const day = companionDay(new Date(2026, 7, 2));
  const marker = dailyGreetingMarker(day, "first");
  assert.equal(isDailyCompanionGreetingDue(marker, day, "first"), false);
  assert.equal(isDailyCompanionGreetingDue(marker, day, "second"), true);
  assert.equal(isDailyCompanionGreetingDue(marker, "2026-08-03", "first"), true);
});

test("daily companion greeting is transparent and never claims a real TA initiated it", () => {
  const greeting = dailyCompanionGreeting("小林");
  assert.match(greeting, /^AI生成 · 基于你确认的信息：/);
  assert.doesNotMatch(greeting, /我在等你|一直在这里|很快见面|来陪我/);
});

test("companion home restores only a bounded same-day local reading position", () => {
  const stored = serializeCompanionPosition("2026-08-02", 118.6);
  assert.equal(restoreCompanionPosition(stored, "2026-08-02"), 119);
  assert.equal(restoreCompanionPosition(stored, "2026-08-03"), null);
  assert.equal(restoreCompanionPosition('{"day":"2026-08-02","scrollY":-12}', "2026-08-02"), 0);
  assert.equal(restoreCompanionPosition("not-json", "2026-08-02"), null);
});
