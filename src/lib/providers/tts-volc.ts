// tts-volc.ts — Volcengine TTS + Tencent Cloud TTS fallback
// Streaming TTS: text → audio chunks (base64 mp3)

export interface TTSChunk {
  base64: string;
  index: number;
  total: number;
}

// ─── Split text into speakable segments ─────────────────────
function splitIntoSegments(text: string): string[] {
  // Split on Chinese/English punctuation but keep short segments
  const raw = text.split(/(?<=[。！？.!?\n])/g).filter(s => s.trim().length > 0);

  const segments: string[] = [];
  for (const seg of raw) {
    const trimmed = seg.trim();
    if (trimmed.length > 80) {
      // Further split long segments on commas
      const sub = trimmed.split(/(?<=[，,；;：:])/g).filter(s => s.trim().length > 0);
      segments.push(...sub);
    } else {
      segments.push(trimmed);
    }
  }
  return segments.filter(s => s.length > 0);
}

// ─── Call TTS API ───────────────────────────────────────────
async function callTTS(text: string): Promise<string | null> {
  if (!text.trim() || text.length < 2) return null;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Try Volc TTS first
    if (process.env.VOLC_TTS_APP_ID) {
      const resp = await fetch("https://openspeech.bytedance.com/api/v1/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer;" + process.env.VOLC_TTS_TOKEN || "",
        },
        body: JSON.stringify({
          app: { appid: process.env.VOLC_TTS_APP_ID, token: process.env.VOLC_TTS_TOKEN || "", cluster: "volcano_tts" },
          user: { uid: "memory-ai-user" },
          audio: { voice_type: process.env.VOLC_TTS_VOICE || "zh_female_qingxin", encoding: "mp3", speed_ratio: 0.95 },
          request: { text, text_type: "plain" },
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.audio) return data.audio; // base64
      }
    }

    // Fallback: existing Tencent TTS
    const resp = await fetch(baseUrl + "/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.audioBase64 || null;
    }
  } catch { /* ignore */ }

  return null;
}

// ─── Streaming TTS generator ────────────────────────────────
export async function* streamTTS(text: string): AsyncGenerator<TTSChunk> {
  const segments = splitIntoSegments(text);
  const total = segments.length;

  for (let i = 0; i < segments.length; i++) {
    const base64 = await callTTS(segments[i]);
    if (base64) {
      yield { base64, index: i, total };
    }
  }
}

// ─── Non-streaming single call ──────────────────────────────
export async function singleTTS(text: string): Promise<string | null> {
  return callTTS(text);
}
