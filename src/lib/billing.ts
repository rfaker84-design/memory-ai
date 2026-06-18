// billing.ts — 计费系统（核心）
// 套餐定义 + 按调用计费 + 用户余额

export type PlanType = "free" | "pro" | "vip" | "enterprise";

export interface BillingPlan {
  type: PlanType;
  name: string;
  monthlyPrice: number;        // 分
  llmPerDay: number;
  ttsPerDay: number;
  avatarPerDay: number;
  llmModel: "doubao-lite" | "doubao-seed-1.8" | "doubao-pro";
  ttsQuality: "low" | "standard" | "high";
  avatarType: "static" | "generated" | "realtime";
  realtimeAvatar: boolean;
  priority: number;            // 队列优先级 0-3
  maxConcurrency: number;
}

// ─── 套餐定义 ───────────────────────────────────────────────
export const PLANS: Record<PlanType, BillingPlan> = {
  free: {
    type: "free",
    name: "免费版",
    monthlyPrice: 0,
    llmPerDay: 20,
    ttsPerDay: 10,
    avatarPerDay: 0,
    llmModel: "doubao-lite",
    ttsQuality: "low",
    avatarType: "static",
    realtimeAvatar: false,
    priority: 0,
    maxConcurrency: 1,
  },
  pro: {
    type: "pro",
    name: "专业版",
    monthlyPrice: 2900,        // ¥29/月
    llmPerDay: 100,
    ttsPerDay: 50,
    avatarPerDay: 1,
    llmModel: "doubao-seed-1.8",
    ttsQuality: "standard",
    avatarType: "generated",
    realtimeAvatar: false,
    priority: 1,
    maxConcurrency: 3,
  },
  vip: {
    type: "vip",
    name: "VIP版",
    monthlyPrice: 9900,        // ¥99/月
    llmPerDay: 500,
    ttsPerDay: 200,
    avatarPerDay: 3,
    llmModel: "doubao-pro",
    ttsQuality: "high",
    avatarType: "realtime",
    realtimeAvatar: true,
    priority: 2,
    maxConcurrency: 5,
  },
  enterprise: {
    type: "enterprise",
    name: "企业版",
    monthlyPrice: 49900,       // ¥499/月
    llmPerDay: 2000,
    ttsPerDay: 1000,
    avatarPerDay: 10,
    llmModel: "doubao-pro",
    ttsQuality: "high",
    avatarType: "realtime",
    realtimeAvatar: true,
    priority: 3,
    maxConcurrency: 20,
  },
};

// ─── 获取套餐 ───────────────────────────────────────────────
export function getPlan(type: PlanType | string): BillingPlan {
  return PLANS[type as PlanType] || PLANS.free;
}

// ─── 计费记录 ───────────────────────────────────────────────
interface BillingRecord {
  userId: string;
  date: string;
  calls: { llm: number; tts: number; avatar: number };
  cost: number; // 分
}

const billingRecords = new Map<string, BillingRecord>();

function billingKey(userId: string): string {
  return userId + ":" + new Date().toISOString().slice(0, 10);
}

export function recordBilling(userId: string, service: "llm" | "tts" | "avatar"): void {
  const key = billingKey(userId);
  const record = billingRecords.get(key) || {
    userId,
    date: new Date().toISOString().slice(0, 10),
    calls: { llm: 0, tts: 0, avatar: 0 },
    cost: 0,
  };

  const prices = { llm: 2, tts: 1, avatar: 20 };
  record.calls[service]++;
  record.cost += prices[service];
  billingRecords.set(key, record);
}

export function getUserBillingToday(userId: string): BillingRecord | null {
  return billingRecords.get(billingKey(userId)) || null;
}
