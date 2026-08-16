type ClearableStorage = Pick<Storage, "length" | "key" | "removeItem">;

const LOCAL_PRESENTATION_KEYS = new Set([
  "memoryai.companion.primary",
  "memoryai.companion.daily-greeting",
  "memoryai.companion.position",
]);
const LOCAL_PRESENTATION_PREFIXES = ["memoryai.companion.primary:"];
const SESSION_PRESENTATION_KEYS = new Set(["memoryai:static-brand-launch-seen"]);
const SESSION_PRESENTATION_PREFIXES = ["memoryai.pickup-hint:"];

function removeMatching(storage: ClearableStorage, matches: (key: string) => boolean): number {
  const keys = Array.from({ length: storage.length }, (_unused, index) => storage.key(index))
    .filter((key): key is string => typeof key === "string" && matches(key));
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}

/**
 * Only non-authoritative display preferences are cleared. Drafts, idempotency
 * records, recovery state, and identity/session state are deliberately kept.
 */
export function clearPresentationCache(local: ClearableStorage, session: ClearableStorage): number {
  const legacyLocal = (key: string) => key.startsWith("yj_") || key.startsWith("yijian_");
  return removeMatching(local, (key) => LOCAL_PRESENTATION_KEYS.has(key)
    || LOCAL_PRESENTATION_PREFIXES.some((prefix) => key.startsWith(prefix))
    || legacyLocal(key))
    + removeMatching(session, (key) => SESSION_PRESENTATION_KEYS.has(key)
      || SESSION_PRESENTATION_PREFIXES.some((prefix) => key.startsWith(prefix)));
}
