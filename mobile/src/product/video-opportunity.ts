import { completedConversationRounds } from "../../../src/components/memory/conversationExperience";

import type {
  FirstPresenceVideoSafeDto,
  ProductConversation,
  ProductMemory,
} from "./api";

export type MobileVideoOpportunity = {
  intent: "initial_preview" | "additional_generation";
  /** This is a contract gate, not a client-side credit balance. */
  visible: boolean;
  saveAllowed: boolean;
};

export type MobileVideoOpportunities = {
  completedRounds: number;
  initialPreview: MobileVideoOpportunity | null;
  additionalGeneration: MobileVideoOpportunity | null;
};

/**
 * Mobile renders the same formal gates as the Web core. A selected local file,
 * optimistic message, or previous conversation cannot unlock either offer.
 */
export function resolveMobileVideoOpportunities(
  memory: Pick<ProductMemory, "photoAssetId"> | null | undefined,
  conversation: Pick<ProductConversation, "sessionId" | "messages"> | null | undefined,
  isFirstMemory: boolean,
): MobileVideoOpportunities {
  const completedRounds = completedConversationRounds(
    conversation?.messages ?? [],
    conversation?.sessionId,
  );
  const hasServerConfirmedPhoto = Boolean(memory?.photoAssetId?.trim());

  return {
    completedRounds,
    initialPreview: hasServerConfirmedPhoto && isFirstMemory
      ? { intent: "initial_preview", visible: true, saveAllowed: false }
      : null,
    additionalGeneration: completedRounds >= 2
      ? { intent: "additional_generation", visible: true, saveAllowed: false }
      : null,
  };
}

/**
 * A first preview is never saveable, even if a malformed remote DTO claims it
 * is. The server remains the source of truth for all other artifact states.
 */
export function saveAllowedForMobileVideo(job: FirstPresenceVideoSafeDto): boolean {
  return job.intent !== "initial_preview" && job.saveAllowed;
}

export function latestVideoJob(
  jobs: FirstPresenceVideoSafeDto[],
  intent: FirstPresenceVideoSafeDto["intent"],
): FirstPresenceVideoSafeDto | null {
  return jobs
    .filter((job) => job.intent === intent)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}
