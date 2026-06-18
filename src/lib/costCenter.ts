// costCenter.ts — 全链路成本控制中心
// 实时统计，超预算自动降级，防止单用户烧钱

import { getUserTier, type UserTier, getUserDailyCost } from "./costManager";
import { getPlan, type PlanType } from "./billing";
import { checkTenantBudget, getUserTenant } from "./tenantManager";

export type DowngradeLevel = "none" | "llm_lite" | "cache_only" | "deny";

export interface CostDecision {
  allowed: boolean;
  estimatedCost: number;       // 预估本次成本(分)
  actualCost: number;          // 已消费(分)
  downgradeLevel: DowngradeLevel;
  reason?: string;
}

// ─── 系统总成本监控 ─────────────────────────────────────────
const systemStats = {
  totalCalls: 0,
  totalCost: 0,
  todayCost: 0,
  todayDate: new Date().toISOString().slice(0, 10),
};

export function recordSystemCost(costCents: number): void {
  const today = new Date().toISOString().slice(0, 10);
  if (systemStats.todayDate !== today) {
    systemStats.todayDate = today;
    systemStats.todayCost = 0;
  }
  systemStats.totalCalls++;
  systemStats.totalCost += costCents;
  systemStats.todayCost += costCents;
}

export function getSystemStats() {
  return { ...systemStats };
}

// ─── 单次请求成本决策 ───────────────────────────────────────
export function evaluateCost(
  userId: string,
  requestedServices: Array<"llm" | "tts" | "avatar">,
): CostDecision {
  const tier = getUserTier(userId);
  const plan = getPlan(tier as PlanType);
  const daily = getUserDailyCost(userId);
  const tenant = getUserTenant(userId);
  const tenantBudget = tenant ? checkTenantBudget(tenant.tenantId) : null;

  // 估算本次成本
  const priceMap = { llm: 2, tts: 1, avatar: 20 };
  const estimatedCost = requestedServices.reduce((sum, s) => sum + priceMap[s], 0);

  // 1. 租户预算检查
  if (tenantBudget && !tenantBudget.allowed) {
    return {
      allowed: false,
      estimatedCost,
      actualCost: daily.totalCost,
      downgradeLevel: "deny",
      reason: "租户月度预算已用尽",
    };
  }

  // 2. 用户日预算检查
  if (daily.totalCost + estimatedCost > plan.llmPerDay * 2 + plan.ttsPerDay + plan.avatarPerDay * 20) {
    // 超预算 → 降级
    if (tier === "free") {
      return {
        allowed: true,
        estimatedCost,
        actualCost: daily.totalCost,
        downgradeLevel: "cache_only",
        reason: "免费用户日预算接近上限，仅返回缓存结果",
      };
    }
    return {
      allowed: true,
      estimatedCost,
      actualCost: daily.totalCost,
      downgradeLevel: "llm_lite",
      reason: "日预算超限，降级为轻量模型",
    };
  }

  // 3. 正常通过
  return {
    allowed: true,
    estimatedCost,
    actualCost: daily.totalCost,
    downgradeLevel: "none",
  };
}
