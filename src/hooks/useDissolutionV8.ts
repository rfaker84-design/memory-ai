"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import type { DissolutionState } from "../lib/ecosystem/DissolutionEngine";
import { initDissolution, dissolveTick, userInteractionPulse, aiObservation } from "../lib/ecosystem/DissolutionEngine";

interface EvoNodeLike {
  id: string; name: string; x: number; y: number;
  connections: Array<{ to: string; strength: number; type: string }>;
}

interface UseDissolutionV8Return {
  state: DissolutionState | null;
  loading: boolean;
  interact: (nodeId: string) => void;
  aiObserve: () => string | null;
}

export default function useDissolutionV8(
  memoryId: string,
  phone: string,
  ecosystemReady: boolean,
  evoNodes: EvoNodeLike[],
): UseDissolutionV8Return {
  const [state, setState] = useState<DissolutionState | null>(null);
  const [loading, setLoading] = useState(true);
  const stateRef = useRef<DissolutionState | null>(null);
  const animRef = useRef(0);
  const lastTimeRef = useRef(0);
  const userPresentRef = useRef(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Init dissolution from ecosystem nodes ─────────────────
  useEffect(() => {
    if (!ecosystemReady || !evoNodes.length) return;
    const initial = initDissolution(memoryId, evoNodes);
    setState(initial);
    stateRef.current = initial;
    lastTimeRef.current = performance.now();
    setLoading(false);
  }, [ecosystemReady, evoNodes.length, memoryId]);

  // ─── User presence detection ──────────────────────────────
  useEffect(() => {
    const markPresent = () => {
      userPresentRef.current = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        userPresentRef.current = false;
      }, 8000);
    };

    window.addEventListener("mousemove", markPresent, { passive: true });
    window.addEventListener("keydown", markPresent, { passive: true });
    window.addEventListener("click", markPresent, { passive: true });
    markPresent();

    return () => {
      window.removeEventListener("mousemove", markPresent);
      window.removeEventListener("keydown", markPresent);
      window.removeEventListener("click", markPresent);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // ─── RAF dissolution loop ─────────────────────────────────
  useEffect(() => {
    if (!state) return;
    let running = true;

    const loop = (now: number) => {
      if (!running) return;
      const dt = Math.min(now - lastTimeRef.current, 200); // cap at 200ms
      lastTimeRef.current = now;

      const current = stateRef.current;
      if (!current || current.systemCoherence <= 0) {
        running = false;
        return;
      }

      const next = dissolveTick(current, dt, userPresentRef.current);
      stateRef.current = next;
      setState(next);

      // Persist every 15s
      if (next.tick % 900 === 0) { // ~15s at 60fps
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          fetch("/api/memory-ecosystem", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              memoryId,
              snapshot: {
                dissolution: next,
                updatedAt: Date.now(),
              },
            }),
          }).catch(() => {});
        }, 500);
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state !== null]);

  // ─── User interaction: pulse coherence ────────────────────
  const interact = useCallback((nodeId: string) => {
    const current = stateRef.current;
    if (!current) return;
    const next = userInteractionPulse(current, nodeId);
    stateRef.current = next;
    setState(next);
  }, []);

  // ─── AI observation: minimal, receding ────────────────────
  const aiObserve = useCallback((): string | null => {
    const current = stateRef.current;
    if (!current) return null;
    return aiObservation(current);
  }, []);

  return { state, loading, interact, aiObserve };
}
