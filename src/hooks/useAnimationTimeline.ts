"use client";
import { useEffect, useRef, useState, useCallback } from "react";

export interface TimelinePhase {
  name: string;
  start: number;
  end: number;
  onEnter?: () => void;
  onExit?: () => void;
}

export function useAnimationTimeline(
  phases: TimelinePhase[],
  totalDuration: number,
  onComplete?: () => void
) {
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const completedRef = useRef(false);
  const enteredPhases = useRef(new Set<string>());

  const progress = useCallback((t: number) => Math.min(1, Math.max(0, t)), []);

  const phaseProgress = useCallback((start: number, end: number) => {
    if (elapsed < start) return 0;
    if (elapsed >= end) return 1;
    return (elapsed - start) / (end - start);
  }, [elapsed]);

  const currentPhase = phases.find(
    (p) => elapsed >= p.start && elapsed < p.end
  )?.name ?? "idle";

  useEffect(() => {
    startRef.current = performance.now();
    const tick = () => {
      const t = (performance.now() - startRef.current) / 1000;
      const clamped = Math.min(t, totalDuration);
      setElapsed(clamped);

      // Phase enter callbacks
      for (const p of phases) {
        if (clamped >= p.start && !enteredPhases.current.has(p.name)) {
          enteredPhases.current.add(p.name);
          p.onEnter?.();
        }
        if (clamped >= p.end && enteredPhases.current.has(p.name) && !completedRef.current) {
          p.onExit?.();
        }
      }

      if (clamped >= totalDuration && !completedRef.current) {
        completedRef.current = true;
        setTimeout(() => onComplete?.(), 100);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return { elapsed, progress: progress(elapsed / totalDuration), currentPhase, phaseProgress };
}