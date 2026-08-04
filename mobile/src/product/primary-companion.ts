export type PrimaryCompanion = { id: string; photoAssetId?: string | null };

export const MOBILE_PRIMARY_COMPANION_KEY = "memoryai.mobile.primary-companion";

/**
 * A stored preference has no authority: it is accepted only after the formal
 * Owner-scoped memory list has been loaded for the current session.
 */
export function selectPrimaryCompanion<T extends PrimaryCompanion>(memories: readonly T[], storedId: string | null): T | null {
  if (storedId) {
    const selected = memories.find((memory) => memory.id === storedId);
    if (selected) return selected;
  }
  return memories.find((memory) => Boolean(memory.photoAssetId?.trim())) ?? memories[0] ?? null;
}
