// rateLimiter.ts — 请求限流系统
// 每用户每分钟请求限制，防止API被刷爆

import { atomicIncr } from "./redis";
import { getUserTier, type UserTier } from "./costManager";

// ─── 分级限流 ───────────────────────────────────────────────
const TIER_RATE_LIMITS: Record<UserTier, { perMinute: number; perHour: number }> = {
  free:  { perMinute: 5,  perHour: 30 },
  pro:   { perMinute: 15, perHour: 120 },
  vip:   { perMinute: 30, perHour: 500 },
};

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  remaining: number;
  resetMs: number;
}

// ─── 滑动窗口限流 ───────────────────────────────────────────
export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const tier = getUserTier(userId);
  const limits = TIER_RATE_LIMITS[tier];

  const minuteKey = "rate:" + userId + ":minute";
  const now = Date.now();
  const minuteStart = Math.floor(now / 60000) * 60000;
  const resetMs = minuteStart + 60000 - now;

  try {
    const count = await atomicIncr(minuteKey, 60);
    const remaining = Math.max(0, limits.perMinute - count);

    if (count > limits.perMinute) {
      return {
        allowed: false,
        reason: "请求过于频繁，请稍后再试",
        remaining: 0,
        resetMs,
      };
    }

    return { allowed: true, remaining: Math.max(0, remaining - 1), resetMs };
  } catch {
    // 限流器故障时放行
    return { allowed: true, remaining: 999, resetMs: 60000 };
  }
}

// ─── 简单内存降级限流 ───────────────────────────────────────
const memCounters = new Map<string, { count: number; reset: number }>();

export function checkRateLimitMem(userId: string): RateLimitResult {
  const tier = getUserTier(userId);
  const limits = TIER_RATE_LIMITS[tier];
  const now = Date.now();
  const minuteStart = Math.floor(now / 60000) * 60000;
  const resetMs = minuteStart + 60000 - now;
  const key = userId + ":" + minuteStart;

  const existing = memCounters.get(key);
  if (!existing || existing.reset < now) {
    memCounters.set(key, { count: 1, reset: minuteStart + 60000 });
    return { allowed: true, remaining: limits.perMinute - 1, resetMs };
  }

  existing.count++;
  const remaining = Math.max(0, limits.perMinute - existing.count);

  if (existing.count > limits.perMinute) {
    return { allowed: false, reason: "请求过于频繁", remaining: 0, resetMs };
  }

  return { allowed: true, remaining, resetMs };
}
