import type { CompanionMotionVariant } from "./companionMotionClient";

export type CompanionConversationMotionPhase =
  | "loading"
  | "greeting"
  | "ready"
  | "sending"
  | "replying"
  | "recovering"
  | "error";

export function resolveConversationMotionVariant(input: {
  phase: CompanionConversationMotionPhase;
  draft: string;
  hasPendingMessage: boolean;
}): CompanionMotionVariant {
  if (input.phase === "sending") return "attentive";
  if (
    input.phase === "greeting"
    || input.phase === "replying"
    || input.phase === "recovering"
    || input.hasPendingMessage
  ) return "reflective";
  if (input.draft.trim()) return "attentive";
  return "idle";
}

export function resolvePlayableMotionVariant(
  requested: CompanionMotionVariant,
  available: ReadonlySet<CompanionMotionVariant>,
): CompanionMotionVariant | null {
  if (available.has(requested)) return requested;
  return available.has("idle") ? "idle" : null;
}
