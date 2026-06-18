// ttsCache.ts — TTS缓存层（位于tts.ts之上）
// 相同文本只生成一次语音，后续直接复用
// 目标：重复调用减少 > 70%

interface CacheEntry {
  audioBase64: string;
  audioUrl: string;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const TTL = 60 * 60 * 1000; // 1小时
const MAX_SIZE = 2000;

// ─── 生成缓存键 ─────────────────────────────────────────────
export function buildTTSCacheKey(text: string): string {
  return text.trim().slice(0, 120);
}

// ─── 读取 ───────────────────────────────────────────────────
export function getTTSCache(key: string): { audioBase64: string; audioUrl: string } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL) {
    cache.delete(key);
    return null;
  }
  return { audioBase64: entry.audioBase64, audioUrl: entry.audioUrl };
}

// ─── 写入 ───────────────────────────────────────────────────
export function setTTSCache(key: string, audioBase64: string): void {
  if (cache.size >= MAX_SIZE) {
    const entries = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < Math.floor(MAX_SIZE * 0.15); i++) {
      if (entries[i]) cache.delete(entries[i][0]);
    }
  }
  cache.set(key, {
    audioBase64,
    audioUrl: "data:audio/mp3;base64," + audioBase64,
    ts: Date.now(),
  });
}

// ─── 统计 ───────────────────────────────────────────────────
let hits = 0;
let misses = 0;

export function recordTTSHit(): void { hits++; }
export function recordTTSMiss(): void { misses++; }

export function getTTSCacheStats(): { hits: number; misses: number; hitRate: number; size: number } {
  const total = hits + misses;
  return { hits, misses, hitRate: total > 0 ? hits / total : 0, size: cache.size };
}
