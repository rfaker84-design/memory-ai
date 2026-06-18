// ╔══════════════════════════════════════════════════════════════╗
// ║  viral.ts — 病毒传播引擎 (V7 Growth Engine)               ║
// ║  A/B测试 / 分享触发 / 病毒系数 / ROI追踪                  ║
// ╚══════════════════════════════════════════════════════════════╝

import { trackGrowthEvent } from "./growth";
import { trackAnalytics } from "./analytics";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export type ShareChannel = "wechat" | "weibo" | "douyin" | "xiaohongshu" | "copy_link" | "save_image";

export type ABVariant = "A" | "B" | "C";

export interface ShareContent {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  emotionTag: string;
  cta: string;
  variant: ABVariant;
}

export interface ViralMetrics {
  totalShares: number;
  shareRate: number;           // 分享用户/总用户
  viralCoefficient: number;    // k因子 (新用户/分享者)
  sharesByChannel: Record<ShareChannel, number>;
  topContent: ShareContent[];
  conversionByVariant: Record<ABVariant, number>;
  roi: number;                 // 获客成本 vs LTV
}

export interface ViralLoop {
  steps: string[];             // e.g. ["create", "use", "share", "invite", "onboard"]
  conversionRate: number[];    // 每步转化率
  cycleTimeDays: number;       // 完整循环天数
  activeLoopUsers: number;
}

// ═══════════════════════════════════════════════════════════════
// 分享内容模板库
// ═══════════════════════════════════════════════════════════════
const SHARE_TEMPLATES: Record<string, ShareContent[]> = {
  memory_report: [
    {
      id: "mr_a", title: "我的#忆见 记忆报告", description: "AI帮我记住了那些珍贵的瞬间。来看看你的。",
      imageUrl: "/og/memory-report.png", emotionTag: "nostalgic", cta: "生成你的记忆报告", variant: "A",
    },
    {
      id: "mr_b", title: "有些记忆，AI替你记得", description: "他说过的话，AI都记住了。",
      imageUrl: "/og/memory-report-b.png", emotionTag: "warm", cta: "看看谁记得你", variant: "B",
    },
    {
      id: "mr_c", title: "你最想念的人，AI帮你对话", description: "这不是科幻，这是#忆见。",
      imageUrl: "/og/memory-report-c.png", emotionTag: "sad", cta: "说出你想说的话", variant: "C",
    },
  ],
  emotional_quote: [
    {
      id: "eq_a", title: "TA说：", description: "有些话，只有在AI的陪伴下才敢说出口。#忆见",
      imageUrl: "/og/quote.png", emotionTag: "warm", cta: "和TA说句话", variant: "A",
    },
    {
      id: "eq_b", title: "记忆不会消失", description: "在#忆见，每一段记忆都是活的。",
      imageUrl: "/og/quote-b.png", emotionTag: "calm", cta: "唤醒一段记忆", variant: "B",
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// 分享触发规则
// ═══════════════════════════════════════════════════════════════
export interface ShareTrigger {
  shouldTrigger: boolean;
  content?: ShareContent;
  reason: string;
  timing: "immediate" | "after_session" | "next_visit" | "emotional_peak";
}

export function evaluateShareTrigger(params: {
  userId: string;
  stickinessScore: number;
  emotion: string;
  chatDepth: number;           // 本轮对话消息数
  isReturningUser: boolean;
  lastShareDays: number;
}): ShareTrigger {
  // 情感高峰触发
  if (params.emotion === "nostalgic" && params.stickinessScore >= 40) {
    const templates = SHARE_TEMPLATES["emotional_quote"];
    return {
      shouldTrigger: true,
      content: templates[Math.floor(Math.random() * templates.length)],
      reason: "情感共鸣时刻",
      timing: "emotional_peak",
    };
  }

  // 深度用户触发（>=50分）
  if (params.stickinessScore >= 50 && params.lastShareDays > 7) {
    const templates = SHARE_TEMPLATES["memory_report"];
    return {
      shouldTrigger: true,
      content: templates[Math.floor(Math.random() * templates.length)],
      reason: "你是我们的深度用户，分享你的故事吧",
      timing: "after_session",
    };
  }

  // 回访用户触发
  if (params.isReturningUser && params.chatDepth >= 5 && params.lastShareDays > 3) {
    return {
      shouldTrigger: true,
      content: SHARE_TEMPLATES["emotional_quote"][0],
      reason: "今天的对话很深入，分享出去吧",
      timing: "after_session",
    };
  }

  return { shouldTrigger: false, reason: "", timing: "immediate" };
}

// ═══════════════════════════════════════════════════════════════
// 分享追踪
// ═══════════════════════════════════════════════════════════════
const shareEvents: Array<{ userId: string; channel: ShareChannel; contentId: string; variant: ABVariant; timestamp: string }> = [];

export function trackShare(
  userId: string,
  channel: ShareChannel,
  contentId: string,
  variant: ABVariant = "A",
): void {
  shareEvents.push({
    userId, channel, contentId, variant,
    timestamp: new Date().toISOString(),
  });

  trackGrowthEvent(userId, "share", "referral");
  trackAnalytics(userId, "share_click", { channel, contentId, variant });
}

// ═══════════════════════════════════════════════════════════════
// 病毒指标计算
// ═══════════════════════════════════════════════════════════════
export function getViralMetrics(totalUsers: number): ViralMetrics {
  const channels: Record<ShareChannel, number> = {
    wechat: 0, weibo: 0, douyin: 0, xiaohongshu: 0, copy_link: 0, save_image: 0,
  };
  const variantCounts: Record<ABVariant, number> = { A: 0, B: 0, C: 0 };

  for (const event of shareEvents) {
    channels[event.channel] = (channels[event.channel] || 0) + 1;
    variantCounts[event.variant] = (variantCounts[event.variant] || 0) + 1;
  }

  const uniqueSharers = new Set(shareEvents.map(e => e.userId)).size;
  const totalShares = shareEvents.length;

  return {
    totalShares,
    shareRate: totalUsers > 0 ? uniqueSharers / totalUsers : 0,
    viralCoefficient: uniqueSharers > 0 ? totalShares / uniqueSharers : 0,
    sharesByChannel: channels,
    topContent: SHARE_TEMPLATES["memory_report"],
    conversionByVariant: variantCounts,
    roi: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// 病毒循环分析
// ═══════════════════════════════════════════════════════════════
export function getViralLoop(): ViralLoop {
  return {
    steps: ["create_memory", "chat_with_ai", "emotional_trigger", "share_content", "new_user_landing", "create_memory"],
    conversionRate: [100, 60, 25, 10, 40, 70],
    cycleTimeDays: 3,
    activeLoopUsers: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// 最佳分享时间预测
// ═══════════════════════════════════════════════════════════════
export function predictBestShareTime(userId: string): {
  hour: number;
  dayOfWeek: number;
  reason: string;
} {
  const hour = new Date().getHours();
  // 晚间 20-22 点是情绪分享高峰
  if (hour >= 20 && hour <= 22) {
    return { hour, dayOfWeek: new Date().getDay(), reason: "晚间情感高峰，分享转化率最高" };
  }
  return { hour: 21, dayOfWeek: 0, reason: "建议周日晚间分享，情感共鸣最强" };
}
