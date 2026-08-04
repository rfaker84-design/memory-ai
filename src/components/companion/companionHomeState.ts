export type CompanionHomeMemory = { id: string };

export const COMPANION_PRIMARY_KEY = "memoryai.companion.primary";
export const COMPANION_DAILY_GREETING_KEY = "memoryai.companion.daily-greeting";
export const COMPANION_POSITION_KEY = "memoryai.companion.position";

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

/**
 * The home greeting is intentionally a transparent product cue, not a claim
 * that the deceased person initiated contact or is presently aware. It uses
 * only the owner-confirmed TA display name and never invents a memory.
 */
export function dailyCompanionGreeting(name: string): string {
  const displayName = name.trim() || "这位 TA";
  return `今日 AI 纪念问候 · 基于已确认资料：想和 ${displayName} 的纪念资料慢慢说一件事吗？`;
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
