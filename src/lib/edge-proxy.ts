// ╔══════════════════════════════════════════════════════════════╗
// ║  edge-proxy.ts — Edge/CDN 配置层 (V5)                      ║
// ║  静态资源路由、缓存策略、多区域分发                          ║
// ╚══════════════════════════════════════════════════════════════╝

// ═══════════════════════════════════════════════════════════════
// CDN 配置
// ═══════════════════════════════════════════════════════════════
export interface CDNConfig {
  origin: string;
  regions: string[];
  cacheRules: CacheRule[];
}

export interface CacheRule {
  pattern: string;
  ttl: number;           // 秒
  staleWhileRevalidate: number; // 秒
  immutable: boolean;
}

// ═══════════════════════════════════════════════════════════════
// 默认 CDN 规则
// ═══════════════════════════════════════════════════════════════
export const CDN_RULES: CacheRule[] = [
  // 静态构建产物（不可变）
  { pattern: "/_next/static/**", ttl: 31536000, staleWhileRevalidate: 0, immutable: true },
  // 公共静态资源
  { pattern: "/static/**", ttl: 2592000, staleWhileRevalidate: 86400, immutable: false },
  // 头像图片
  { pattern: "/avatars/**", ttl: 604800, staleWhileRevalidate: 86400, immutable: false },
  // 音频文件
  { pattern: "/audio/**", ttl: 86400, staleWhileRevalidate: 3600, immutable: false },
  // API（不缓存，由应用层控制）
  { pattern: "/api/**", ttl: 0, staleWhileRevalidate: 0, immutable: false },
  // 默认
  { pattern: "/**", ttl: 3600, staleWhileRevalidate: 600, immutable: false },
];

// ═══════════════════════════════════════════════════════════════
// 缓存键生成
// ═══════════════════════════════════════════════════════════════
export function getCacheRule(path: string): CacheRule {
  for (const rule of CDN_RULES) {
    if (matchGlob(path, rule.pattern)) return rule;
  }
  return CDN_RULES[CDN_RULES.length - 1];
}

function matchGlob(path: string, pattern: string): boolean {
  const regex = new RegExp(
    "^" + pattern
      .replace(/\*\*/g, "[[GLOB_STAR]]")
      .replace(/\*/g, "[^/]*")
      .replace(/\[\[GLOB_STAR\]\]/g, ".*")
    + "$"
  );
  return regex.test(path);
}

// ═══════════════════════════════════════════════════════════════
// 响应头生成
// ═══════════════════════════════════════════════════════════════
export function getCacheHeaders(path: string): Record<string, string> {
  const rule = getCacheRule(path);

  if (rule.ttl === 0) {
    return {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-CDN": "MemoryAI-Edge",
    };
  }

  const headers: Record<string, string> = {
    "Cache-Control": `public, max-age=${rule.ttl}${rule.immutable ? ", immutable" : ""}`,
    "X-CDN": "MemoryAI-Edge",
  };

  if (rule.staleWhileRevalidate > 0) {
    headers["Cache-Control"] += `, stale-while-revalidate=${rule.staleWhileRevalidate}`;
  }

  return headers;
}

// ═══════════════════════════════════════════════════════════════
// 多区域分发端点
// ═══════════════════════════════════════════════════════════════
export function getRegionalEndpoint(region?: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // 生产环境：根据用户区域返回最近的 CDN 节点
  const endpoints: Record<string, string> = {
    "cn-east": "https://cn-east.yijianmemory.cn",
    "cn-north": "https://cn-north.yijianmemory.cn",
    "cn-south": "https://cn-south.yijianmemory.cn",
  };

  return endpoints[region || ""] || base;
}

// ═══════════════════════════════════════════════════════════════
// 资源 URL 优化（自动选择 CDN）
// ═══════════════════════════════════════════════════════════════
export function getAssetUrl(path: string): string {
  const cdnBase = process.env.CDN_BASE_URL;
  if (!cdnBase) return path;
  return cdnBase.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}
