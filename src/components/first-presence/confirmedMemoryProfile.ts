export type ConfirmedMemoryProfileInput = {
  preferredAddress: string;
  catchPhrases: string;
  speechStyle: string;
  sharedMemory: string;
};

/** Converts the user's confirmed minimum identity facts into existing Memory fields. */
export function buildConfirmedMemoryProfile(input: ConfirmedMemoryProfileInput) {
  const preferredAddress = input.preferredAddress.trim();
  const sharedMemory = input.sharedMemory.trim();
  const fragments = [
    preferredAddress
      ? { sourceType: "confirmed_user_address", content: `TA 称呼用户为：${preferredAddress}` }
      : null,
    sharedMemory
      ? { sourceType: "shared_memory", content: sharedMemory }
      : null,
  ].filter((fragment): fragment is { sourceType: string; content: string } => Boolean(fragment));

  return {
    personalityProfile: preferredAddress ? `用户确认 TA 称呼自己为：${preferredAddress}。` : null,
    catchPhrases: input.catchPhrases.trim() || null,
    speechStyle: input.speechStyle.trim() || null,
    lifeStory: sharedMemory || null,
    fragments,
  };
}
