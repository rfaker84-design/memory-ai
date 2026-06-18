// redis.ts — 统一缓存层
// 默认内存实现，设置REDIS_URL后自动切换ioredis

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttl?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}

class MemRedis implements RedisLike {
  private store = new Map<string, { value: string; expires: number }>();
  private cleanTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanTimer = setInterval(() => this.cleanup(), 60_000);
  }
  private cleanup(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (v.expires > 0 && v.expires < now) this.store.delete(k);
    }
  }
  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expires > 0 && entry.expires < Date.now()) { this.store.delete(key); return null; }
    return entry.value;
  }
  async set(key: string, value: string, _mode?: string, ttl?: number): Promise<"OK"> {
    this.store.set(key, { value, expires: ttl ? Date.now() + ttl * 1000 : 0 });
    return "OK";
  }
  async del(key: string): Promise<number> { return this.store.delete(key) ? 1 : 0; }
  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return [...this.store.keys()].filter(k => regex.test(k));
  }
  destroy(): void { clearInterval(this.cleanTimer); }
}

let client: RedisLike | null = null;

async function getClient(): Promise<RedisLike> {
  if (client) return client;
  client = new MemRedis();
  return client;
}

// 外部可注入Redis客户端（例如ioredis实例）
export function injectRedisClient(c: RedisLike): void {
  client = c;
}

export async function cacheGet(key: string): Promise<string | null> {
  const c = await getClient();
  return c.get("yijian:" + key);
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const c = await getClient();
  await c.set("yijian:" + key, value, "EX", ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  const c = await getClient();
  await c.del("yijian:" + key);
}

export async function cacheKeys(pattern: string): Promise<string[]> {
  const c = await getClient();
  const keys = await c.keys("yijian:" + pattern);
  return keys.map(k => k.replace("yijian:", ""));
}

export async function atomicIncr(key: string, ttlSeconds: number): Promise<number> {
  const c = await getClient();
  const val = await c.get("yijian:" + key);
  const num = (parseInt(val || "0", 10) || 0) + 1;
  await c.set("yijian:" + key, String(num), "EX", ttlSeconds);
  return num;
}