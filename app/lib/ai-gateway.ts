/**
 * 忆见 MemoryAI — AI Gateway (Production)
 * 
 * 统一调用入口，负责：
 *   速率限制 → 缓存检查 → 请求队列 → API调用 → 降级
 * 
 * 三层降级: PRIMARY → SECONDARY → FALLBACK
 */

import { checkRateLimit } from "../../src/lib/cost-control";
import { checkConcurrency } from "../../src/lib/concurrency-control";
import { dedupCache, cacheKey, aiReplyCache } from "../../src/lib/cache";
import { getFallbackReply } from "../../src/lib/fallback";

/* =========================================================================
   Types
   ========================================================================= */

export type CallTier = "primary" | "secondary" | "fallback";

export interface GatewayConfig {
  userId: string;
  tier?: CallTier;
  cacheTtl?: number;          // ms, 默认 10min
  forceRefresh?: boolean;
}

export interface GatewayResult {
  text: string;
  tier: CallTier;
  cached: boolean;
  latency: number;
}

/* =========================================================================
   Simple Request Queue
   ========================================================================= */

const MAX_CONCURRENT = 3;
let running = 0;
const queue: Array<() => void> = [];

function enqueue(fn: () => void): void {
  if (running < MAX_CONCURRENT) {
    running++;
    fn();
  } else {
    queue.push(fn);
  }
}

function dequeue(): void {
  if (queue.length > 0) {
    queue.shift()!();
  } else {
    running--;
  }
}

/* =========================================================================
   Delay utility
   ========================================================================= */

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/* =========================================================================
   Health Monitor
   ========================================================================= */

interface HealthState {
  totalCalls: number;
  failures: number;
  avgLatency: number;
  lastCheck: number;
}

const health: HealthState = {
  totalCalls: 0,
  failures: 0,
  avgLatency: 0,
  lastCheck: Date.now(),
};

export function getHealth(): HealthState & { errorRate: number; mode: CallTier } {
  const errorRate = health.totalCalls > 0 ? health.failures / health.totalCalls : 0;
  const mode: CallTier = errorRate > 0.2 ? "fallback" : "primary";
  return { ...health, errorRate, mode };
}

export function recordCall(success: boolean, latency: number): void {
  health.totalCalls++;
  if (!success) health.failures++;
  // Exponential moving average
  health.avgLatency = health.avgLatency * 0.9 + latency * 0.1;
  health.lastCheck = Date.now();
}

/* =========================================================================
   AI Gateway — Main Entry
   ========================================================================= */

export interface AiCallParams {
  userId: string;
  memoryId: string;
  message: string;
  personalityType?: string;
  /** Function that performs the actual API call */
  doCall: () => Promise<string>;
  /** Optional secondary call */
  doSecondaryCall?: () => Promise<string>;
}

/**
 * 统一 AI 调用入口
 * 自动处理: 限流 → 缓存 → 队列 → 调用 → 降级
 */
export async function aiGateway(params: AiCallParams): Promise<GatewayResult> {
  const { userId, memoryId, message, doCall, doSecondaryCall } = params;
  const startTime = Date.now();

  // 1) Rate limit check
  const rateLimit = checkRateLimit(userId);
  if (!rateLimit.allowed) {
    return {
      text: "TA需要休息一下，我们稍后再见。",
      tier: "fallback",
      cached: false,
      latency: Date.now() - startTime,
    };
  }

  // 2) Concurrency check
  const ccCheck = checkConcurrency(userId, "ai");
  if (!ccCheck.allowed) {
    // Return gentle cooldown instead of error
    return {
      text: "让我缓一缓，马上就好。",
      tier: "fallback",
      cached: false,
      latency: Date.now() - startTime,
    };
  }

  // 3) Cache check
  const key = cacheKey("ai", userId, memoryId, message.slice(0, 60));
  const cached = aiReplyCache.get<string>(key);
  if (cached) {
    return { text: cached, tier: "primary", cached: true, latency: Date.now() - startTime };
  }

  // 4) Dedup check
  const dedupKey = cacheKey("dedup", userId, message.slice(0, 60));
  if (dedupCache.has(dedupKey)) {
    // Wait for existing identical request (up to 5s)
    for (let i = 0; i < 10; i++) {
      await delay(500);
      const dedupResult = aiReplyCache.get<string>(key);
      if (dedupResult) {
        return { text: dedupResult, tier: "primary", cached: false, latency: Date.now() - startTime };
      }
    }
  }
  dedupCache.set(dedupKey, true, 10000); // 10s dedup window

  // 5) Queue + Execute
  return new Promise<GatewayResult>((resolve) => {
    enqueue(async () => {
      try {
        // Primary call
        const answer = await doCall();
        aiReplyCache.set(key, answer, 10 * 60 * 1000); // 10min TTL
        dedupCache.delete(dedupKey);
        recordCall(true, Date.now() - startTime);
        resolve({ text: answer, tier: "primary", cached: false, latency: Date.now() - startTime });
      } catch {
        // Secondary fallback
        try {
          if (doSecondaryCall) {
            const secondaryAnswer = await doSecondaryCall();
            aiReplyCache.set(key, secondaryAnswer, 5 * 60 * 1000);
            dedupCache.delete(dedupKey);
            recordCall(true, Date.now() - startTime);
            resolve({ text: secondaryAnswer, tier: "secondary", cached: false, latency: Date.now() - startTime });
            return;
          }
        } catch {
          // fall through to fallback
        }

        // Final fallback
        dedupCache.delete(dedupKey);
        recordCall(false, Date.now() - startTime);
        const emotion = message.includes("想") || message.includes("累") ? "sad" : "neutral";
        const fallbackText = getFallbackReply(emotion);
        resolve({ text: fallbackText, tier: "fallback", cached: false, latency: Date.now() - startTime });
      } finally {
        dequeue();
      }
    });
  });
}

/**
 * 确保最小+最大延迟的人性化包装
 */
export async function withHumanDelay<T>(fn: () => Promise<T>, minDelay = 600, maxDelay = 1500): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  const remaining = Math.max(minDelay - elapsed, 0);
  const extraDelay = Math.min(maxDelay - elapsed - remaining, 400);
  
  if (remaining > 0) await delay(remaining);
  if (extraDelay > 0) await delay(Math.random() * extraDelay);
  
  return result;
}