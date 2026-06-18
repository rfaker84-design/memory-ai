// ╔══════════════════════════════════════════════════════════════╗
// ║  emotionalStickiness.ts — 情绪依赖系统 (V6 商业核心)      ║
// ║  用户依赖度评分 / 回访预测 / 个性化粘性优化               ║
// ╚══════════════════════════════════════════════════════════════╝

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export type StickinessLevel = "new" | "curious" | "regular" | "attached" | "dependent";

export interface StickinessProfile {
  userId: string;
  level: StickinessLevel;
  score: number;            // 0-100
  factors: StickinessFactors;
  churnRisk: number;        // 0-1, 流失风险
  predictedReturnDays: number;
  lastActive: string;
  totalSessions: number;
}

export interface StickinessFactors {
  frequency: number;        // 访问频率分
  recency: number;          // 最近活跃分
  depth: number;            // 对话深度分
  emotionalBond: number;    // 情感联结分
  nightAccess: number;      // 深夜访问分
  proactiveReturn: number;  // 主动回访分
}

// ═══════════════════════════════════════════════════════════════
// 内存存储
// ═══════════════════════════════════════════════════════════════
const profiles = new Map<string, StickinessProfile>();

function getOrCreate(userId: string): StickinessProfile {
  const existing = profiles.get(userId);
  if (existing) return existing;

  const profile: StickinessProfile = {
    userId,
    level: "new",
    score: 0,
    factors: { frequency: 0, recency: 0, depth: 0, emotionalBond: 0, nightAccess: 0, proactiveReturn: 0 },
    churnRisk: 1,
    predictedReturnDays: 0,
    lastActive: new Date().toISOString(),
    totalSessions: 0,
  };
  profiles.set(userId, profile);
  return profile;
}

// ═══════════════════════════════════════════════════════════════
// 记录互动并更新依赖度
// ═══════════════════════════════════════════════════════════════
export function recordInteraction(
  userId: string,
  params: {
    messageLength?: number;
    emotion?: string;
    isNightAccess?: boolean;
    isProactive?: boolean;
    sessionCount?: number;
  } = {},
): StickinessProfile {
  const p = getOrCreate(userId);
  const now = Date.now();

  p.totalSessions++;
  p.lastActive = new Date().toISOString();

  // ── 频率 ──────────────────────────────────────────────
  const hoursSinceLast = p.totalSessions > 1
    ? (now - new Date(p.lastActive).getTime()) / 3600000
    : 24;
  p.factors.frequency = Math.min(25, Math.max(0, 25 * (1 - hoursSinceLast / 48)));

  // ── 最近活跃 ──────────────────────────────────────────
  p.factors.recency = Math.min(25, 25 * (1 - Math.min(hoursSinceLast, 72) / 72));

  // ── 深度 ─────────────────────────────────────────────
  const msgLen = params.messageLength || 0;
  p.factors.depth = Math.min(20, msgLen > 50 ? 20 : msgLen > 20 ? 12 : 5);

  // ── 情感联结 ─────────────────────────────────────────
  if (params.emotion === "sad") p.factors.emotionalBond = Math.min(15, p.factors.emotionalBond + 5);
  else if (params.emotion === "nostalgic") p.factors.emotionalBond = Math.min(15, p.factors.emotionalBond + 3);
  else p.factors.emotionalBond = Math.max(0, p.factors.emotionalBond - 1);

  // ── 深夜 ─────────────────────────────────────────────
  if (params.isNightAccess) p.factors.nightAccess = Math.min(10, p.factors.nightAccess + 3);
  else p.factors.nightAccess = Math.max(0, p.factors.nightAccess - 1);

  // ── 主动回访 ─────────────────────────────────────────
  if (params.isProactive) p.factors.proactiveReturn = Math.min(5, p.factors.proactiveReturn + 2);

  // 计算总分
  const score = p.factors.frequency + p.factors.recency + p.factors.depth
    + p.factors.emotionalBond + p.factors.nightAccess + p.factors.proactiveReturn;
  p.score = Math.min(100, Math.round(score));

  // 分级
  if (p.score >= 80) p.level = "dependent";
  else if (p.score >= 55) p.level = "attached";
  else if (p.score >= 30) p.level = "regular";
  else if (p.score >= 10) p.level = "curious";
  else p.level = "new";

  // 流失风险（依赖度越高，流失风险越低）
  p.churnRisk = Math.max(0, 1 - p.score / 100);

  // 预测回访天数
  if (p.level === "dependent") p.predictedReturnDays = 1;
  else if (p.level === "attached") p.predictedReturnDays = 2;
  else if (p.level === "regular") p.predictedReturnDays = 4;
  else p.predictedReturnDays = 7;

  return p;
}

// ═══════════════════════════════════════════════════════════════
// 获取依赖度
// ═══════════════════════════════════════════════════════════════
export function getStickiness(userId: string): StickinessProfile {
  return getOrCreate(userId);
}

// ═══════════════════════════════════════════════════════════════
// 流失预警列表
// ═══════════════════════════════════════════════════════════════
export function getChurnRiskUsers(threshold = 0.6): StickinessProfile[] {
  return [...profiles.values()]
    .filter(p => p.churnRisk >= threshold)
    .sort((a, b) => b.churnRisk - a.churnRisk);
}

// ═══════════════════════════════════════════════════════════════
// 统计摘要
// ═══════════════════════════════════════════════════════════════
export function getStickinessStats(): {
  total: number;
  byLevel: Record<StickinessLevel, number>;
  avgScore: number;
  avgChurnRisk: number;
} {
  const all = [...profiles.values()];
  const byLevel: Record<string, number> = {};
  let sumScore = 0;

  for (const p of all) {
    byLevel[p.level] = (byLevel[p.level] || 0) + 1;
    sumScore += p.score;
  }

  return {
    total: all.length,
    byLevel: byLevel as Record<StickinessLevel, number>,
    avgScore: all.length ? Math.round(sumScore / all.length) : 0,
    avgChurnRisk: all.length ? Math.round(all.reduce((s, p) => s + p.churnRisk, 0) / all.length * 100) / 100 : 0,
  };
}
