// API: Streaming TTS — accepts text stream, returns audio chunks
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, streaming } = await req.json();
    if (!text?.trim()) return new Response(JSON.stringify({ error: "missing text" }), { status: 400 });

    if (!streaming) {
      // Non-streaming: single TTS call
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const resp = await fetch(baseUrl + "/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await resp.json();
      return new Response(JSON.stringify({ audioBase64: data.audioBase64, audioUrl: data.audio_url }));
    }

    // Streaming: split text by sentence and stream audio chunks
    const sentences = text.split(/(?<=[。！？.!?，,])/g).filter((s: string) => s.trim().length > 1);
    const encoder = new TextEncoder();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const readable = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < sentences.length; i++) {
          try {
            const resp = await fetch(baseUrl + "/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: sentences[i].trim() }),
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data.audioBase64) {
                const chunk = JSON.stringify({ audioChunk: data.audioBase64, index: i, total: sentences.length });
                controller.enqueue(encoder.encode("data: " + chunk + "\n\n"));
              }
            }
          } catch { /* skip failed chunk */ }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "tts failed";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
