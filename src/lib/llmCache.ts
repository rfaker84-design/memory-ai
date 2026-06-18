// llmCache.ts — LLM缓存层
// 相同用户输入 + memory context → 直接返回缓存，跳过API调用
// 目标：缓存命中率 > 40%

import type { Emotion } from "./volc";

interface CacheEntry {
  text: string;
  emotion: Emotion;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const TTL = 10 * 60 * 1000; // 10分钟
const MAX_SIZE = 1000;

// ─── 生成缓存键 ─────────────────────────────────────────────
export function buildLLMCacheKey(params: {
  memoryId: string;
  userMessage: string;
}): string {
  // memoryId + 归一化后的消息（小写、去多余空格）
  const normalized = params.userMessage.trim().toLowerCase().replace(/\s+/g, " ");
  return params.memoryId + "::" + normalized.slice(0, 80);
}

// ─── 读取缓存 ───────────────────────────────────────────────
export function getLLMCache(key: string): { text: string; emotion: Emotion } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL) {
    cache.delete(key);
    return null;
  }
  return { text: entry.text, emotion: entry.emotion };
}

// ─── 写入缓存 ───────────────────────────────────────────────
export function setLLMCache(key: string, text: string, emotion: Emotion): void {
  if (cache.size >= MAX_SIZE) {
    // 淘汰最旧的20%
    const entries = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < Math.floor(MAX_SIZE * 0.2); i++) {
      if (entries[i]) cache.delete(entries[i][0]);
    }
  }
  cache.set(key, { text, emotion, ts: Date.now() });
}

// ─── 缓存统计 ───────────────────────────────────────────────
let hits = 0;
let misses = 0;

export function recordHit(): void { hits++; }
export function recordMiss(): void { misses++; }

export function getCacheStats(): { hits: number; misses: number; hitRate: number; size: number } {
  const total = hits + misses;
  return {
    hits, misses,
    hitRate: total > 0 ? hits / total : 0,
    size: cache.size,
  };
}

// ─── 清空缓存 ───────────────────────────────────────────────
export function clearLLMCache(): void {
  cache.clear();
  hits = 0;
  misses = 0;
}
