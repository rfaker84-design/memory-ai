/**
 * Historical chat-card sharing is retired. The approved product surface is
 * the reviewed, Owner-authorized video-share API; no client helper may create
 * public cards from chat text or synthesize referral links.
 */
export interface ShareCard {
  id: string;
  memory_name: string;
  relationship: string | null;
  emotion_tag: string;
  share_title: string;
  content_text: string;
  photo_url: string | null;
  share_url: string;
}

export const LEGACY_CHAT_SHARING_UNAVAILABLE = "LEGACY_CHAT_SHARING_UNAVAILABLE";

export async function generateShareCard(_memoryId: string, _chatContent?: string): Promise<ShareCard | null> {
  return null;
}

export async function trackReferral(_shareId: string, _fromUser: string): Promise<boolean> {
  return false;
}

export async function getShareCard(_cardId: string): Promise<ShareCard | null> {
  return null;
}

export function getDefaultShareText(_name: string, _content: string): string {
  return "公开分享仅可通过已审核、Owner 明确授权的正式影像流程创建。";
}

export async function copyShareLink(_cardId: string): Promise<boolean> {
  return false;
}
