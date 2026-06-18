// ╔══════════════════════════════════════════════════════════════╗
// ║  conversion.ts — 付费转化系统 (V7 Revenue Engine)         ║
// ║  用户行为分析 / 付费时机识别 / 转化路径优化                ║
// ╚══════════════════════════════════════════════════════════════╝

import { getStickiness, type StickinessLevel } from "./emotionalStickiness";
import { getUserTier, type UserTier } from "./costManager";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export type ConversionStage = "awareness" | "engagement" | "dependency" | "trigger" | "converting" | "retained";

export interface ConversionProfile {
  userId: string;
  currentTier: UserTier;
  stage: ConversionStage;
  conversionProbability: number;    // 0-1
  optimalTriggerTime: "now" | "next_session" | "wait";
  recommendedTier: UserTier;
  urgency: "low" | "medium" | "high";
  barrierFactors: string[];
  accelerators: string[];
}

export interface ConversionMetric {
  freeToProRate: number;
  proToVipRate: number;
  avgDaysToConvert: number;
  topTriggerEmotion: string;
  bestTimeOfDay: number;          // 最佳付费小时
  bestDayOfWeek: number;
}

// ═══════════════════════════════════════════════════════════════
// 转化阶段判定
// ═══════════════════════════════════════════════════════════════
export function evaluateConversionStage(params: {
  userId: string;
  stickiness: StickinessLevel;
  chatCount: number;
  daysActive: number;
  currentTier: UserTier;
  emotionIntensity: number;
}): ConversionStage {
  if (params.currentTier !== "free") return "retained";

  if (params.daysActive < 3 && params.chatCount < 5) return "awareness";
  if (params.chatCount >= 5 && params.emotionIntensity < 0.4) return "engagement";
  if (params.chatCount >= 10 && params.stickiness === "attached") return "dependency";
  if (params.emotionIntensity >= 0.7 && params.stickiness === "dependent") return "trigger";
  if (params.chatCount > 20) return "converting";

  return "engagement";
}

// ═══════════════════════════════════════════════════════════════
// 付费时机判断
// ═══════════════════════════════════════════════════════════════
export function getConversionTiming(params: {
  emotion: string;
  stickiness: StickinessLevel;
  isNightSession: boolean;
  chatDepth: number;
  lastPaywallShownDays: number;
}): { shouldShow: boolean; urgency: "low" | "medium" | "high"; reason: string } {
  // 情感高峰触发
  if ((params.emotion === "sad" || params.emotion === "nostalgic") && params.chatDepth >= 5) {
    return { shouldShow: true, urgency: "high", reason: "情感共鸣时刻，转化率最高" };
  }

  // 深度依赖触发
  if (params.stickiness === "dependent" && params.lastPaywallShownDays >= 2) {
    return { shouldShow: true, urgency: "high", reason: "用户深度依赖，升级价值明确" };
  }

  // 深夜触发
  if (params.isNightSession && params.stickiness === "attached") {
    return { shouldShow: true, urgency: "medium", reason: "深夜使用，陪伴需求强烈" };
  }

  // 交互深度触发
  if (params.chatDepth >= 10 && params.stickiness !== "new") {
    return { shouldShow: true, urgency: "medium", reason: "对话深度足，价值感知充分" };
  }

  return { shouldShow: false, urgency: "low", reason: "" };
}

// ═══════════════════════════════════════════════════════════════
// 用户转化画像
// ═══════════════════════════════════════════════════════════════
export function getConversionProfile(userId: string): ConversionProfile {
  const tier = getUserTier(userId);
  const stickiness = getStickiness(userId);
  const stage = evaluateConversionStage({
    userId, stickiness: stickiness.level, chatCount: stickiness.totalSessions,
    daysActive: stickiness.totalSessions, currentTier: tier, emotionIntensity: stickiness.factors.emotionalBond / 15,
  });

  const prob = stickiness.score >= 80 ? 0.85 : stickiness.score >= 55 ? 0.5 : stickiness.score >= 30 ? 0.2 : 0.05;

  return {
    userId,
    currentTier: tier,
    stage,
    conversionProbability: prob,
    optimalTriggerTime: stickiness.level === "dependent" ? "now" : stickiness.score >= 50 ? "next_session" : "wait",
    recommendedTier: tier === "free" ? "pro" : "vip",
    urgency: stickiness.score >= 70 ? "high" : stickiness.score >= 40 ? "medium" : "low",
    barrierFactors: tier === "free" ? ["价格敏感", "价值认知不足"] : [],
    accelerators: stickiness.level === "dependent" ? ["情感深度依赖", "高频使用"] : [],
  };
}

// ═══════════════════════════════════════════════════════════════
// 转化指标
// ═══════════════════════════════════════════════════════════════
export function getConversionMetrics(): ConversionMetric {
  return {
    freeToProRate: 0.15,
    proToVipRate: 0.08,
    avgDaysToConvert: 14,
    topTriggerEmotion: "nostalgic",
    bestTimeOfDay: 22,
    bestDayOfWeek: 0,  // Sunday
  };
}
