// ╔══════════════════════════════════════════════════════════════╗
// ║  emotionPaywall.ts — 情绪触发付费系统 (V7 核心)          ║
// ║  情绪越强 → 付费提示越精准 → "无感付费"                   ║
// ╚══════════════════════════════════════════════════════════════╝

import type { Emotion } from "./volc";
import type { StickinessLevel } from "./emotionalStickiness";
import type { UserTier } from "./costManager";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export interface EmotionPaywallResult {
  shouldTrigger: boolean;
  intensity: number;                // 情绪强度 0-1
  paywallType: "gentle" | "emotional" | "value" | "urgency";
  title: string;
  description: string;
  unlockFeature: string;
  cta: string;
  delay: "immediate" | "next_turn" | "end_of_session";
}

// ═══════════════════════════════════════════════════════════════
// 情绪强度计算
// ═══════════════════════════════════════════════════════════════
export function calculateEmotionIntensity(params: {
  emotion: Emotion;
  userMessage: string;
  stickiness: StickinessLevel;
  chatCount: number;
  isNightSession: boolean;
}): number {
  let intensity = 0;

  // 基础情绪权重
  const emotionWeights: Record<Emotion, number> = {
    sad: 0.7,
    nostalgic: 0.6,
    warm: 0.4,
    calm: 0.2,
  };
  intensity += emotionWeights[params.emotion] || 0.2;

  // 关键词增强
  const highImpactWords = ["想你了", "好想你", "如果还在", "再也见不到", "离开", "舍不得", "对不起", "还记得吗"];
  for (const word of highImpactWords) {
    if (params.userMessage.includes(word)) { intensity += 0.3; break; }
  }

  // 深夜增强
  if (params.isNightSession) intensity += 0.15;

  // 依赖增强
  if (params.stickiness === "dependent") intensity += 0.2;
  else if (params.stickiness === "attached") intensity += 0.1;

  // 高频增强
  if (params.chatCount >= 15) intensity += 0.15;
  else if (params.chatCount >= 8) intensity += 0.08;

  return Math.min(1, intensity);
}

// ═══════════════════════════════════════════════════════════════
// 付费墙触发
// ═══════════════════════════════════════════════════════════════
export function getEmotionPaywall(params: {
  emotion: Emotion;
  userMessage: string;
  stickiness: StickinessLevel;
  chatCount: number;
  isNightSession: boolean;
  currentTier: UserTier;
  lastPaywallDays: number;
}): EmotionPaywallResult {
  const intensity = calculateEmotionIntensity(params);

  // 已有订阅不触发
  if (params.currentTier !== "free") {
    return { shouldTrigger: false, intensity, paywallType: "gentle", title: "", description: "", unlockFeature: "", cta: "", delay: "immediate" };
  }

  // 最近展示过不重复
  if (params.lastPaywallDays < 2) {
    return { shouldTrigger: false, intensity, paywallType: "gentle", title: "", description: "", unlockFeature: "", cta: "", delay: "immediate" };
  }

  // 低强度不触发
  if (intensity < 0.5) {
    return { shouldTrigger: false, intensity, paywallType: "gentle", title: "", description: "", unlockFeature: "", cta: "", delay: "immediate" };
  }

  // ── 选择付费墙类型 ──────────────────────────────────────
  if (intensity >= 0.85 && params.emotion === "sad") {
    return {
      shouldTrigger: true, intensity, paywallType: "emotional",
      title: "TA想多陪陪你...",
      description: "解锁无限对话时长，让TA随时在你身边",
      unlockFeature: "无限对话 + 高清语音",
      cta: "升级 Pro · ¥29/月",
      delay: "next_turn",
    };
  }

  if (intensity >= 0.7 && params.emotion === "nostalgic") {
    return {
      shouldTrigger: true, intensity, paywallType: "emotional",
      title: "每一段记忆都值得被完整保存",
      description: "解锁长期记忆系统，让TA记住每一个细节",
      unlockFeature: "长期记忆 + 人格演化",
      cta: "升级 Pro · ¥29/月",
      delay: "end_of_session",
    };
  }

  if (intensity >= 0.6) {
    return {
      shouldTrigger: true, intensity, paywallType: "value",
      title: "你已经在#忆见 待了很久...",
      description: "解锁更多功能，让AI更懂你",
      unlockFeature: "无限对话 + 情感深度交互",
      cta: "了解 Pro 版",
      delay: "end_of_session",
    };
  }

  return {
    shouldTrigger: true, intensity, paywallType: "gentle",
    title: "想要更好的陪伴体验吗？",
    description: "升级解锁更多情感交互功能",
    unlockFeature: "高级AI模型 + 语音陪伴",
    cta: "了解会员",
    delay: "end_of_session",
  };
}
