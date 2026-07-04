import { NextResponse } from "next/server";

import { getAIProviderRegistry } from "../../../services/ai/global-ai-registry";
import { AIProviderType } from "../../../services/ai/provider-types";
import type { TTSAIProviderAdapter } from "../../../services/tts/tts-ai-provider-adapter";

type TtsRequest = {
  text?: string;
  voice?: string;
  speed?: number;
  format?: string;
};

function resolveTTSProvider() {
  const providerName = process.env.TTS_PROVIDER || "mock";
  const adapter = getAIProviderRegistry().get<TTSAIProviderAdapter>(
    AIProviderType.TTS,
    providerName
  );

  if (!adapter) {
    throw new Error("TTS provider not found in AI Registry: " + providerName);
  }

  return adapter.ttsProvider;
}

export async function POST(request: Request) {
  try {
    const { text, voice, speed, format } = (await request.json()) as TtsRequest;

    if (!text?.trim()) {
      return NextResponse.json(
        { error: "请输入要转换的文字" },
        { status: 400 }
      );
    }

    const result = await resolveTTSProvider().generateSpeech({
      text,
      voice,
      speed,
      format,
    });

    return NextResponse.json({
      audioBase64: result.audioBase64 ?? null,
      audio_url: result.audioUrl || null,
      audioUrl: result.audioUrl || null,
      provider: result.provider,
      duration: result.duration,
      format: result.format,
    });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "TTS failed";

    return NextResponse.json(
      {
        error: message,
        audio_url: null,
        audioUrl: null,
        audioBase64: null,
      },
      { status: 200 }
    );
  }
}
