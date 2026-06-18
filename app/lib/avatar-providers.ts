/**
 * 忆见 MemoryAI — Avatar Provider Adapter
 * 支持: HeyGen (优先) / D-ID / MiniMax / Mock fallback
 * 环境变量: HEYGEN_API_KEY / DID_API_KEY / MINIMAX_API_KEY / AVATAR_PROVIDER
 */

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export type AvatarProviderType = "heygen" | "did" | "minimax" | "mock";

export interface AvatarResult {
  video_url: string | null;
  video_id: string | null;
  status: "ready" | "processing" | "error";
  provider: AvatarProviderType;
  error: string | null;
}

function detectProvider(): AvatarProviderType {
  if (process.env.AVATAR_PROVIDER) return process.env.AVATAR_PROVIDER as AvatarProviderType;
  if (process.env.HEYGEN_API_KEY) return "heygen";
  if (process.env.DID_API_KEY) return "did";
  if (process.env.MINIMAX_API_KEY && process.env.MINIMAX_GROUP_ID) return "minimax";
  return "mock";
}

/* ---- HeyGen ---- */
async function heygenGenerate(params: { text: string; voiceUrl?: string; imageUrl?: string }): Promise<AvatarResult> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error("HEYGEN_API_KEY not configured");

  const body: Record<string, unknown> = {
    video_inputs: [{
      character: params.imageUrl
        ? { type: "photo", photo_url: params.imageUrl }
        : { type: "avatar", avatar_id: process.env.HEYGEN_AVATAR_ID || "default" },
      voice: params.voiceUrl
        ? { type: "audio", audio_url: params.voiceUrl }
        : { type: "text", input_text: params.text, voice_id: process.env.HEYGEN_VOICE_ID || "default" },
    }],
  };

  const res = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("HeyGen API error: " + res.status);

  const json = await res.json() as { data?: { video_id?: string } };
  const videoId: string | null = json.data?.video_id || null;
  if (!videoId) throw new Error("HeyGen: no video_id");

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const sr = await fetch("https://api.heygen.com/v1/video_status?video_id=" + videoId, {
      headers: { "X-Api-Key": apiKey },
    });
    if (!sr.ok) continue;
    const sd = await sr.json() as { data?: { status?: string; video_url?: string } };
    if (sd.data?.status === "completed" && sd.data?.video_url) {
      return { video_url: sd.data.video_url, video_id: videoId, status: "ready", provider: "heygen", error: null };
    }
    if (sd.data?.status === "failed") {
      return { video_url: null, video_id: videoId, status: "error", provider: "heygen", error: "HeyGen generation failed" };
    }
  }
  return { video_url: null, video_id: videoId, status: "processing", provider: "heygen", error: null };
}

/* ---- D-ID ---- */
async function didGenerate(params: { text: string; voiceUrl?: string; imageUrl?: string }): Promise<AvatarResult> {
  const apiKey = process.env.DID_API_KEY;
  if (!apiKey) throw new Error("DID_API_KEY not configured");

  const body: Record<string, unknown> = {
    script: { type: "text", input: params.text },
    source_url: params.imageUrl || "",
    config: { fluent: true },
  };
  if (params.voiceUrl) body.script = { type: "audio", audio_url: params.voiceUrl };

  const res = await fetch("https://api.d-id.com/talks", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(apiKey + ":"), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("D-ID API error: " + res.status);

  const data = await res.json() as { id?: string };
  const talkId: string | null = data.id || null;

  if (!talkId) throw new Error("D-ID: no talk id");

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const sr = await fetch("https://api.d-id.com/talks/" + talkId, {
      headers: { Authorization: "Basic " + btoa(apiKey + ":") },
    });
    if (!sr.ok) continue;
    const sd = await sr.json() as { status?: string; result_url?: string };
    if (sd.status === "done" && sd.result_url) {
      return { video_url: sd.result_url, video_id: talkId, status: "ready", provider: "did", error: null };
    }
    if (sd.status === "error") {
      return { video_url: null, video_id: talkId, status: "error", provider: "did", error: "D-ID generation failed" };
    }
  }
  return { video_url: null, video_id: talkId, status: "processing", provider: "did", error: null };
}

/* ---- MiniMax stub ---- */
async function minimaxGenerate(_params: { text: string }): Promise<AvatarResult> {
  return { video_url: null, video_id: null, status: "processing", provider: "minimax", error: null };
}

/* ---- Unified ---- */
export async function generateAvatar(params: {
  text: string; voiceUrl?: string; imageUrl?: string;
}): Promise<AvatarResult> {
  const provider = detectProvider();
  try {
    switch (provider) {
      case "heygen": return await heygenGenerate(params);
      case "did": return await didGenerate(params);
      case "minimax": return await minimaxGenerate(params);
      default:
        return { video_url: "/demo-avatar.mp4", video_id: null, status: "ready", provider: "mock", error: null };
    }
  } catch (e: unknown) {
    return { video_url: "/demo-avatar.mp4", video_id: null, status: "ready", provider: "mock", error: (e as Error).message };
  }
}