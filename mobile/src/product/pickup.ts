export function pickupDraft(originalText: string): string {
  const sentences = originalText.trim().split(/(?<=[。！？!?])/u).map((sentence) => sentence.trim()).filter(Boolean);
  return sentences.length > 1 ? sentences.map((sentence) => `- ${sentence}`).join("\n") : originalText.trim();
}

/** A user action remains non-recallable until this explicit confirmation is true. */
export function mayConfirmPickup(originalText: string, organizedText: string, confirmed: boolean): boolean {
  return confirmed && Boolean(originalText.trim()) && Boolean(organizedText.trim());
}
