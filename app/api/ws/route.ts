// API: Real-time WebSocket/SSE endpoint
// Streams: llm_chunk → emotion → tts_chunk → done
//
// Client connects via EventSource or fetch with ReadableStream

import { NextRequest } from "next/server";
import { createOrchestrator } from "../../../server/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { memoryId, name, relationship, lifeStory, userMessage, history } = await req.json();
    if (!memoryId || !name || !userMessage) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const orchestrator = createOrchestrator({ memoryId, name, relationship, lifeStory });

    const encoder = new TextEncoder();
    const stream = orchestrator.process(userMessage, history || []);

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            const line = "data: " + JSON.stringify(event) + "\n\n";
            controller.enqueue(encoder.encode(line));

            if (event.type === "done" || event.type === "error") {
              break;
            }
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "stream error";
          controller.enqueue(encoder.encode("data: " + JSON.stringify({ type: "error", message: msg }) + "\n\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ws error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
