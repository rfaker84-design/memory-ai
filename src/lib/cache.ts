/**
 * 忆见 V7+ 内存缓存系统
 * 基于 Map 的轻量缓存，支持 TTL 过期 + LRU 驱逐
 */

interface CacheEntry<T> {
  value: T;
  expiry: number;
  lastAccess: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) { this.misses++; return null; }
    if (Date.now() > entry.expiry) { this.store.delete(key); this.misses++; return null; }
    entry.lastAccess = Date.now();
    this.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    // Evict if at capacity and key is new
    if (!this.store.has(key) && this.store.size >= this.maxSize) {
      this.evictLRU();
    }
    const now = Date.now();
    this.store.set(key, { value, expiry: now + ttlMs, lastAccess: now });
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, entry] of this.store) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = k;
      }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }

  has(key: string): boolean { return this.get(key) !== null; }
  delete(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); this.hits = 0; this.misses = 0; }

  get size(): number { return this.store.size; }

  stats() { return { size: this.store.size, maxSize: this.maxSize, hits: this.hits, misses: this.misses }; }

  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  startCleanup(intervalMs = 60000) {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (now > entry.expiry) this.store.delete(key);
      }
    }, intervalMs);
  }
  stopCleanup() { if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; } }
}

// 缓存实例
export const aiReplyCache = new MemoryCache(500);   // AI回复缓存，最多500条
export const emotionCache = new MemoryCache(200);    // 情绪分析缓存
export const shareCache = new MemoryCache(100);      // 分享卡缓存
export const dedupCache = new MemoryCache(500);      // 去重缓存
export const voiceCache = new MemoryCache(200);      // 声音缓存 (永久 TTL 由调用方控制)
export const avatarCache = new MemoryCache(100);     // 数字人视频缓存

// 启动定时清理
aiReplyCache.startCleanup(60000);
emotionCache.startCleanup(120000);
shareCache.startCleanup(3600000);
dedupCache.startCleanup(60000);
voiceCache.startCleanup(300000);
avatarCache.startCleanup(600000);

export function cacheKey(prefix: string, ...parts: string[]): string {
  return prefix + ":" + parts.join(":");
}

export async function withCache<T>(
  cache: MemoryCache, key: string, ttlMs: number, factory: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) return cached;
  const value = await factory();
  cache.set(key, value, ttlMs);
  return value;
}

export { MemoryCache };
