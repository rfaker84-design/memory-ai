/**
 * 忆见 V7+ 并发控制系统
 * 每用户滑动窗口限制，防止 API 过载
 */

type ConcurrencyType = "ai" | "voice" | "avatar";

interface WindowEntry {
  timestamps: number[];
}

const LIMITS: Record<ConcurrencyType, { max: number; windowMs: number }> = {
  ai:    { max: 5,  windowMs: 60_000 },    // 5次/分钟
  voice: { max: 2,  windowMs: 60_000 },    // 2次/分钟
  avatar:{ max: 1,  windowMs: 180_000 },   // 1次/3分钟
};

const windows = new Map<string, WindowEntry>();

function getKey(userId: string, type: ConcurrencyType): string {
  return `${type}:${userId}`;
}

function pruneTimestamps(timestamps: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  // Filter is fast enough for small arrays (< 10 elements)
  return timestamps.filter(t => t > cutoff);
}

/**
 * 检查并发限制
 */
export function checkConcurrency(
  userId: string,
  type: ConcurrencyType
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  if (!userId) return { allowed: true, remaining: 999, retryAfterMs: 0 };

  const limit = LIMITS[type];
  const key = getKey(userId, type);
  const now = Date.now();

  let entry = windows.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(key, entry);
  }

  // Prune old entries
  entry.timestamps = pruneTimestamps(entry.timestamps, limit.windowMs, now);

  if (entry.timestamps.length >= limit.max) {
    const oldest = entry.timestamps[0];
    const retryAfterMs = oldest + limit.windowMs - now;
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
  }

  entry.timestamps.push(now);
  return { allowed: true, remaining: limit.max - entry.timestamps.length, retryAfterMs: 0 };
}

/**
 * 获取当前使用统计
 */
export function getConcurrencyStats(
  userId: string,
  type: ConcurrencyType
): { used: number; limit: number; remaining: number } {
  const limit = LIMITS[type];
  const key = getKey(userId, type);
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry) return { used: 0, limit: limit.max, remaining: limit.max };

  entry.timestamps = pruneTimestamps(entry.timestamps, limit.windowMs, now);
  return {
    used: entry.timestamps.length,
    limit: limit.max,
    remaining: Math.max(0, limit.max - entry.timestamps.length),
  };
}

/**
 * 重置所有计数器（测试用）
 */
export function resetConcurrency(): void {
  windows.clear();
}
