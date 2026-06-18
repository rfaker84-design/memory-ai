// costManager.ts — 成本计费系统
// 记录每用户每天成本，支持用户级限额与超额降级

export type UserTier = "free" | "pro" | "vip";

export interface CostRecord {
  userId: string;
  date: string;                 // YYYY-MM-DD
  llmCalls: number;
  ttsCalls: number;
  avatarCalls: number;
  totalCost: number;            // 估算成本(分)
  lastUpdated: number;
}

export interface TierLimits {
  maxLLMPerDay: number;
  maxTTSPerDay: number;
  maxAvatarPerDay: number;
  maxCostPerDay: number;        // 分
  cacheTTLMultiplier: number;   // 缓存时长倍数
  modelQuality: "low" | "standard" | "high";
}

// ─── 分级限额 ───────────────────────────────────────────────
const TIER_LIMITS: Record<UserTier, TierLimits> = {
  free: {
    maxLLMPerDay: 20,
    maxTTSPerDay: 10,
    maxAvatarPerDay: 0,
    maxCostPerDay: 100,      // 1元/天
    cacheTTLMultiplier: 3,   // 3倍缓存时长
    modelQuality: "low",
  },
  pro: {
    maxLLMPerDay: 100,
    maxTTSPerDay: 50,
    maxAvatarPerDay: 1,
    maxCostPerDay: 500,      // 5元/天
    cacheTTLMultiplier: 1,
    modelQuality: "standard",
  },
  vip: {
    maxLLMPerDay: 500,
    maxTTSPerDay: 200,
    maxAvatarPerDay: 3,
    maxCostPerDay: 2000,     // 20元/天
    cacheTTLMultiplier: 0.5,
    modelQuality: "high",
  },
};

// ─── 成本单价(分) ───────────────────────────────────────────
const UNIT_COSTS = {
  llm: 2,    // 每次LLM调用约2分
  tts: 1,    // 每次TTS约1分
  avatar: 20, // 每次头像生成约20分
};

// ─── 内存存储（生产换成DB）──────────────────────────────────
const records = new Map<string, CostRecord>();

function recordKey(userId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return userId + ":" + date;
}

function getOrCreateRecord(userId: string): CostRecord {
  const key = recordKey(userId);
  const existing = records.get(key);
  if (existing) return existing;

  const record: CostRecord = {
    userId,
    date: new Date().toISOString().slice(0, 10),
    llmCalls: 0,
    ttsCalls: 0,
    avatarCalls: 0,
    totalCost: 0,
    lastUpdated: Date.now(),
  };
  records.set(key, record);
  return record;
}

// ─── 获取用户等级 ───────────────────────────────────────────
export function getUserTier(userId: string): UserTier {
  // 生产: 从DB/Redis读取
  const tier = process.env["USER_TIER_" + userId];
  if (tier === "vip") return "vip";
  if (tier === "pro") return "pro";
  return "free";
}

export function getTierLimits(tier: UserTier): TierLimits {
  return TIER_LIMITS[tier];
}

// ─── 检查是否超限 ───────────────────────────────────────────
export function checkLimit(userId: string, type: "llm" | "tts" | "avatar"): {
  allowed: boolean;
  reason?: string;
  current: number;
  max: number;
} {
  const tier = getUserTier(userId);
  const limits = TIER_LIMITS[tier];
  const record = getOrCreateRecord(userId);

  switch (type) {
    case "llm":
      return {
        allowed: record.llmCalls < limits.maxLLMPerDay,
        reason: record.llmCalls >= limits.maxLLMPerDay ? "LLM日限额已用尽" : undefined,
        current: record.llmCalls,
        max: limits.maxLLMPerDay,
      };
    case "tts":
      return {
        allowed: record.ttsCalls < limits.maxTTSPerDay,
        reason: record.ttsCalls >= limits.maxTTSPerDay ? "TTS日限额已用尽" : undefined,
        current: record.ttsCalls,
        max: limits.maxTTSPerDay,
      };
    case "avatar":
      return {
        allowed: record.avatarCalls < limits.maxAvatarPerDay,
        reason: record.avatarCalls >= limits.maxAvatarPerDay ? "Avatar日限额已用尽" : undefined,
        current: record.avatarCalls,
        max: limits.maxAvatarPerDay,
      };
  }
}

// ─── 记录调用成本 ───────────────────────────────────────────
export function recordCost(userId: string, type: "llm" | "tts" | "avatar"): void {
  const record = getOrCreateRecord(userId);

  switch (type) {
    case "llm": record.llmCalls++; record.totalCost += UNIT_COSTS.llm; break;
    case "tts": record.ttsCalls++; record.totalCost += UNIT_COSTS.tts; break;
    case "avatar": record.avatarCalls++; record.totalCost += UNIT_COSTS.avatar; break;
  }
  record.lastUpdated = Date.now();
}

// ─── 获取用户今日成本 ───────────────────────────────────────
export function getUserDailyCost(userId: string): CostRecord {
  return getOrCreateRecord(userId);
}

// ─── 成本是否超限 ───────────────────────────────────────────
export function isOverBudget(userId: string): boolean {
  const tier = getUserTier(userId);
  const limits = TIER_LIMITS[tier];
  const record = getOrCreateRecord(userId);
  return record.totalCost >= limits.maxCostPerDay;
}
