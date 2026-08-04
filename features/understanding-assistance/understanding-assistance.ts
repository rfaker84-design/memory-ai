/**
 * A narrow, non-diagnostic safety boundary. It reacts only to an explicit
 * request for explanation or trusted-person help; it must never infer a
 * person's ability from grief, age, spelling, pace, or emotion.
 */
export const UNDERSTANDING_ASSISTANCE_VERSION = "understanding-assistance-v1";

export const HIGH_RISK_OPERATIONS = [
  "purchase",
  "refund",
  "entitlement_disposition",
  "public_share",
  "account_export",
  "account_deletion",
  "memory_deletion",
  "authorization_change",
] as const;

export type HighRiskOperation = (typeof HIGH_RISK_OPERATIONS)[number];

export type UnderstandingAssistanceState = {
  enabled: boolean;
  confirmationVersion: typeof UNDERSTANDING_ASSISTANCE_VERSION | null;
  updatedAt: string | null;
};

export const assistanceExplanation = "这项操作可能影响付款、资料访问或公开范围。你可以先再看一次说明，暂时不操作，或请可信任的人协助；忆见不会替你判断，也不会自动联系任何人。";
export const HIGH_RISK_CONFIRMATION_FAILURE_THRESHOLD = 3;

// These expressions intentionally require a direct request. Broad grief,
// age-related language, typos, slower writing, and emotional wording do not
// match this boundary.
const EXPLICIT_ASSISTANCE_REQUEST = /(?:我(?:看不懂|不明白|无法(?:自己)?决定|不能(?:自己)?决定|需要(?:可信任的人|别人|他人)帮助)|请(?:再)?解释(?:一次)?|帮我找(?:可信任的人|人)协助)/u;

export function hasExplicitAssistanceRequest(value: string): boolean {
  return EXPLICIT_ASSISTANCE_REQUEST.test(value.trim());
}

export function isHighRiskOperation(value: string): value is HighRiskOperation {
  return (HIGH_RISK_OPERATIONS as readonly string[]).includes(value);
}

/**
 * Failed-confirmation counts are transient UI state only. They do not store
 * chat text or infer a diagnosis from a person needing another explanation.
 */
export function shouldOfferAssistanceAfterConfirmationFailures(input: { operation: string; failedConfirmations: number }): boolean {
  return isHighRiskOperation(input.operation)
    && Number.isInteger(input.failedConfirmations)
    && input.failedConfirmations >= HIGH_RISK_CONFIRMATION_FAILURE_THRESHOLD;
}

export function blockedHighRiskResponse(operation: HighRiskOperation) {
  return {
    error: "UNDERSTANDING_ASSISTANCE_REQUIRED",
    operation,
    explanation: assistanceExplanation,
    actions: ["EXPLAIN_AGAIN", "DO_NOT_PROCEED", "TRUSTED_PERSON_ASSISTANCE"],
  } as const;
}
