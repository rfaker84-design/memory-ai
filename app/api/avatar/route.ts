/**
 * 忆见 MemoryAI — 数字人视频生成 API (Production)
 * 自动检测: HeyGen > D-ID > MiniMax > Mock
 * 
 * POST /api/avatar → { avatar_url, status, provider }
 * GET  /api/avatar?memory_id=xxx → { avatar_url, status }
 */

import { generateAvatar } from "../../lib/avatar-providers";

export async function POST(request: Request) {
  try {
    const { text, voice_url, image_url } = await request.json();
    if (!text?.trim()) {
      return Response.json({ error: "Missing text" }, { status: 400 });
    }

    const result = await generateAvatar({
      text,
      voiceUrl: voice_url,
      imageUrl: image_url,
    });

    return Response.json({
      avatar_url: result.video_url,
      video_id: result.video_id,
      status: result.status,
      provider: result.provider,
      error: result.error || null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Avatar generation failed";
    return Response.json({
      error: msg,
      avatar_url: process.env.AVATAR_MOCK_URL || "/demo-avatar.mp4",
      status: "ready",
      provider: "mock",
    }, { status: 200 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const memoryId = searchParams.get("memory_id");
  if (!memoryId) return Response.json({ error: "Missing memory_id" }, { status: 400 });

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await supabase.from("memories").select("avatar_video_url").eq("id", memoryId).maybeSingle();
    return Response.json({
      avatar_url: (data as Record<string,string>|null)?.avatar_video_url || null,
      status: data ? "ready" : "not_found",
    });
  } catch {
    return Response.json({ avatar_url: null, status: "error" });
  }
}