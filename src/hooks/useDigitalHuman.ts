"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import type { FaceState } from "../lib/digital-human/ReactionEngine";
import {
  createInitialFaceState, updateReactionState, faceStateToTransform, type FaceTransform,
} from "../lib/digital-human/ReactionEngine";

interface UseDigitalHumanReturn {
  faceState: FaceState;
  faceTransform: FaceTransform;
  isSpeaking: boolean;
  audioUrl: string | null;
  speak: (text: string) => Promise<void>;
  setEmotion: (emotion: string) => void;
  cursorRef: React.MutableRefObject<{ x: number; y: number }>;
}

export default function useDigitalHuman(initialEmotion?: string): UseDigitalHumanReturn {
  const [faceState, setFaceState] = useState<FaceState>(createInitialFaceState());
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const cursorRef = useRef({ x: 0.5, y: 0.5 });
  const emotionRef = useRef(initialEmotion || "calm");
  const faceRef = useRef(faceState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef(Date.now());

  // ─── RAF loop for reaction updates ────────────────────────
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      const now = Date.now();
      const elapsed = now - startTimeRef.current;
      const next = updateReactionState(
        faceRef.current, emotionRef.current, cursorRef.current.x, cursorRef.current.y,
        isSpeaking, elapsed,
      );
      faceRef.current = next;
      setFaceState(next);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { running = false; };
  }, [isSpeaking]);

  // ─── Track cursor ─────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      cursorRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // ─── Speak: TTS + play ────────────────────────────────────
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setIsSpeaking(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audio_url) {
          setAudioUrl(data.audio_url);
          // Play audio
          if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
          const audio = new Audio(data.audio_url);
          audioRef.current = audio;
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => setIsSpeaking(false);
          await audio.play();
        } else {
          setIsSpeaking(false);
        }
      } else {
        setIsSpeaking(false);
      }
    } catch {
      setIsSpeaking(false);
    }
  }, []);

  // ─── Set emotion ──────────────────────────────────────────
  const setEmotion = useCallback((emotion: string) => {
    emotionRef.current = emotion;
    // Reset transition for new emotion
    faceRef.current = { ...faceRef.current, transitionProgress: 0 };
  }, []);

  const faceTransform = faceStateToTransform(faceState);

  return { faceState, faceTransform, isSpeaking, audioUrl, speak, setEmotion, cursorRef };
}
