// avatarManager.ts — Avatar持久化管理器
// 每个 memory 只生成一次头像，后续请求直接复用
// 优先: 即梦AI → Supabase缓存 → 静态占位头像（永不返回null）

import type { Emotion } from "./volc";
import { generateAvatar } from "./avatar";

interface AvatarRecord {
  avatarUrl: string;
  emotion: Emotion;
  ts: number;
}

// 热缓存
const hotCache = new Map<string, AvatarRecord>();
const HOT_TTL = 30 * 60 * 1000; // 30分钟热缓存

// ─── 生成键 ─────────────────────────────────────────────────
function avatarKey(memoryId: string): string {
  return "avatar:" + memoryId;
}

// ─── 静态占位头像（确定性SVG data URL）────────────────────────
function generateStaticAvatar(name: string, emotion: Emotion): string {
  const colors: Record<Emotion, [string, string]> = {
    warm: ["#5a4030", "#3a2820"],
    calm: ["#2a3a50", "#1a2a38"],
    sad: ["#2a2a38", "#1a1a28"],
    nostalgic: ["#4a3828", "#3a2818"],
  };
  const [c1, c2] = colors[emotion] || colors.calm;
  const initial = (name || "TA").charAt(0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="${c1}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${c2}" stop-opacity="0.95"/>
    </radialGradient>
  </defs>
  <rect width="200" height="200" rx="100" fill="url(#g)"/>
  <text x="100" y="115" text-anchor="middle" fill="rgba(220,210,200,0.45)"
    font-family="sans-serif" font-size="80" font-weight="300">${initial}</text>
</svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

// ─── 从Supabase读取已有头像 ─────────────────────────────────
async function loadFromDB(memoryId: string): Promise<string | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return null;

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data } = await supabase
      .from("memories")
      .select("avatar_image_url")
      .eq("id", memoryId)
      .single();

    return data?.avatar_image_url || null;
  } catch {
    return null;
  }
}

// ─── 保存到Supabase ─────────────────────────────────────────
async function saveToDB(memoryId: string, avatarUrl: string): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase
      .from("memories")
      .update({ avatar_image_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", memoryId);
  } catch {
    // 非致命
  }
}

// ─── 主入口：获取或生成头像（永不返回null）───────────────────
export async function getOrGenerateAvatar(
  memoryId: string,
  emotion: Emotion,
  name?: string,
): Promise<string> {
  const key = avatarKey(memoryId);

  // 1. 检查热缓存
  const hot = hotCache.get(key);
  if (hot && Date.now() - hot.ts < HOT_TTL) {
    return hot.avatarUrl;
  }

  // 2. 检查Supabase持久化
  try {
    const dbUrl = await loadFromDB(memoryId);
    if (dbUrl) {
      hotCache.set(key, { avatarUrl: dbUrl, emotion, ts: Date.now() });
      return dbUrl;
    }
  } catch { /* 非致命 */ }

  // 3. 即梦AI首次生成
  try {
    const result = await generateAvatar(emotion);
    if (result.avatarUrl) {
      hotCache.set(key, { avatarUrl: result.avatarUrl, emotion, ts: Date.now() });
      saveToDB(memoryId, result.avatarUrl); // 不await，后台完成
      return result.avatarUrl;
    }
  } catch { /* 非致命，降级到静态头像 */ }

  // 4. 最终降级：静态占位头像（确定性SVG）
  console.warn("[avatar] 即梦AI不可用，使用静态占位头像 for", memoryId);
  const staticUrl = generateStaticAvatar(name || "TA", emotion);
  hotCache.set(key, { avatarUrl: staticUrl, emotion, ts: Date.now() });
  return staticUrl;
}

// ─── 统计 ───────────────────────────────────────────────────
let generations = 0;
let cacheHits = 0;

export function recordAvatarGen(): void { generations++; }
export function recordAvatarHit(): void { cacheHits++; }

export function getAvatarStats(): { generations: number; hits: number; hotSize: number } {
  return { generations, hits: cacheHits, hotSize: hotCache.size };
}
