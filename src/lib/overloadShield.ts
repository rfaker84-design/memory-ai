// ╔══════════════════════════════════════════════════════════════╗
// ║  overloadShield.ts — 超载保护 + 自适应降级 (V5)          ║
// ║  防止系统过载雪崩，动态调节服务质量                          ║
// ╚══════════════════════════════════════════════════════════════╝

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════
export type LoadLevel = "normal" | "elevated" | "high" | "critical";

export interface SystemHealth {
  loadLevel: LoadLevel;
  activeRequests: number;
  maxConcurrent: number;
  cpuUsage: number;           // 0-1 (estimated)
  queueDepth: number;
  rejectRate: number;         // 0-1
  degradedServices: string[];
  uptime: number;             // ms
}

// ═══════════════════════════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════════════════════════
const CONFIG = {
  maxConcurrent: 200,
  queueMaxSize: 500,
  // 负载阈值
  thresholds: {
    elevated: 0.5,   // 50% → elevated
    high: 0.75,      // 75% → high
    critical: 0.9,   // 90% → critical
  },
  // 各级降级策略
  degradation: {
    normal: [] as string[],
    elevated: [] as string[],                    // 不停服务
    high: ["avatar"] as string[],                // 关停 Avatar
    critical: ["avatar", "tts"] as string[],     // 关停 Avatar + TTS
  },
  // 拒绝策略
  rejectThresholds: {
    elevated: 0.0,   // 不拒绝
    high: 0.3,       // 拒绝 30%
    critical: 0.7,   // 拒绝 70%
  },
};

// ═══════════════════════════════════════════════════════════════
// 系统状态
// ═══════════════════════════════════════════════════════════════
let activeRequests = 0;
let totalRequests = 0;
let rejectedRequests = 0;
let startTime = Date.now();

// ═══════════════════════════════════════════════════════════════
// 请求准入
// ═══════════════════════════════════════════════════════════════
export function admitRequest(): { admitted: boolean; reason?: string } {
  totalRequests++;
  const load = getLoadLevel();
  const rejectRate = getRejectRate(load);

  // 超过最大并发
  if (activeRequests >= CONFIG.maxConcurrent) {
    rejectedRequests++;
    return { admitted: false, reason: "系统繁忙，请稍后重试" };
  }

  // 按比例拒绝
  if (Math.random() < rejectRate) {
    rejectedRequests++;
    return { admitted: false, reason: "系统过载，已启用限流保护" };
  }

  activeRequests++;
  return { admitted: true };
}

// ═══════════════════════════════════════════════════════════════
// 请求完成
// ═══════════════════════════════════════════════════════════════
export function releaseRequest(): void {
  activeRequests = Math.max(0, activeRequests - 1);
}

// ═══════════════════════════════════════════════════════════════
// 负载等级评估
// ═══════════════════════════════════════════════════════════════
export function getLoadLevel(): LoadLevel {
  const loadRatio = activeRequests / CONFIG.maxConcurrent;

  if (loadRatio >= CONFIG.thresholds.critical) return "critical";
  if (loadRatio >= CONFIG.thresholds.high) return "high";
  if (loadRatio >= CONFIG.thresholds.elevated) return "elevated";
  return "normal";
}

function getRejectRate(level: LoadLevel): number {
  switch (level) {
    case "critical": return CONFIG.rejectThresholds.critical;
    case "high": return CONFIG.rejectThresholds.high;
    case "elevated": return CONFIG.rejectThresholds.elevated;
    default: return 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// 服务是否可用（降级检查）
// ═══════════════════════════════════════════════════════════════
export function isServiceAvailable(service: "llm" | "tts" | "avatar"): boolean {
  const level = getLoadLevel();
  const degraded = CONFIG.degradation[level] || [];
  return !degraded.includes(service);
}

// ═══════════════════════════════════════════════════════════════
// 系统健康检查
// ═══════════════════════════════════════════════════════════════
export function getSystemHealth(): SystemHealth {
  const level = getLoadLevel();
  const total = totalRequests || 1;

  return {
    loadLevel: level,
    activeRequests,
    maxConcurrent: CONFIG.maxConcurrent,
    cpuUsage: activeRequests / CONFIG.maxConcurrent,
    queueDepth: 0,
    rejectRate: rejectedRequests / total,
    degradedServices: CONFIG.degradation[level] || [],
    uptime: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════
// 自适应压力调节
// ═══════════════════════════════════════════════════════════════
export function adjustCapacity(currentRPS: number): {
  newMaxConcurrent: number;
  recommendation: string;
} {
  const level = getLoadLevel();

  switch (level) {
    case "normal":
      return { newMaxConcurrent: CONFIG.maxConcurrent, recommendation: "正常运行" };
    case "elevated":
      return { newMaxConcurrent: Math.floor(CONFIG.maxConcurrent * 0.8), recommendation: "建议扩容 20%" };
    case "high":
      return { newMaxConcurrent: Math.floor(CONFIG.maxConcurrent * 0.6), recommendation: "急需扩容，建议降级非核心服务" };
    case "critical":
      return { newMaxConcurrent: Math.floor(CONFIG.maxConcurrent * 0.4), recommendation: "紧急限流，立即扩容" };
  }
}

// ═══════════════════════════════════════════════════════════════
// 重置统计
// ═══════════════════════════════════════════════════════════════
export function resetShieldStats(): void {
  totalRequests = 0;
  rejectedRequests = 0;
  startTime = Date.now();
}
