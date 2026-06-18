/**
 * 忆见 V7 成本控制系统
 * 限制 AI 调用频率 + 请求去重
 */

import { dedupCache, cacheKey } from "./cache";

type PlanTier = "free" | "pro" | "premium";

const HOURLY_LIMITS: Record<PlanTier, number> = {
  free: 10,
  pro: 50,
  premium: 9999,
};

const callCounts = new Map<string, { count: number; hour: number }>();

function getHourKey(): number {
  return Math.floor(Date.now() / 3600000);
}

/**
 * 检查用户是否超过小时调用限制
 */
export function checkRateLimit(userPhone: string, plan: PlanTier = "free"): { allowed: boolean; remaining: number } {
  if (!userPhone) return { allowed: true, remaining: 999 };
  const limit = HOURLY_LIMITS[plan] || 10;
  const hourKey = getHourKey();
  const entry = callCounts.get(userPhone);

  if (!entry || entry.hour !== hourKey) {
    callCounts.set(userPhone, { count: 1, hour: hourKey });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

/**
 * 请求去重：相同内容 5 分钟内复用
 */
export function isDuplicate(userPhone: string, content: string): boolean {
  const key = cacheKey("dedup", userPhone, content.substring(0, 80));
  if (dedupCache.has(key)) return true;
  dedupCache.set(key, true, 5 * 60 * 1000);
  return false;
}

/**
 * 获取当前用量统计
 */
export function getUsageStats(userPhone: string, plan: PlanTier = "free"): { used: number; limit: number; remaining: number } {
  const limit = HOURLY_LIMITS[plan] || 10;
  const entry = callCounts.get(userPhone);
  const hourKey = getHourKey();
  const used = (entry && entry.hour === hourKey) ? entry.count : 0;
  return { used, limit, remaining: limit - used };
}

/**
 * 重置所有计数器 (用于测试)
 */
export function resetRateLimits(): void {
  callCounts.clear();
}
