// ╔══════════════════════════════════════════════════════════════╗
// ║  socialOptimizer.ts — 社交分享优化 (V7)                   ║
// ║  OG标签生成 / 分享卡片 / 平台适配 / 最佳格式              ║
// ╚══════════════════════════════════════════════════════════════╝

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

// ═══════════════════════════════════════════════════════════════
// 平台适配规格
// ═══════════════════════════════════════════════════════════════
const PLATFORM_SPECS: Record<Platform, { cardWidth: number; cardHeight: number; ratio: string }> = {
  wechat:      { cardWidth: 1200, cardHeight: 630, ratio: "1.91:1" },
  weibo:       { cardWidth: 1200, cardHeight: 900, ratio: "4:3" },
  douyin:      { cardWidth: 1080, cardHeight: 1920, ratio: "9:16" },
  xiaohongshu: { cardWidth: 1080, cardHeight: 1440, ratio: "3:4" },
  twitter:     { cardWidth: 1200, cardHeight: 675, ratio: "16:9" },
  default:     { cardWidth: 1200, cardHeight: 630, ratio: "1.91:1" },
};

// ═══════════════════════════════════════════════════════════════
// OG 标签生成
// ═══════════════════════════════════════════════════════════════
export function generateOGTags(params: {
  title: string;
  description: string;
  imageUrl: string;
  pageUrl: string;
}): OGTags {
  return {
    title: params.title,
    description: params.description.slice(0, 160),
    image: params.imageUrl,
    url: params.pageUrl,
    siteName: "忆见 Memory AI",
    type: "article",
    twitterCard: "summary_large_image",
  };
}

// ═══════════════════════════════════════════════════════════════
// 分享卡片生成
// ═══════════════════════════════════════════════════════════════
export function generateShareCard(params: {
  platform: Platform;
  title: string;
  subtitle: string;
  emotion: string;
}): ShareCard {
  const spec = PLATFORM_SPECS[params.platform] || PLATFORM_SPECS.default;

  const emotionColors: Record<string, { bg: string; text: string; accent: string }> = {
    warm:       { bg: "#1a0f0a", text: "#f5e6d3", accent: "#d4a574" },
    calm:       { bg: "#0a0f1a", text: "#d3e0f5", accent: "#7488d4" },
    sad:        { bg: "#0f0a0f", text: "#e0d3e5", accent: "#9474b4" },
    nostalgic:  { bg: "#0f0f0a", text: "#e5e0d3", accent: "#b4a474" },
  };

  const colors = emotionColors[params.emotion] || emotionColors.calm;

  return {
    width: spec.cardWidth,
    height: spec.cardHeight,
    bgColor: colors.bg,
    textColor: colors.text,
    accentColor: colors.accent,
    title: params.title,
    subtitle: params.subtitle,
    cta: "在#忆见 唤醒记忆",
  };
}

// ═══════════════════════════════════════════════════════════════
// 平台分享文案优化
// ═══════════════════════════════════════════════════════════════
export function optimizeForPlatform(
  platform: Platform,
  content: { title: string; description: string; hashtags: string[] },
): { title: string; description: string; hashtags: string[] } {
  switch (platform) {
    case "wechat":
      return {
        title: content.title.slice(0, 30),
        description: content.description.slice(0, 60),
        hashtags: content.hashtags.slice(0, 3),
      };
    case "weibo":
      return {
        title: content.title.slice(0, 140),
        description: content.description.slice(0, 120),
        hashtags: content.hashtags.slice(0, 5),
      };
    case "xiaohongshu":
      return {
        title: content.title.slice(0, 20),
        description: content.description.slice(0, 100),
        hashtags: [...content.hashtags, "#情感", "#成长", "#回忆"].slice(0, 10),
      };
    default:
      return content;
  }
}

// ═══════════════════════════════════════════════════════════════
// 分享URL生成（带追踪参数）
// ═══════════════════════════════════════════════════════════════
export function generateShareUrl(
  memoryId: string,
  userId: string,
  channel: string,
  variant: string,
): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}/share/${memoryId}?ref=${userId}&channel=${channel}&v=${variant}`;
}
