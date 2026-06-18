// API: TTS endpoint — text to speech
import { NextRequest, NextResponse } from "next/server";
import { generateSpeech } from "../../../src/lib/tts";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: "missing text" }, { status: 400 });
    }

    const result = await generateSpeech(text.trim());

    return NextResponse.json({
      audioBase64: result.audioBase64,
      audioUrl: result.audioUrl,
      provider: result.provider,
      cached: result.cached,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "tts failed";
    return NextResponse.json({ error: msg, audioUrl: null }, { status: 500 });
  }
}
