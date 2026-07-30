import type { PickedMedia } from "../native/memory-media";
import type { ProductMemory } from "./api";
import { startPendingCreation, type PendingCreation } from "./creation-flow";

/** A Memory remains incomplete until the API has confirmed its portrait asset. */
export function isIncompleteMemory(memory: Pick<ProductMemory, "photoAssetId">): boolean {
  return !memory.photoAssetId?.trim();
}

/**
 * Select the first server-owned incomplete Memory. Callers receive only the
 * current owner's list from the existing API, so this never broadens ownership.
 */
export function findIncompleteMemory(memories: readonly ProductMemory[]): ProductMemory | null {
  return memories.find(isIncompleteMemory) ?? null;
}

/**
 * Keep a completed Memory usable while separately surfacing an incomplete one
 * for recovery. The input comes from the existing owner-scoped list endpoint.
 */
export function classifyOwnedMemories(memories: readonly ProductMemory[]): {
  active: ProductMemory | null;
  incomplete: ProductMemory | null;
} {
  const incomplete = findIncompleteMemory(memories);
  return {
    active: memories.find((memory) => !isIncompleteMemory(memory)) ?? incomplete,
    incomplete,
  };
}

/**
 * Rehydrate the formal upload flow around an already-created, photo-less
 * Memory. It deliberately has no create-Memory capability.
 */
export function resumePendingCreation(memory: ProductMemory, media: readonly PickedMedia[]): PendingCreation {
  if (!isIncompleteMemory(memory)) throw new Error("Only an incomplete Memory can resume photo completion.");
  return startPendingCreation(memory, media);
}
