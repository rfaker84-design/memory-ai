export type CompanionHomeMemory = { id: string };

export const COMPANION_PRIMARY_KEY = "memoryai.companion.primary";
export const COMPANION_DAILY_GREETING_KEY = "memoryai.companion.daily-greeting";
export const COMPANION_POSITION_KEY = "memoryai.companion.position";

/**
 * This is presentation preference only. The API still reloads owner-scoped
 * memories before the value is used, so browser storage never grants access.
 */
export type CompanionPrimaryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type CompanionPrimaryResolution<T extends CompanionHomeMemory> = {
  memory: T | null;
  /** Multiple owned memories need an explicit user choice before one becomes primary. */
  needsExplicitChoice: boolean;
  source: "scoped" | "legacy-migrated" | "single-memory" | "selection-required";
};

/**
 * The browser preference is deliberately scoped to the current Owner. A
 * selected person is presentation state, but it must never leak across two
 * accounts which happen to use the same browser profile.
 */
export function companionPrimaryStorageKey(ownerId: string): string {
  return `${COMPANION_PRIMARY_KEY}:${ownerId.trim()}`;
}

function readStorage(storage: CompanionPrimaryStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: CompanionPrimaryStorage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // A presentation preference must not block an owned-memory page.
  }
}

function removeStorage(storage: CompanionPrimaryStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // A stale display preference must not block an owned-memory page.
  }
}

/**
 * Resolve only an explicitly remembered person. The former newest-memory
 * fallback is intentionally gone: for a multi-person owner, array order is
 * never a user choice. A one-person owner remains safe to auto-select.
 */
export function selectPrimaryCompanion<T extends CompanionHomeMemory>(
  memories: readonly T[],
  storedId: string | null,
): T | null {
  if (storedId) {
    const remembered = memories.find((memory) => memory.id === storedId);
    if (remembered) return remembered;
  }
  return memories.length === 1 ? memories[0] ?? null : null;
}

/**
 * Restores an Owner-scoped preference and performs the only permitted legacy
 * migration. The old global key is copied only after its id is proven to
 * belong to the current Owner's server-returned list; otherwise it is thrown
 * away without choosing the newest person.
 */
export function resolveCompanionPrimaryPreference<T extends CompanionHomeMemory>(
  memories: readonly T[],
  ownerId: string,
  storage: CompanionPrimaryStorage,
): CompanionPrimaryResolution<T> {
  const scopedKey = companionPrimaryStorageKey(ownerId);
  const scopedId = readStorage(storage, scopedKey);
  const scoped = selectPrimaryCompanion(memories, scopedId);
  if (scopedId && scoped) {
    return { memory: scoped, needsExplicitChoice: false, source: "scoped" };
  }
  if (scopedId) removeStorage(storage, scopedKey);

  const legacyId = readStorage(storage, COMPANION_PRIMARY_KEY);
  if (legacyId !== null) {
    // Consume the global key exactly once. It cannot keep influencing another
    // account after this resolution attempt.
    removeStorage(storage, COMPANION_PRIMARY_KEY);
    const legacy = memories.find((memory) => memory.id === legacyId) ?? null;
    if (legacy) {
      writeStorage(storage, scopedKey, legacy.id);
      return { memory: legacy, needsExplicitChoice: false, source: "legacy-migrated" };
    }
  }

  if (memories.length === 1) {
    const only = memories[0] ?? null;
    if (only) writeStorage(storage, scopedKey, only.id);
    return { memory: only, needsExplicitChoice: false, source: "single-memory" };
  }

  return { memory: null, needsExplicitChoice: memories.length > 1, source: "selection-required" };
}

/** Explicit entry points call this only after the Owner chose a person. */
export function persistCompanionPrimaryPreference(
  storage: CompanionPrimaryStorage,
  ownerId: string,
  memoryId: string,
): void {
  writeStorage(storage, companionPrimaryStorageKey(ownerId), memoryId);
}

export function clearCompanionPrimaryPreference(
  storage: CompanionPrimaryStorage,
  ownerId: string,
  memoryId: string,
): void {
  const scopedKey = companionPrimaryStorageKey(ownerId);
  if (readStorage(storage, scopedKey) === memoryId) removeStorage(storage, scopedKey);
  if (readStorage(storage, COMPANION_PRIMARY_KEY) === memoryId) removeStorage(storage, COMPANION_PRIMARY_KEY);
}

export function companionDay(now = new Date()): string {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export function dailyGreetingMarker(day: string, memoryId: string): string {
  return `${day}:${memoryId}`;
}

export function isDailyCompanionGreetingDue(
  storedMarker: string | null,
  day: string,
  memoryId: string,
): boolean {
  return storedMarker !== dailyGreetingMarker(day, memoryId);
}

/**
 * The home greeting is intentionally a transparent product cue, not a claim
 * that the deceased person initiated contact or is presently aware. It uses
 * only the owner-confirmed TA display name and never invents a memory.
 */
export function dailyCompanionGreeting(name: string): string {
  const displayName = name.trim() || "这位 TA";
  return "AI生成 · 基于你确认的信息：可以从一件小事开始。";
}

/**
 * A same-day scroll position is a local presentation preference only. It is
 * deliberately bounded and expires on the next calendar day, so it cannot
 * become a stale cross-session navigation state or an access signal.
 */
export function serializeCompanionPosition(day: string, scrollY: number): string {
  return JSON.stringify({ day, scrollY: Math.max(0, Math.round(scrollY)) });
}

export function restoreCompanionPosition(value: string | null, day: string): number | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { day?: unknown; scrollY?: unknown };
    if (parsed.day !== day || typeof parsed.scrollY !== "number" || !Number.isFinite(parsed.scrollY)) return null;
    return Math.max(0, Math.round(parsed.scrollY));
  } catch {
    return null;
  }
}
