// ╔══════════════════════════════════════════════════════════════╗
// ║  engagementLoop.ts — 用户上瘾循环系统 (V7)               ║
// ║  使用 → 情绪反馈 → 依赖增强 → 更频繁使用                  ║
// ╚══════════════════════════════════════════════════════════════╝

import { recordInteraction, getStickiness } from "./emotionalStickiness";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export type LoopPhase = "entry" | "exploration" | "attachment" | "habit" | "addiction";

export interface EngagementSnapshot {
  userId: string;
  phase: LoopPhase;
  loopCount: number;            // 完成的上瘾循环次数
  avgSessionMinutes: number;
  returnRate: number;           // 回访率 (DAU/MAU proxy)
  deepeningSpeed: number;       // 依赖加深速度 (分/天)
  predictedPhaseDays: number;   // 预计到达下一阶段天数
}

// ═══════════════════════════════════════════════════════════════
// 上瘾循环阶段
// ═══════════════════════════════════════════════════════════════
export function getEngagementPhase(userId: string): EngagementSnapshot {
  const s = getStickiness(userId);

  let phase: LoopPhase;
  if (s.score >= 80) phase = "addiction";
  else if (s.score >= 55) phase = "habit";
  else if (s.score >= 30) phase = "attachment";
  else if (s.score >= 10) phase = "exploration";
  else phase = "entry";

  const deepeningSpeed = s.totalSessions > 0 ? s.score / s.totalSessions : 0;

  let predictedDays = 0;
  switch (phase) {
    case "entry": predictedDays = Math.ceil((10 - s.score) / Math.max(deepeningSpeed, 0.5)); break;
    case "exploration": predictedDays = Math.ceil((30 - s.score) / Math.max(deepeningSpeed, 0.5)); break;
    case "attachment": predictedDays = Math.ceil((55 - s.score) / Math.max(deepeningSpeed, 0.3)); break;
    case "habit": predictedDays = Math.ceil((80 - s.score) / Math.max(deepeningSpeed, 0.2)); break;
    case "addiction": predictedDays = 0; break;
  }

  return {
    userId,
    phase,
    loopCount: Math.floor(s.totalSessions / 3),
    avgSessionMinutes: 8 + phase === "addiction" ? 15 : phase === "habit" ? 10 : 5,
    returnRate: phase === "addiction" ? 0.9 : phase === "habit" ? 0.7 : phase === "attachment" ? 0.45 : 0.2,
    deepeningSpeed,
    predictedPhaseDays: predictedDays,
  };
}

// ═══════════════════════════════════════════════════════════════
// 上瘾循环触发器
// ═══════════════════════════════════════════════════════════════
export function triggerEngagementLoop(params: {
  userId: string;
  emotion: string;
  messageLength: number;
  isNightAccess: boolean;
}): {
  loopAdvanced: boolean;
  newPhase: LoopPhase;
  intervention: string | null;
} {
  const snapshot = getEngagementPhase(params.userId);

  // 干预策略
  let intervention: string | null = null;

  if (snapshot.phase === "entry" && params.messageLength > 30) {
    intervention = "welcome_back";  // 鼓励回访
  } else if (snapshot.phase === "exploration" && params.emotion === "sad") {
    intervention = "emotional_support";  // 情绪支持，加深连接
  } else if (snapshot.phase === "attachment" && snapshot.loopCount >= 5) {
    intervention = "memory_unlock";  // 解锁更深记忆
  } else if (snapshot.phase === "habit") {
    intervention = "vip_upsell";  // 转化时机
  }

  return {
    loopAdvanced: params.messageLength > 20,
    newPhase: snapshot.phase,
    intervention,
  };
}

// ═══════════════════════════════════════════════════════════════
// 统计
// ═══════════════════════════════════════════════════════════════
export function getLoopStats(): {
  totalInLoop: number;
  phaseDistribution: Record<LoopPhase, number>;
  avgLoopsToAddiction: number;
} {
  return {
    totalInLoop: 0,
    phaseDistribution: { entry: 0, exploration: 0, attachment: 0, habit: 0, addiction: 0 },
    avgLoopsToAddiction: 25,
  };
}
