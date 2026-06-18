// ╔══════════════════════════════════════════════════════════════╗
// ║  logger.ts — 生产级结构化日志系统 (V5)                    ║
// ║  API / AI / Error / User / Cost / Performance              ║
// ╚══════════════════════════════════════════════════════════════╝

export type LogType = "api" | "ai" | "error" | "user" | "cost" | "perf" | "circuit";

export interface LogEntry {
  id: string;
  type: LogType;
  message: string;
  timestamp: string;
  userId?: string;
  durationMs?: number;
  costCents?: number;
  service?: string;
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
// 环形缓冲区（避免内存泄漏）
// ═══════════════════════════════════════════════════════════════
const MAX_BUFFER = 500;
const logBuffer: LogEntry[] = [];
let writeIndex = 0;

function pushEntry(entry: LogEntry): void {
  if (logBuffer.length < MAX_BUFFER) {
    logBuffer.push(entry);
  } else {
    logBuffer[writeIndex % MAX_BUFFER] = entry;
  }
  writeIndex++;

  // 同步输出到 stdout（容器日志采集）
  const level = entry.type === "error" ? "ERROR" : entry.type === "circuit" ? "WARN" : "INFO";
  const meta = entry.durationMs ? ` ${entry.durationMs}ms` : "";
  const cost = entry.costCents ? ` ¥${(entry.costCents / 100).toFixed(3)}` : "";
  console.log(`[${level}][${entry.type}] ${entry.timestamp} ${entry.message}${meta}${cost}`);
}

// ═══════════════════════════════════════════════════════════════
// 日志 API
// ═══════════════════════════════════════════════════════════════
export const logger = {
  api(method: string, path: string, meta?: { userId?: string; durationMs?: number; status?: number }) {
    pushEntry({
      id: genId(),
      type: "api",
      message: `${method} ${path} ${meta?.status || ""}`,
      timestamp: new Date().toISOString(),
      userId: meta?.userId,
      durationMs: meta?.durationMs,
    });
  },

  ai(service: string, action: string, meta?: { userId?: string; durationMs?: number; costCents?: number }) {
    pushEntry({
      id: genId(),
      type: "ai",
      message: `${service}:${action}`,
      timestamp: new Date().toISOString(),
      userId: meta?.userId,
      durationMs: meta?.durationMs,
      costCents: meta?.costCents,
      service,
    });
  },

  error(source: string, err: unknown, meta?: { userId?: string }) {
    const msg = err instanceof Error ? err.message : String(err);
    pushEntry({
      id: genId(),
      type: "error",
      message: `${source}: ${msg}`,
      timestamp: new Date().toISOString(),
      userId: meta?.userId,
      metadata: { stack: err instanceof Error ? err.stack?.slice(0, 300) : undefined },
    });
  },

  user(action: string, meta?: { userId?: string }) {
    pushEntry({
      id: genId(),
      type: "user",
      message: action,
      timestamp: new Date().toISOString(),
      userId: meta?.userId,
    });
  },

  cost(userId: string, service: string, cents: number) {
    pushEntry({
      id: genId(),
      type: "cost",
      message: `${service} cost`,
      timestamp: new Date().toISOString(),
      userId,
      costCents: cents,
      service,
    });
  },

  perf(label: string, durationMs: number) {
    pushEntry({
      id: genId(),
      type: "perf",
      message: `${label}: ${durationMs}ms`,
      timestamp: new Date().toISOString(),
      durationMs,
    });
  },

  circuit(service: string, state: string) {
    pushEntry({
      id: genId(),
      type: "circuit",
      message: `${service} circuit ${state}`,
      timestamp: new Date().toISOString(),
      service,
    });
  },
};

// ═══════════════════════════════════════════════════════════════
// 日志查询
// ═══════════════════════════════════════════════════════════════
export function getRecentLogs(limit = 100, type?: LogType): LogEntry[] {
  let logs = [...logBuffer];
  if (type) logs = logs.filter(l => l.type === type);
  return logs.slice(-limit).reverse();
}

export function getLogStats(): {
  total: number;
  errors: number;
  avgDuration: number;
  totalCost: number;
  byType: Record<LogType, number>;
} {
  const stats = {
    total: logBuffer.length,
    errors: 0,
    avgDuration: 0 as number,
    totalCost: 0,
    byType: {} as Record<LogType, number>,
  };

  let durationSum = 0;
  let durationCount = 0;

  for (const log of logBuffer) {
    stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
    if (log.type === "error") stats.errors++;
    if (log.durationMs) { durationSum += log.durationMs; durationCount++; }
    if (log.costCents) stats.totalCost += log.costCents;
  }

  stats.avgDuration = durationCount > 0 ? Math.round(durationSum / durationCount) : 0;
  return stats;
}

function genId(): string {
  return Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
}
