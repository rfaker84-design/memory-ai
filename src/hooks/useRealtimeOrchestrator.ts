"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import type { FaceState } from "../lib/digital-human/ReactionEngine";
import {
  createInitialFaceState, updateReactionState, faceStateToTransform, type FaceTransform,
} from "../lib/digital-human/ReactionEngine";
import { AudioChunkQueue } from "../lib/digital-human/RealtimeSessionManager";
import type { OrchestratorEvent } from "../../server/orchestrator";

export type PipelinePhase = "idle" | "connecting" | "thinking" | "speaking" | "done";

interface UseRealtimeOrchestratorReturn {
  phase: PipelinePhase;
  faceState: FaceState;
  faceTransform: FaceTransform;
  isSpeaking: boolean;
  streamingText: string;
  fullText: string;
  emotion: string;
  latencyMs: number;
  sendMessage: (text: string) => void;
  abort: () => void;
  cursorRef: React.MutableRefObject<{ x: number; y: number }>;
}

export default function useRealtimeOrchestrator(config: {
  memoryId: string; name: string; relationship: string | null; lifeStory: string | null;
}): UseRealtimeOrchestratorReturn {
  const [faceState, setFaceState] = useState<FaceState>(createInitialFaceState());
  const [phase, setPhase] = useState<PipelinePhase>("idle");
  const [streamingText, setStreamingText] = useState("");
  const [fullText, setFullText] = useState("");
  const [emotion, setEmotion] = useState("calm");
  const [latencyMs, setLatencyMs] = useState(0);
  const cursorRef = useRef({ x: 0.5, y: 0.5 });
  const faceRef = useRef(faceState);
  const startTimeRef = useRef(Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const audioQueue = useRef(new AudioChunkQueue());
  const isSpeaking = phase === "speaking";

  // ─── RAF face rendering ───────────────────────────────────
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      const elapsed = Date.now() - startTimeRef.current;
      const next = updateReactionState(
        faceRef.current, emotion, cursorRef.current.x, cursorRef.current.y,
        isSpeaking, elapsed,
      );
      faceRef.current = next;
      setFaceState(next);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { running = false; };
  }, [isSpeaking, emotion]);

  // ─── Cursor tracking ──────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      cursorRef.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // ─── Connect to orchestrator SSE ──────────────────────────
  const sendMessage = useCallback((userMessage: string) => {
    // Abort previous
    abortRef.current?.abort();
    audioQueue.current.clear();

    const abortController = new AbortController();
    abortRef.current = abortController;
    const startTime = performance.now();

    setPhase("connecting");
    setStreamingText("");
    setFullText("");
    setLatencyMs(0);

    fetch("/api/ws", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memoryId: config.memoryId,
        name: config.name,
        relationship: config.relationship,
        lifeStory: config.lifeStory,
        userMessage,
        history: [],
      }),
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          setPhase("idle");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = "";

        setPhase("thinking");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            if (jsonStr === "[DONE]") continue;

            try {
              const event: OrchestratorEvent = JSON.parse(jsonStr);

              switch (event.type) {
                case "llm_chunk":
                  accumulatedText += event.text;
                  setStreamingText(accumulatedText);
                  if (phase !== "thinking") setPhase("thinking");
                  if (latencyMs === 0) setLatencyMs(performance.now() - startTime);
                  break;

                case "emotion":
                  setEmotion(event.emotion);
                  break;

                case "tts_chunk":
                  setPhase("speaking");
                  audioQueue.current.addChunk(event.base64, event.index);
                  break;

                case "llm_done":
                  setFullText(event.fullText);
                  if (event.emotion) setEmotion(event.emotion);
                  break;

                case "tts_done":
                  // All TTS sent
                  break;

                case "done":
                  if (!audioQueue.current.isPlaying) setPhase("done");
                  break;

                case "error":
                  console.error("Orchestrator error:", event.message);
                  if (phase === "connecting") setPhase("idle");
                  break;
              }
            } catch {
              // skip malformed
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setPhase("idle");
      });
  }, [config.memoryId, config.name, config.relationship, config.lifeStory, phase, latencyMs]);

  // ─── Audio queue → phase management ───────────────────────
  useEffect(() => {
    audioQueue.current.setOnPlay((playing) => {
      if (playing) setPhase("speaking");
    });
    // When audio finishes naturally
    const checkDone = setInterval(() => {
      if (!audioQueue.current.isPlaying && phase === "speaking") {
        setPhase("done");
      }
    }, 500);
    return () => clearInterval(checkDone);
  }, [phase]);

  // ─── Abort ────────────────────────────────────────────────
  const abort = useCallback(() => {
    abortRef.current?.abort();
    audioQueue.current.clear();
    setPhase("idle");
    setStreamingText("");
  }, []);

  const faceTransform = faceStateToTransform(faceState);

  return {
    phase, faceState, faceTransform, isSpeaking,
    streamingText, fullText, emotion, latencyMs,
    sendMessage, abort, cursorRef,
  };
}
