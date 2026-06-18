// ╔══════════════════════════════════════════════════════════════╗
// ║  quota.ts — API额度管理系统 (V4 商业闭环)                 ║
// ║  每用户每日LLM/TTS/Avatar次数限制，超额自动降级或拒绝     ║
// ╚══════════════════════════════════════════════════════════════╝

import type { UserTier } from "./costManager";

// ═══════════════════════════════════════════════════════════════
// 配额定义
// ═══════════════════════════════════════════════════════════════
export interface QuotaLimits {
  llmPerDay: number;
  ttsPerDay: number;
  avatarPerDay: number;
  maxCostPerDay: number;     // 分
  concurrencyLimit: number;
}

const QUOTA: Record<UserTier | "enterprise", QuotaLimits> = {
  free: {
    llmPerDay: 20,
    ttsPerDay: 10,
    avatarPerDay: 0,
    maxCostPerDay: 100,      // ¥1/天
    concurrencyLimit: 1,
  },
  pro: {
    llmPerDay: 100,
    ttsPerDay: 50,
    avatarPerDay: 1,
    maxCostPerDay: 500,      // ¥5/天
    concurrencyLimit: 3,
  },
  vip: {
    llmPerDay: 500,
    ttsPerDay: 200,
    avatarPerDay: 3,
    maxCostPerDay: 2000,     // ¥20/天
    concurrencyLimit: 5,
  },
  enterprise: {
    llmPerDay: 2000,
    ttsPerDay: 1000,
    avatarPerDay: 10,
    maxCostPerDay: 10000,    // ¥100/天
    concurrencyLimit: 20,
  },
};

// ═══════════════════════════════════════════════════════════════
// 使用量追踪（内存，生产换 Redis）
// ═══════════════════════════════════════════════════════════════
interface UsageRecord {
  llm: number;
  tts: number;
  avatar: number;
  cost: number;
  date: string;
}

const usageStore = new Map<string, UsageRecord>();

function key(userId: string): string {
  return userId + ":" + new Date().toISOString().slice(0, 10);
}

function getUsage(userId: string): UsageRecord {
  const k = key(userId);
  const existing = usageStore.get(k);
  if (existing) return existing;
  const record: UsageRecord = {
    llm: 0,
    tts: 0,
    avatar: 0,
    cost: 0,
    date: new Date().toISOString().slice(0, 10),
  };
  usageStore.set(k, record);
  return record;
}

// ═══════════════════════════════════════════════════════════════
// 获取限额
// ═══════════════════════════════════════════════════════════════
export function getQuotaLimits(tier: UserTier | string): QuotaLimits {
  return QUOTA[tier as UserTier] || QUOTA.free;
}

// ═══════════════════════════════════════════════════════════════
// 检查额度
// ═══════════════════════════════════════════════════════════════
export interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  service: "llm" | "tts" | "avatar";
  used: number;
  limit: number;
  remaining: number;
  usagePercent: number;
}

export function checkQuota(
  userId: string,
  tier: UserTier | string,
  service: "llm" | "tts" | "avatar",
): QuotaCheck {
  const limits = getQuotaLimits(tier);
  const usage = getUsage(userId);

  let used: number;
  let limit: number;

  switch (service) {
    case "llm":
      used = usage.llm;
      limit = limits.llmPerDay;
      break;
    case "tts":
      used = usage.tts;
      limit = limits.ttsPerDay;
      break;
    case "avatar":
      used = usage.avatar;
      limit = limits.avatarPerDay;
      break;
  }

  const remaining = Math.max(0, limit - used);
  const allowed = used < limit;
  const usagePercent = limit > 0 ? (used / limit) * 100 : 100;

  return {
    allowed,
    reason: allowed ? undefined : `${service} 日额度已用尽（${used}/${limit}）`,
    service,
    used,
    limit,
    remaining,
    usagePercent,
  };
}

// ═══════════════════════════════════════════════════════════════
// 记录使用
// ═══════════════════════════════════════════════════════════════
export function recordUsage(
  userId: string,
  service: "llm" | "tts" | "avatar",
  costCents: number = 0,
): void {
  const usage = getUsage(userId);
  switch (service) {
    case "llm": usage.llm++; break;
    case "tts": usage.tts++; break;
    case "avatar": usage.avatar++; break;
  }
  usage.cost += costCents;
}

// ═══════════════════════════════════════════════════════════════
// 获取用户今日使用量
// ═══════════════════════════════════════════════════════════════
export function getUserUsage(userId: string): UsageRecord {
  return getUsage(userId);
}

// ═══════════════════════════════════════════════════════════════
// 检查是否需要升级引导
// ═══════════════════════════════════════════════════════════════
export function shouldUpsell(
  userId: string,
  tier: UserTier | string,
): { shouldUpsell: boolean; reason: string; targetTier: string } | null {
  if (tier === "vip" || tier === "enterprise") return null;

  const usage = getUsage(userId);
  const limits = getQuotaLimits(tier);
  const llmPct = limits.llmPerDay > 0 ? (usage.llm / limits.llmPerDay) * 100 : 0;

  // 使用超过70%时引导升级
  if (llmPct >= 80) {
    return {
      shouldUpsell: true,
      reason: `已使用 ${usage.llm}/${limits.llmPerDay} 次对话（${Math.round(llmPct)}%），升级解锁更多`,
      targetTier: tier === "free" ? "pro" : "vip",
    };
  }

  if (usage.tts >= limits.ttsPerDay * 0.8 && limits.ttsPerDay > 0) {
    return {
      shouldUpsell: true,
      reason: `语音额度即将用尽，升级解锁高清语音`,
      targetTier: tier === "free" ? "pro" : "vip",
    };
  }

  return null;
}
