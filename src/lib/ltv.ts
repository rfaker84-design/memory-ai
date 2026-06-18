// ╔══════════════════════════════════════════════════════════════╗
// ║  ltv.ts — 用户生命周期价值系统 (V6 Growth)                ║
// ║  LTV计算 / 付费预测 / 升级推送 / ARPU / Churn             ║
// ╚══════════════════════════════════════════════════════════════╝

import { getStickiness, type StickinessProfile } from "./emotionalStickiness";
import { getUserTier, type UserTier } from "./costManager";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export interface LTVProfile {
  userId: string;
  tier: UserTier;
  estimatedLTV: number;         // 预估终身价值(分)
  monthlyValue: number;         // 当前月价值(分)
  predictedConversion: number;  // 付费概率 0-1
  recommendedTier: UserTier;    // 推荐升级目标
  upgradeUrgency: "low" | "medium" | "high";
  daysSinceSignup: number;
  totalSpend: number;           // 已消费(分)
}

// ═══════════════════════════════════════════════════════════════
// 用户 LTV 估算
// ═══════════════════════════════════════════════════════════════
export function calculateLTV(userId: string, daysSinceSignup = 30): LTVProfile {
  const tier = getUserTier(userId);
  const stickiness = getStickiness(userId);

  // 当前月价值（基于套餐）
  const monthlyValues: Record<UserTier, number> = {
    free: 0,
    pro: 2900,
    vip: 9900,
  };
  const monthlyValue = monthlyValues[tier];

  // 付费概率预测（基于依赖度 + 互动）
  let conversionProb = 0;
  if (stickiness.level === "dependent") conversionProb = 0.8;
  else if (stickiness.level === "attached") conversionProb = 0.5;
  else if (stickiness.level === "regular") conversionProb = 0.25;
  else if (stickiness.level === "curious") conversionProb = 0.1;
  else conversionProb = 0.03;

  // LTV = 月价值 × 预期留存月数
  const estimatedMonths = tier === "free"
    ? stickiness.score / 20 + 2     // 免费用户预期 2-7 个月
    : stickiness.score / 15 + 6;    // 付费用户预期 6-12 个月

  const estimatedLTV = monthlyValue * estimatedMonths;

  // 推荐升级
  let recommendedTier: UserTier = tier;
  let urgency: LTVProfile["upgradeUrgency"] = "low";

  if (tier === "free" && stickiness.score >= 50) {
    recommendedTier = "pro";
    urgency = stickiness.score >= 70 ? "high" : "medium";
  } else if (tier === "pro" && stickiness.score >= 70) {
    recommendedTier = "vip";
    urgency = stickiness.score >= 85 ? "high" : "medium";
  }

  return {
    userId,
    tier,
    estimatedLTV: Math.round(estimatedLTV),
    monthlyValue,
    predictedConversion: conversionProb,
    recommendedTier,
    upgradeUrgency: urgency,
    daysSinceSignup,
    totalSpend: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// 整体指标
// ═══════════════════════════════════════════════════════════════
export function getGlobalMetrics(users: string[]): {
  arpu: number;
  avgLTV: number;
  conversionRate: number;
  churnRate: number;
  highValueCount: number;
} {
  let totalLTV = 0;
  let payingCount = 0;
  let highLTVCount = 0;

  for (const userId of users) {
    const ltv = calculateLTV(userId);
    totalLTV += ltv.estimatedLTV;
    if (ltv.tier !== "free") payingCount++;
    if (ltv.estimatedLTV > 50000) highLTVCount++; // LTV > ¥500
  }

  const count = users.length || 1;
  return {
    arpu: Math.round(totalLTV / count / 12),        // ARPU = LTV/12
    avgLTV: Math.round(totalLTV / count),
    conversionRate: payingCount / count,
    churnRate: 0.05,
    highValueCount: 0,
  };
}
