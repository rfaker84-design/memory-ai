// modelRouter.ts — 模型自动降级系统
// 根据成本/用户等级/系统负载动态选择模型

import type { DowngradeLevel } from "./costCenter";
import type { UserTier } from "./costManager";

export interface ModelSelection {
  llmModel: string;
  ttsQuality: "low" | "standard" | "high" | "none";
  avatarType: "static" | "generated" | "realtime" | "none";
  useCache: boolean;
}

// ─── 模型分级 ───────────────────────────────────────────────
const MODEL_MAP = {
  vip:    { llm: "doubao-pro",      tts: "high",     avatar: "realtime" },
  pro:    { llm: "doubao-seed-1.8", tts: "standard", avatar: "generated" },
  free:   { llm: "doubao-lite",     tts: "low",      avatar: "static" },
} as const;

// ─── 降级映射 ───────────────────────────────────────────────
function applyDowngrade(
  base: { llm: string; tts: "low" | "standard" | "high"; avatar: "static" | "generated" | "realtime" },
  level: DowngradeLevel,
): ModelSelection {
  switch (level) {
    case "none":
      return { llmModel: base.llm, ttsQuality: base.tts, avatarType: base.avatar, useCache: false };
    case "llm_lite":
      return { llmModel: "doubao-lite", ttsQuality: "low", avatarType: "static", useCache: false };
    case "cache_only":
      return { llmModel: "cache", ttsQuality: "low", avatarType: "static", useCache: true };
    case "deny":
      return { llmModel: "none", ttsQuality: "low", avatarType: "static", useCache: true };
  }
}

// ─── 选择模型 ───────────────────────────────────────────────
export function selectModel(
  tier: UserTier,
  downgradeLevel: DowngradeLevel,
  systemLoad: number,           // 0-1, 当前系统负载
): ModelSelection {
  const base = MODEL_MAP[tier] || MODEL_MAP.free;

  // 高负载时自动降低一级
  if (systemLoad > 0.8 && downgradeLevel === "none") {
    return applyDowngrade(base, "llm_lite");
  }

  return applyDowngrade(base, downgradeLevel);
}

// ─── 系统负载估算 ───────────────────────────────────────────
let concurrentRequests = 0;
const MAX_CONCURRENT = 200;

export function incrementLoad(): number {
  concurrentRequests++;
  return concurrentRequests / MAX_CONCURRENT;
}

export function decrementLoad(): number {
  concurrentRequests = Math.max(0, concurrentRequests - 1);
  return concurrentRequests / MAX_CONCURRENT;
}

export function getSystemLoad(): number {
  return concurrentRequests / MAX_CONCURRENT;
}
