"use client";

import { useRef, useCallback, useEffect, useState } from "react";

type Stage = {
  name: string;
  start: number;   // ms
  end: number;     // ms
};

type TimelineStage = {
  name: string;
  progress: number;    // 0..1 within stage
  elapsed: number;     // ms since stage start
  active: boolean;
  done: boolean;
};

export default function useAnimationTimeline(
  stages: Stage[],
  totalMs: number
) {
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);

  const start = useCallback(() => {
    startRef.current = performance.now();
    setElapsed(0);
    setDone(false);

    const tick = () => {
      if (startRef.current == null) return;
      const now = performance.now();
      const e = now - startRef.current;
      setElapsed(Math.min(e, totalMs));
      if (e >= totalMs) {
        setDone(true);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [totalMs]);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    setElapsed(0);
    setDone(false);
  }, []);

  useEffect(() => {
    const raf = rafRef.current;
    start();
    return () => cancelAnimationFrame(raf);
  }, [start]);

  const stageStates: TimelineStage[] = stages.map((s) => {
    const active = elapsed >= s.start && elapsed < s.end;
    const d = elapsed < s.start;
    const stageElapsed = active
      ? elapsed - s.start
      : d
        ? 0
        : s.end - s.start;
    const duration = s.end - s.start;
    const progress = Math.min(stageElapsed / duration, 1);
    return {
      name: s.name,
      progress: active ? progress : d ? 0 : 1,
      elapsed: stageElapsed,
      active,
      done: !d && elapsed >= s.end,
    };
  });

  const globalProgress = totalMs > 0 ? Math.min(elapsed / totalMs, 1) : 0;

  return {
    elapsed,
    globalProgress,
    stages: stageStates,
    done,
    getStage: (name: string) => stageStates.find((s) => s.name === name),
    reset,
  };
}
