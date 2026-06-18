"use client";
import { useRef, useEffect, useState } from "react";

export interface NodeDrift {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

function seedRandom(s: number) {
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

export default function useMemoryField(count: number) {
  const [drifts, setDrifts] = useState<NodeDrift[]>([]);
  const seedsRef = useRef<Array<() => number>>([]);
  const tRef = useRef(0);
  const rafRef = useRef(0);
  const activeRef = useRef(false);

  // 为每个节点生成独立的 seed
  if (seedsRef.current.length !== count) {
    seedsRef.current = Array.from({ length: count }, (_, i) => seedRandom(i * 7919 + 1));
  }

  useEffect(() => {
    activeRef.current = true;
    const tick = () => {
      if (!activeRef.current) return;
      tRef.current += 0.016;
      const t = tRef.current;

      const next = seedsRef.current.map((rnd) => ({
        x: Math.sin(t * 0.3 + rnd() * 10) * (2 + rnd() * 4),
        y: Math.cos(t * 0.25 + rnd() * 8) * (3 + rnd() * 5),
        scale: 1 + Math.sin(t * 0.4 + rnd() * 6) * 0.08,
        opacity: 0.5 + Math.sin(t * 0.35 + rnd() * 7) * 0.2,
      }));

      setDrifts(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { activeRef.current = false; cancelAnimationFrame(rafRef.current); };
  }, [count]);

  return drifts;
}