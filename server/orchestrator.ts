// orchestrator.ts — Realtime Orchestrator
// Coordinates: LLM → TTS → Avatar in a streaming pipeline
//
// Usage (server-side):
//   const orch = new RealtimeOrchestrator(config);
//   for await (const event of orch.process(userMessage, history)) {
//     sendToClient(event);
//   }

import { streamLLM, detectEmotion, type LLMConfig } from "../src/lib/providers/llm-volc";
import { singleTTS, type TTSChunk } from "../src/lib/providers/tts-volc";

export interface OrchestratorConfig {
  memoryId: string;
  name: string;
  relationship: string | null;
  lifeStory: string | null;
}

export type OrchestratorEvent =
  | { type: "llm_chunk"; text: string }
  | { type: "emotion"; emotion: string }
  | { type: "tts_chunk"; base64: string; index: number; total: number }
  | { type: "llm_done"; fullText: string; emotion: string }
  | { type: "tts_done"; totalChunks: number }
  | { type: "error"; message: string }
  | { type: "done" };

export class RealtimeOrchestrator {
  private config: OrchestratorConfig;
  private llmConfig: LLMConfig;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.llmConfig = {
      name: config.name,
      relationship: config.relationship,
      lifeStory: config.lifeStory,
    };
  }

  // ─── Process user message ─────────────────────────────────
  async *process(
    userMessage: string,
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
  ): AsyncGenerator<OrchestratorEvent> {
    const startTime = Date.now();
    let fullText = "";
    let detectedEmotion = "calm";
    const ttsTasks: Promise<void>[] = [];
    let ttsChunkIndex = 0;
    const allTtsChunks: string[] = [];

    try {
      // Phase 1: Stream LLM
      for await (const chunk of streamLLM(this.llmConfig, userMessage, history)) {
        fullText += chunk.text;

        // Emit text chunk
        yield { type: "llm_chunk", text: chunk.text };

        // Emit emotion on first detection
        if (chunk.emotion) {
          detectedEmotion = chunk.emotion;
          yield { type: "emotion", emotion: chunk.emotion };
        }

        // Batch TTS: trigger on sentence breaks
        if (/[。！？.!?\n]/.test(chunk.text) && fullText.trim().length > 3) {
          const textToSpeak = fullText.trim();
          const idx = ttsChunkIndex++;

          ttsTasks.push(
            singleTTS(textToSpeak).then(base64 => {
              if (base64) {
                allTtsChunks.push(base64);
              }
            }),
          );
        }
      }

      // Final emotion if not yet emitted
      if (!detectedEmotion || detectedEmotion === "calm") {
        detectedEmotion = detectEmotion(fullText);
      }
      yield { type: "llm_done", fullText, emotion: detectedEmotion };

      // Phase 2: Wait for TTS
      await Promise.all(ttsTasks);

      // Phase 3: Emit TTS chunks in order
      const total = allTtsChunks.length;
      for (let i = 0; i < allTtsChunks.length; i++) {
        yield { type: "tts_chunk", base64: allTtsChunks[i], index: i, total };
      }
      yield { type: "tts_done", totalChunks: total };

      // Done
      yield { type: "done" };

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "orchestrator error";
      yield { type: "error", message: msg };
    }
  }
}

// ─── Helper: create orchestrator from memory data ────────────
export function createOrchestrator(params: {
  memoryId: string;
  name: string;
  relationship?: string | null;
  lifeStory?: string | null;
}): RealtimeOrchestrator {
  return new RealtimeOrchestrator({
    memoryId: params.memoryId,
    name: params.name,
    relationship: params.relationship || null,
    lifeStory: params.lifeStory || null,
  });
}
