"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import type { FaceState } from "../lib/digital-human/ReactionEngine";
import {
  createInitialFaceState, updateReactionState, faceStateToTransform, type FaceTransform,
} from "../lib/digital-human/ReactionEngine";
import { RealtimeSessionManager, type SessionState } from "../lib/digital-human/RealtimeSessionManager";

interface UseRealtimeDigitalHumanReturn {
  sessionState: SessionState;
  faceState: FaceState;
  faceTransform: FaceTransform;
  isSpeaking: boolean;
  streamingText: string;
  latencyMs: number;
  startStreaming: (userMessage: string) => void;
  abort: () => void;
  setEmotion: (emotion: string) => void;
  cursorRef: React.MutableRefObject<{ x: number; y: number }>;
}

export default function useRealtimeDigitalHuman(config: {
  memoryId: string; name: string; relationship: string | null;
  lifeStory: string | null; emotion?: string;
}): UseRealtimeDigitalHumanReturn {
  const [faceState, setFaceState] = useState<FaceState>(createInitialFaceState());
  const [sessionState, setSessionState] = useState<SessionState>({
    phase: "idle", emotion: config.emotion || "calm",
    partialText: "", fullText: "", audioChunks: 0,
    totalAudioChunks: 0, latencyMs: 0, tokenCount: 0,
    avatarReady: false, streaming: false,
  });
  const cursorRef = useRef({ x: 0.5, y: 0.5 });
  const faceRef = useRef(faceState);
  const startTimeRef = useRef(Date.now());
  const sessionRef = useRef<RealtimeSessionManager | null>(null);

  // ─── Init session manager ─────────────────────────────────
  useEffect(() => {
    const mgr = new RealtimeSessionManager({
      memoryId: config.memoryId, name: config.name,
      relationship: config.relationship, lifeStory: config.lifeStory,
      emotion: config.emotion || "calm",
    });
    mgr.setOnStateChange(setSessionState);
    sessionRef.current = mgr;
    return () => mgr.destroy();
  }, [config.memoryId]);

  // ─── RAF: face rendering ──────────────────────────────────
  const isSpeaking = sessionState.phase === "speaking" || sessionState.audioChunks > 0;

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      const elapsed = Date.now() - startTimeRef.current;
      const next = updateReactionState(
        faceRef.current, sessionState.emotion, cursorRef.current.x, cursorRef.current.y,
        isSpeaking, elapsed,
      );
      faceRef.current = next;
      setFaceState(next);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { running = false; };
  }, [isSpeaking, sessionState.emotion]);

  // ─── Cursor tracking ──────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      cursorRef.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // ─── Actions ──────────────────────────────────────────────
  const startStreaming = useCallback((userMessage: string) => {
    sessionRef.current?.startStreaming(userMessage);
  }, []);

  const abort = useCallback(() => sessionRef.current?.abort(), []);
  const setEmotion = useCallback((emotion: string) => sessionRef.current?.setEmotion(emotion), []);

  const faceTransform = faceStateToTransform(faceState);

  return {
    sessionState, faceState, faceTransform, isSpeaking,
    streamingText: sessionState.partialText,
    latencyMs: sessionState.latencyMs,
    startStreaming, abort, setEmotion, cursorRef,
  };
}
