import type { CreateDraft, CreateStage } from "./types";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export function validateStage(stage: CreateStage, draft: CreateDraft): string | null {
  if (stage === 0 && (!draft.name.trim() || !draft.relationship.trim() || !draft.preferredAddress.trim() || !draft.purpose.trim())) return "identity-required";
  if (stage === 2 && !draft.consent) return "consent-required";
  return null;
}

export function draftForStorage(draft: CreateDraft) {
  const { consent: _consent, ...safeDraft } = draft;
  return safeDraft;
}

export function completion(draft: CreateDraft) {
  const values = [draft.name, draft.relationship, draft.preferredAddress, draft.purpose, draft.personality, draft.catchPhrases, draft.sharedExperiences, draft.lifeMoments, draft.interests];
  return Math.round(values.filter(value => value.trim()).length / values.length * 100);
}

export function createMemoryRequestHeaders(idempotencyKey: string) {
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new Error("invalid idempotency key");
  }

  return {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  };
}
