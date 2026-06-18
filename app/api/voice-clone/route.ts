import { createClient } from "@supabase/supabase-js";
import { voiceCache, cacheKey } from "../../../src/lib/cache";
import { checkConcurrency } from "../../../src/lib/concurrency-control";
import { logger } from "../../../src/lib/logger";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const { user_phone, memory_id, voice_sample_url } = await request.json();
    if (!user_phone || !memory_id) {
      return Response.json({ success: false, error: "缂哄皯鍙傛暟" }, { status: 400 });
    }

    // V7+: Concurrency control
    const concurrencyCheck = checkConcurrency(user_phone, "voice");
    if (!concurrencyCheck.allowed) {
      logger.api("POST", "/api/voice-clone", { userId: user_phone });
      return Response.json({ success: false, error: "璇锋眰杩囦簬棰戠箒锛岃绋嶅悗鍐嶈瘯" }, { status: 429 });
    }

    logger.api("POST", "/api/voice-clone", { userId: user_phone });

    // V7+: Check voice cache first
    const cacheKeyStr = cacheKey("voice", user_phone, memory_id, voice_sample_url || "none");
    const cached = voiceCache.get<{ voice_id: string; voice_url: string | null; status: string }>(cacheKeyStr);
    if (cached) {
      return Response.json({ success: true, voice_id: cached.voice_id, voice_url: cached.voice_url, status: cached.status });
    }

    const { data: existing } = await supabaseAdmin
      .from("user_voice_profiles")
      .select("voice_id, voice_url, voice_status")
      .eq("user_phone", user_phone).eq("memory_id", memory_id).maybeSingle();

    if (existing && existing.voice_status === "active") {
      // Cache existing voice (permanent/24h)
      voiceCache.set(cacheKeyStr, { voice_id: existing.voice_id, voice_url: existing.voice_url, status: "ready" }, 24 * 60 * 60 * 1000);
      return Response.json({ success: true, voice_id: existing.voice_id, voice_url: existing.voice_url, status: "ready" });
    }

    const voiceId = "voice_" + memory_id.substring(0, 8) + "_" + Date.now().toString(36);
    const voiceUrl = voice_sample_url || null;

    await supabaseAdmin.from("user_voice_profiles").upsert({
      user_phone, memory_id, voice_id: voiceId, voice_url: voiceUrl,
      voice_provider: "tencent_tts", voice_status: voice_sample_url ? "active" : "training",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_phone,memory_id" });

    // Cache the result
    const result = { voice_id: voiceId, voice_url: voiceUrl, status: voice_sample_url ? "ready" : "training" };
    voiceCache.set(cacheKeyStr, result, 24 * 60 * 60 * 1000);

    return Response.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "澹伴煶鍏嬮殕澶辫触";
    logger.error("voice-clone", error);
    return Response.json({ success: false, error: message }, { status: 500 });
  } finally {
    logger.api("POST", "/api/voice-clone", { durationMs: Date.now() - startTime });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userPhone = searchParams.get("user_phone");
  const memoryId = searchParams.get("memory_id");
  if (!userPhone || !memoryId) return Response.json({ success: false, error: "缂哄皯鍙傛暟" }, { status: 400 });
  try {
    const { data } = await supabaseAdmin.from("user_voice_profiles").select("*").eq("user_phone", userPhone).eq("memory_id", memoryId).maybeSingle();
    if (!data) return Response.json({ success: true, exists: false });
    return Response.json({ success: true, exists: true, voice_id: data.voice_id, voice_url: data.voice_url, voice_provider: data.voice_provider, voice_status: data.voice_status });
  } catch (error: unknown) {
    return Response.json({ success: false, error: "鏌ヨ澶辫触" }, { status: 500 });
  }
}
