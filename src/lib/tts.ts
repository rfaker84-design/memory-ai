import { EMOTION_TTS } from "./emotionEngine";
import type { Emotion } from "./volc";

// tts.ts — 火山TTS语音合成 (生产版)
// Voice: zh_female_xiaoyan, format: mp3
// 失败时自动降级为静音音频，永不阻断流程
// 支持 emotion 驱动的语速/音调/音量调节

export interface TTSResult {
  audioBase64: string | null;
  audioUrl: string | null;
  provider: "volc" | "fallback";
  cached: boolean;
  fallback: boolean;
}

// ─── 静音 WAV fallback (0.1s silent) ───────────────────────
const SILENT_WAV_BASE64 =
  "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const SILENT_AUDIO_URL = "data:audio/wav;base64," + SILENT_WAV_BASE64;

// ─── 内存缓存 ───────────────────────────────────────────────
const cache = new Map<string, { base64: string; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000;
const MAX_CACHE = 500;

function cacheGet(text: string): string | null {
  const key = text.slice(0, 120).trim();
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.base64;
  if (entry) cache.delete(key);
  return null;
}

function cacheSet(text: string, base64: string): void {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(text.slice(0, 120).trim(), { base64, ts: Date.now() });
}

// ─── 火山TTS API调用 ────────────────────────────────────────
async function callVolcTTS(text: string, emotion?: Emotion): Promise<string> {
  const appId = process.env.VOLC_TTS_APP_ID;
  const token = process.env.VOLC_TTS_TOKEN;

  if (!appId || !token) {
    throw new Error("VOLC_TTS_APP_ID 或 VOLC_TTS_TOKEN 未配置");
  }

  // Emotion-driven voice modulation
  const ttsParams = emotion && EMOTION_TTS[emotion]
    ? EMOTION_TTS[emotion]
    : { speed: 1.0, pitch: 1.0, volume: 1.0 };

  const resp = await fetch("https://openspeech.bytedance.com/api/v1/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer;" + token,
    },
    body: JSON.stringify({
      app: {
        appid: appId,
        token: token,
        cluster: "volcano_tts",
      },
      user: { uid: "yijian-memory-ai" },
      audio: {
        voice_type: "zh_female_xiaoyan",
        encoding: "mp3",
        speed_ratio: ttsParams.speed,
        volume_ratio: ttsParams.volume,
        pitch_ratio: ttsParams.pitch,
      },
      request: {
        text: text,
        text_type: "plain",
        operation: "query",
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error("火山TTS HTTP " + resp.status + ": " + body.slice(0, 200));
  }

  const data = await resp.json();
  const base64 = data.audio || data.data?.audio;
  if (!base64) {
    throw new Error("火山TTS返回无音频数据");
  }
  return base64;
}

// ─── Fallback: 返回静音 ─────────────────────────────────────
function silentFallback(cachedFromCache = false): TTSResult {
  return {
    audioBase64: SILENT_WAV_BASE64,
    audioUrl: SILENT_AUDIO_URL,
    provider: "fallback",
    cached: cachedFromCache,
    fallback: true,
  };
}

// ─── 主入口（永不throw，支持emotion参数）────────────────────
export async function generateSpeech(text: string, emotion?: Emotion): Promise<TTSResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return silentFallback();
  }

  // 检查缓存 (emotion-aware cache key)
  const cacheKey = (emotion || "") + ":" + trimmed.slice(0, 120);
  const cachedEntry = cache.get(cacheKey);
  if (cachedEntry && Date.now() - cachedEntry.ts < CACHE_TTL) {
    return {
      audioBase64: cachedEntry.base64,
      audioUrl: "data:audio/mp3;base64," + cachedEntry.base64,
      provider: "volc",
      cached: true,
      fallback: false,
    };
  }

  // 调用火山TTS，失败自动降级
  try {
    const base64 = await callVolcTTS(trimmed, emotion);
    cache.set(cacheKey, { base64, ts: Date.now() });
    return {
      audioBase64: base64,
      audioUrl: "data:audio/mp3;base64," + base64,
      provider: "volc",
      cached: false,
      fallback: false,
    };
  } catch (err) {
    console.warn("[TTS] 火山TTS失败，降级为静音:", (err as Error).message);
    return silentFallback();
  }
}
