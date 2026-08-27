import type { SoundscapePreference } from "./types";

export const SOUNDSCAPE_PREFERENCE_KEY = "memoryai.soundscape.v1";
export const DEFAULT_SOUNDSCAPE_PREFERENCE: SoundscapePreference = { version: 1, enabled: false, volume: 0.22 };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isPreference(value: unknown): value is SoundscapePreference {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SoundscapePreference>;
  return candidate.version === 1 && typeof candidate.enabled === "boolean" && typeof candidate.volume === "number"
    && Number.isFinite(candidate.volume) && candidate.volume >= 0.08 && candidate.volume <= 0.35;
}

export function readSoundscapePreference(storage: StorageLike | null | undefined): SoundscapePreference {
  if (!storage) return { ...DEFAULT_SOUNDSCAPE_PREFERENCE };
  try {
    const stored = storage.getItem(SOUNDSCAPE_PREFERENCE_KEY);
    if (!stored) return { ...DEFAULT_SOUNDSCAPE_PREFERENCE };
    const parsed: unknown = JSON.parse(stored);
    return isPreference(parsed) ? parsed : { ...DEFAULT_SOUNDSCAPE_PREFERENCE };
  } catch {
    return { ...DEFAULT_SOUNDSCAPE_PREFERENCE };
  }
}

export function writeSoundscapePreference(storage: StorageLike | null | undefined, preference: SoundscapePreference): void {
  if (!storage || !isPreference(preference)) return;
  try { storage.setItem(SOUNDSCAPE_PREFERENCE_KEY, JSON.stringify(preference)); } catch { /* preference writes are non-blocking */ }
}

export function withSoundscapeEnabled(preference: SoundscapePreference, enabled: boolean): SoundscapePreference {
  return { ...preference, enabled };
}

export function withSoundscapeVolume(preference: SoundscapePreference, volume: number): SoundscapePreference {
  return { ...preference, volume: Number(Math.min(0.35, Math.max(0.08, volume)).toFixed(2)) };
}
