/**
 * 忆见 MemoryAI — TTS Provider Adapter
 * 支持: ElevenLabs / MiniMax / Tencent Cloud (已有) / Mock
 *
 * 环境变量:
 *   ELEVENLABS_API_KEY  — ElevenLabs API key
 *   ELEVENLABS_VOICE_ID — Voice ID (default: "21m00Tcm4TlvDq8ikWAM")
 *   TTS_PROVIDER        — "elevenlabs" | "minimax" | "tencent" | "mock"
 */

export type TtsProviderType = "elevenlabs" | "minimax" | "tencent" | "mock";

export interface TtsResult {
  audioBase64: string | null;
  audioUrl: string | null;
  provider: TtsProviderType;
  error?: string;
}

function detectTtsProvider(): TtsProviderType {
  if (process.env.TTS_PROVIDER) return process.env.TTS_PROVIDER as TtsProviderType;
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (process.env.MINIMAX_API_KEY && process.env.MINIMAX_GROUP_ID) return "minimax";
  return "mock";
}

/* ========================================================================
   ElevenLabs
   ======================================================================== */

async function elevenlabsTts(text: string): Promise<TtsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel (default)

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("ElevenLabs error: " + res.status + " " + err);
  }

  const audioBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(audioBuffer).toString("base64");
  const audioUrl = "data:audio/mpeg;base64," + base64;

  return { audioBase64: base64, audioUrl, provider: "elevenlabs" };
}

/* ========================================================================
   MiniMax
   ======================================================================== */

async function minimaxTts(text: string): Promise<TtsResult> {
  const apiKey = process.env.MINIMAX_API_KEY;
  const groupId = process.env.MINIMAX_GROUP_ID;
  if (!apiKey || !groupId) throw new Error("MINIMAX_API_KEY not configured");

  const res = await fetch(`https://api.minimaxi.com/v1/t2a_v2?GroupId=${groupId}`, {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "speech-2.6-hd",
      text,
      voice_setting: { voice_id: "default", speed: 1.0, vol: 1.0 },
      audio_setting: { sample_rate: 32000, format: "mp3" },
    }),
  });

  if (!res.ok) throw new Error("MiniMax TTS error: " + res.status);

  const data = await res.json() as { audio_file?: string; base_resp?: { status_code?: number } };
  if (data.base_resp?.status_code !== 0) throw new Error("MiniMax TTS failed");

  // MiniMax returns a URL to the audio file; download it
  if (data.audio_file) {
    const audioRes = await fetch(data.audio_file);
    const buffer = await audioRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return { audioBase64: base64, audioUrl: "data:audio/mp3;base64," + base64, provider: "minimax" };
  }

  throw new Error("MiniMax: no audio_file returned");
}

/* ========================================================================
   Unified entry point
   ======================================================================== */

export async function synthesizeSpeech(text: string): Promise<TtsResult> {
  const provider = detectTtsProvider();

  try {
    switch (provider) {
      case "elevenlabs": return await elevenlabsTts(text);
      case "minimax": return await minimaxTts(text);
      case "tencent":
        // Handled by existing /api/tts route (Tencent Cloud SDK)
        // This adapter delegates to the existing route
        return { audioBase64: null, audioUrl: null, provider: "tencent", error: "delegated" };
      default:
        throw new Error("No TTS provider configured");
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "TTS failed";
    console.error("[TTS] " + provider + " failed:", msg);
    return { audioBase64: null, audioUrl: null, provider: "mock", error: msg };
  }
}