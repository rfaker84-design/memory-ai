// avatar.ts — 即梦AI人脸生成 (生产版)
// Prompt: "真实亚洲女性/男性人脸，高写实风格，情绪：{emotion}，柔光，电影级摄影"

import type { Emotion } from "./volc";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AvatarResult {
  avatarUrl: string | null;
  provider: "jimeng" | "none";
}

// ─── 构建生成提示词 ─────────────────────────────────────────
function buildPrompt(emotion: Emotion): string {
  const emotionDesc: Record<Emotion, string> = {
    warm: "温暖的微笑，柔和的眼神",
    calm: "平静的表情，安宁的目光",
    sad: "淡淡的忧伤，温柔的低垂眼眸",
    nostalgic: "远望的怀念神情，温暖的追忆目光",
  };

  const desc = emotionDesc[emotion] || emotionDesc.calm;

  return `真实亚洲老年人人脸，高写实风格，${desc}，柔光，电影级摄影，85mm人像镜头，浅景深，深色简洁背景`;
}

// ─── 即梦AI调用 ─────────────────────────────────────────────
async function callJimeng(prompt: string): Promise<string> {
  const apiKey = process.env.JIMENG_API_KEY;
  if (!apiKey) {
    throw new Error("JIMENG_API_KEY 未配置");
  }

  // 即梦AI通过火山引擎ARK调用
  const resp = await fetch("https://ark.cn-beijing.volces.com/api/v3/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: "jimeng-2.1",
      prompt,
      n: 1,
      size: "512x512",
      response_format: "url",
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error("即梦AI HTTP " + resp.status + ": " + body.slice(0, 200));
  }

  const data = await resp.json();
  const url = data.data?.[0]?.url;
  if (!url) {
    throw new Error("即梦AI返回无图片URL");
  }

  return url;
}

// ─── 主入口 ─────────────────────────────────────────────────
export async function generateAvatar(emotion: Emotion): Promise<AvatarResult> {
  const prompt = buildPrompt(emotion);

  try {
    const url = await callJimeng(prompt);
    return { avatarUrl: url, provider: "jimeng" };
  } catch (err) {
    console.error("[avatar] 即梦AI生成失败:", err instanceof Error ? err.message : err);
    // 明确失败，不返回假数据
    return { avatarUrl: null, provider: "none" };
  }
}

// ─── 生成并持久化到Supabase ─────────────────────────────────
export async function generateAndStoreAvatar(
  supabase: SupabaseClient,
  memoryId: string,
  emotion: Emotion,
): Promise<string | null> {
  const result = await generateAvatar(emotion);
  if (!result.avatarUrl) return null;

  try {
    await supabase
      .from("memories")
      .update({
        avatar_image_url: result.avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", memoryId);
  } catch (e) {
    console.error("[avatar] Supabase更新失败:", e);
  }

  return result.avatarUrl;
}
