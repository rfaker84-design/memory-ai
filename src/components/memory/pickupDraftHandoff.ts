"use client";

export type ChatPickupDraft = {
  memoryId: string;
  sourceMessageId: string;
  originalText: string;
  createdAt?: string;
};

let pendingDraft: ChatPickupDraft | null = null;

/**
 * Carries a user-selected chat sentence across one client-side navigation.
 * It is deliberately memory-only: refresh, a new tab, or closing the page
 * clears it, and no chat content is written until the user confirms in 拾忆.
 */
export function stageChatPickupDraft(input: ChatPickupDraft): boolean {
  const memoryId = input.memoryId.trim();
  const sourceMessageId = input.sourceMessageId.trim();
  const originalText = input.originalText.trim();
  if (!memoryId || !sourceMessageId || !originalText || originalText.length > 8_000) return false;
  pendingDraft = {
    memoryId,
    sourceMessageId,
    originalText,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  };
  return true;
}

export function consumeChatPickupDraft(memoryId: string): ChatPickupDraft | null {
  if (!pendingDraft || pendingDraft.memoryId !== memoryId) return null;
  const draft = pendingDraft;
  pendingDraft = null;
  return draft;
}

export function clearChatPickupDraft(): void {
  pendingDraft = null;
}
