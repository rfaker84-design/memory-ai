export type CompanionHomeMemory = { id: string };

export const COMPANION_PRIMARY_KEY = "memoryai.companion.primary";
export const COMPANION_DAILY_GREETING_KEY = "memoryai.companion.daily-greeting";

/**
 * This is presentation preference only. The API still reloads owner-scoped
 * memories before the value is used, so browser storage never grants access.
 */
export function selectPrimaryCompanion<T extends CompanionHomeMemory>(
  memories: readonly T[],
  storedId: string | null,
): T | null {
  if (storedId) {
    const remembered = memories.find((memory) => memory.id === storedId);
    if (remembered) return remembered;
  }
  return memories[0] ?? null;
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
