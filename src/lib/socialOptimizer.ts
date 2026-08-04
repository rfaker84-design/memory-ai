/**
 * Historical social-growth helpers are intentionally inert. They must not
 * format public memorial content, add engagement hashtags, or place a user
 * identifier in a share URL. Approved public sharing is reviewed and lives
 * behind the formal video-share flow.
 */
export type Platform = "wechat" | "weibo" | "douyin" | "xiaohongshu" | "twitter" | "default";

export interface OGTags {
  title: string;
  description: string;
  image: string;
  url: string;
  siteName: string;
  type: string;
  twitterCard: string;
}

export interface ShareCard {
  width: number;
  height: number;
  bgColor: string;
  textColor: string;
  accentColor: string;
  title: string;
  subtitle: string;
  cta: string;
}

export const LEGACY_SOCIAL_SHARING_UNAVAILABLE = "LEGACY_SOCIAL_SHARING_UNAVAILABLE";

export function generateOGTags(_params: { title: string; description: string; imageUrl: string; pageUrl: string }): OGTags {
  return { title: "", description: "", image: "", url: "", siteName: "", type: "", twitterCard: "" };
}

export function generateShareCard(_params: { platform: Platform; title: string; subtitle: string; emotion: string }): ShareCard {
  return { width: 0, height: 0, bgColor: "", textColor: "", accentColor: "", title: "", subtitle: "", cta: "" };
}

export function optimizeForPlatform(_platform: Platform, _content: { title: string; description: string; hashtags: string[] }): { title: string; description: string; hashtags: string[] } {
  return { title: "", description: "", hashtags: [] };
}

export function generateShareUrl(_memoryId: string, _userId: string, _channel: string, _variant: string): string {
  return "";
}
