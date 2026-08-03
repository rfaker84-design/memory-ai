export const REPLY_CORRECTION_REASONS = [
  "称呼不对",
  "语气不对",
  "TA 不会这样说",
  "这段记忆不准确",
  "其他",
] as const;

export type ReplyCorrectionReason = (typeof REPLY_CORRECTION_REASONS)[number];
export type ReplyCorrectionSuggestion = {
  field: "personalityProfile" | "speechStyle";
  text: string;
};

function compact(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * This deliberately does not infer a fact about the person.  It only turns
 * the user's selected reason and their own words into a reviewable future
 * response rule.  The caller must still ask for explicit confirmation before
 * persisting it to the formal TA profile.
 */
export function createReplyCorrectionSuggestion(
  reason: ReplyCorrectionReason,
  detail: string,
  reply: string,
): ReplyCorrectionSuggestion | null {
  const userWords = compact(detail);
  if (!userWords) return null;

  switch (reason) {
    case "称呼不对":
      return {
        field: "personalityProfile",
        text: `用户已确认：未来请使用“${userWords}”这一称呼。`,
      };
    case "语气不对":
      return {
        field: "speechStyle",
        text: `用户已确认的表达偏好：${userWords}`,
      };
    case "TA 不会这样说":
      return {
        field: "speechStyle",
        text: `用户已确认：不要使用与“${compact(reply)}”相近的表达；更合适的方式是：${userWords}`,
      };
    case "这段记忆不准确":
      return {
        field: "personalityProfile",
        text: `用户已确认的资料校正：${userWords}`,
      };
    case "其他":
      return {
        field: "personalityProfile",
        text: `用户已确认的 TA 回复校正：${userWords}`,
      };
  }
}

export function appendConfirmedCorrection(
  existing: string | null | undefined,
  suggestion: string,
) {
  const current = existing?.trim();
  return current ? `${current}\n\n${suggestion}` : suggestion;
}
